"""Repository domain service: ingestion lifecycle + reads, returning `*Result` schemas.

The route layer calls this; it never touches SQLAlchemy or HTTP. The clone → analyze pipeline
coordinates the Repository aggregate with the Substrate analysis service (service-to-service, not
another domain's repository).
"""

from __future__ import annotations

import logging
import shutil
import uuid
from pathlib import Path

from git.exc import InvalidGitRepositoryError, NoSuchPathError
from sqlalchemy.orm import Session

from hobits.core.exceptions import ConflictError, NotFoundError
from hobits.core.pagination import Page, PaginationParams
from hobits.core.settings import get_settings
from hobits.domain.connections.domain import AuthMethod, GitProvider
from hobits.domain.connections.services import ConnectionService
from hobits.domain.repository.domain import IngestionStatus, Repository, RepoUrl
from hobits.domain.repository.repositories import SqlRepositoryRepository
from hobits.domain.repository.schemas import (
    BranchesResult,
    BranchNamesResult,
    RepositoryResult,
)
from hobits.domain.substrate.services import AnalysisService
from hobits.integrations.git_branches import inspect_branches, list_branch_names
from hobits.integrations.git_clone import (
    DirtyWorkingTreeError,
    GitCloneService,
    ensure_clean,
)
from hobits.integrations.git_history import build_scan_context
from hobits.integrations.git_providers.registry import get_connector
from hobits.integrations.github import GithubProviderClient

logger = logging.getLogger(__name__)


def _within(path: Path, root: Path) -> bool:
    """True if `path` is inside `root` — a guard so we only delete clones we created."""
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except (ValueError, OSError):
        return False


class RepositoryService:
    """Business logic for repositories. Constructed per request from a DB session."""

    def __init__(self, session: Session) -> None:
        settings = get_settings()
        settings.ensure_dirs()
        self._repos = SqlRepositoryRepository(session)
        self._clone = GitCloneService(settings.clone_root)
        self._provider = GithubProviderClient(settings.github_token)
        self._connections = ConnectionService(session)
        self._analysis = AnalysisService(session)
        self._build_context = build_scan_context

    # --- reads ----------------------------------------------------------------
    def list(self, params: PaginationParams) -> Page[RepositoryResult]:
        total = self._repos.count()
        repos = self._repos.list(limit=params.limit, offset=params.offset)
        items = [RepositoryResult.of(r) for r in repos]
        return Page.create(items, total, params)

    def get(self, repository_id: uuid.UUID) -> RepositoryResult:
        repo = self._repos.get(repository_id)
        if repo is None:
            raise NotFoundError("Repository not found")
        return RepositoryResult.of(repo)

    def branches(self, repository_id: uuid.UUID) -> BranchesResult:
        """Live branch overview computed from the clone on disk (best-effort fetch first)."""
        repo = self._repos.get(repository_id)
        if repo is None:
            raise NotFoundError("Repository not found")
        if not repo.clone_path or not Path(repo.clone_path).is_dir():
            raise ConflictError("Repository has not been cloned yet")
        try:
            inspection = inspect_branches(
                Path(repo.clone_path),
                repo.default_branch,
                provider_is_local=repo.coordinates.provider is GitProvider.local,
            )
        except (InvalidGitRepositoryError, NoSuchPathError) as exc:
            raise ConflictError("Repository clone is not a valid git repository") from exc
        return BranchesResult.of(inspection, repo.default_branch)

    def branch_names(self, repository_id: uuid.UUID) -> BranchNamesResult:
        """The cheap full branch-name list (one `for-each-ref`) — feeds branch pickers."""
        repo = self._repos.get(repository_id)
        if repo is None:
            raise NotFoundError("Repository not found")
        if not repo.clone_path or not Path(repo.clone_path).is_dir():
            raise ConflictError("Repository has not been cloned yet")
        try:
            names = list_branch_names(
                Path(repo.clone_path),
                provider_is_local=repo.coordinates.provider is GitProvider.local,
            )
        except (InvalidGitRepositoryError, NoSuchPathError) as exc:
            raise ConflictError("Repository clone is not a valid git repository") from exc
        return BranchNamesResult(default_branch=repo.default_branch, branches=names)

    # --- ingestion ------------------------------------------------------------
    def ingest(
        self,
        url: str,
        connection_id: uuid.UUID | None = None,
        tool_ids: list[str] | None = None,
    ) -> RepositoryResult:
        repo = self._ingest(url, connection_id, tool_ids)
        return RepositoryResult.of(repo)

    def remote_head(self, repository_id: uuid.UUID) -> str | None:
        """The remote's current HEAD commit for this repo's *active* branch (cheap `ls-remote`,
        no clone), using the same auth path as ingestion. None if offline/unresolvable."""
        repo = self._repos.get(repository_id)
        if repo is None:
            raise NotFoundError("Repository not found")
        clone_url, _ = self._authenticate(repo.url.value, repo.connection_id)
        return self._clone.remote_head(clone_url, repo.current_branch or repo.default_branch)

    def refresh(self, repository_id: uuid.UUID) -> RepositoryResult:
        """Pull the latest on the active branch and re-analyze. Never checks a branch out —
        local repos adopt whatever the user has on disk (safe for unattended scheduled runs)."""
        existing = self._repos.get(repository_id)
        if existing is None:
            raise NotFoundError("Repository not found")
        repo = self._ingest(existing.url.value, existing.connection_id)
        return RepositoryResult.of(repo)

    def switch_branch(self, repository_id: uuid.UUID, branch: str) -> RepositoryResult:
        """Make `branch` the repo's active branch: check it out, clear every generated artifact
        (they reflect the old branch), and re-run the full analysis pipeline. Blocking, like
        refresh. For local-provider repos this moves the user's own checkout — an explicit
        action, refused while their working tree is dirty."""
        repo = self._repos.get(repository_id)
        if repo is None:
            raise NotFoundError("Repository not found")
        if repo.status in (IngestionStatus.cloning, IngestionStatus.analyzing):
            raise ConflictError("Repository is busy (cloning/analyzing) — try again shortly.")
        if not repo.clone_path or not Path(repo.clone_path).is_dir():
            raise ConflictError("Repository has not been cloned yet")

        names = list_branch_names(
            Path(repo.clone_path),
            provider_is_local=repo.coordinates.provider is GitProvider.local,
        )
        if branch not in names:
            raise NotFoundError(f"Branch '{branch}' not found")
        if branch == (repo.current_branch or repo.default_branch):
            return RepositoryResult.of(repo)

        # Pre-flight the dirty check here so the common local-repo failure is a clean 409 that
        # never flips the repository to `failed`. (The checkout itself re-checks — see git_clone.)
        if repo.coordinates.provider is GitProvider.local:
            try:
                ensure_clean(Path(repo.clone_path))
            except DirtyWorkingTreeError as exc:
                raise ConflictError(str(exc)) from exc

        # Everything generated so far describes the old branch.
        self._analysis.clear_artifacts(repository_id)

        repo.current_branch = branch
        self._repos.save(repo)
        repo = self._run_pipeline(repo, repo.url.value, branch=branch)
        return RepositoryResult.of(repo)

    def delete(self, repository_id: uuid.UUID) -> None:
        """Delete a repository and everything derived from it: analysis snapshots + on-disk
        artifacts (via the substrate service), the FK-cascaded rows (context, tool links, hobit
        assignments/runs, briefing items), and the clone we created. A *local* repo's own working
        tree is never touched — only clones under our clone_root are removed."""
        repo = self._repos.get(repository_id)
        if repo is None:
            raise NotFoundError("Repository not found")

        if (
            repo.coordinates.provider is not GitProvider.local
            and repo.clone_path
            and _within(Path(repo.clone_path), get_settings().clone_root)
        ):
            shutil.rmtree(repo.clone_path, ignore_errors=True)

        self._analysis.delete_for_repository(repository_id)
        self._repos.delete(repository_id)

    def _ingest(
        self,
        url: str,
        connection_id: uuid.UUID | None = None,
        tool_ids: list[str] | None = None,
    ) -> Repository:
        """Register → clone → analyze → ready. On failure, persist the error state (no raise)."""
        repo_url, coordinates = RepoUrl.parse(url)
        repository = self._repos.get_by_coordinates(coordinates)
        if repository is None:
            repository = Repository(
                coordinates=coordinates, url=repo_url, connection_id=connection_id
            )
            self._repos.add(repository)
        elif connection_id is not None:
            repository.connection_id = connection_id

        return self._run_pipeline(repository, url, tool_ids=tool_ids)

    def _run_pipeline(
        self,
        repository: Repository,
        url: str,
        *,
        branch: str | None = None,
        tool_ids: list[str] | None = None,
    ) -> Repository:
        """Clone/update (optionally checking out `branch`) → analyze → ready; failures persist
        the error state (no raise). Shared by ingest, refresh, and switch_branch."""
        first_ingest = repository.clone_path is None
        repository.mark_cloning()
        self._repos.save(repository)

        try:
            clone_url, provider_client = self._authenticate(url, repository.connection_id)
            outcome = self._clone.clone(
                clone_url, coordinates=repository.coordinates, branch=branch
            )
            metadata = provider_client.fetch_metadata(url)
            if metadata and metadata.default_branch:
                default_branch = metadata.default_branch
            elif first_ingest:
                default_branch = outcome.default_branch
            else:
                # The clone reports its *active* branch — don't let a switch drift the default.
                default_branch = repository.default_branch

            repository.mark_cloned(outcome.clone_path, default_branch, outcome.active_branch)
            repository.mark_analyzing()
            self._repos.save(repository)

            # Pin the chosen tools before analysis so the language auto-link is bypassed.
            if tool_ids is not None:
                self._analysis.set_integrations(repository.id, set(tool_ids))

            ctx = self._build_context(Path(outcome.clone_path), outcome.head_sha, url)
            self._analysis.analyze(repository.id, ctx)

            repository.mark_ready(outcome.head_sha)
            self._repos.save(repository)
        except Exception as exc:
            logger.exception("Ingestion failed for %s", url)
            repository.mark_failed(str(exc))
            self._repos.save(repository)
        return repository

    def _authenticate(
        self, url: str, connection_id: uuid.UUID | None
    ) -> tuple[str, GithubProviderClient]:
        """Resolve the clone URL + metadata client for a repo.

        No connection → the plain URL and the default (env-token) GitHub client, exactly as
        before. With a connection → credentials are injected into the clone URL via the provider
        connector, and a GitHub token connection also gets a token-scoped metadata client.
        """
        if connection_id is None:
            return url, self._provider
        credential = self._connections.resolve_credential(connection_id)
        if credential is None:
            return url, self._provider
        connector = get_connector(credential.provider)
        clone_url = connector.authenticated_url(url, credential)
        provider_client = self._provider
        if credential.provider is GitProvider.github and credential.auth_method is AuthMethod.token:
            provider_client = GithubProviderClient(credential.secret)
        return clone_url, provider_client
