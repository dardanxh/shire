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

from shire.core.exceptions import ConflictError, NotFoundError, ValidationError
from shire.core.pagination import Page, PaginationParams
from shire.core.settings import get_settings
from shire.domain.connections.domain import AuthMethod, GitProvider
from shire.domain.connections.services import ConnectionService
from shire.domain.jobs import kinds as job_kinds
from shire.domain.jobs.models import JobRow
from shire.domain.jobs.repositories import SqlJobRepository
from shire.domain.jobs.schemas import JobUsage
from shire.domain.jobs.services import JobService
from shire.domain.repository.domain import IngestionStatus, Repository, RepoUrl
from shire.domain.repository.repositories import SqlRepositoryRepository
from shire.domain.repository.schemas import (
    BranchesResult,
    BranchNamesResult,
    QuestionResult,
    RepositoryResult,
)
from shire.domain.substrate.services import AnalysisService
from shire.integrations.git_branches import inspect_branches, list_branch_names
from shire.integrations.git_clone import (
    DirtyWorkingTreeError,
    GitCloneService,
    ensure_clean,
)
from shire.integrations.git_history import build_scan_context
from shire.integrations.git_providers.registry import get_connector
from shire.integrations.github import GithubProviderClient

logger = logging.getLogger(__name__)


def _within(path: Path, root: Path) -> bool:
    """True if `path` is inside `root` — a guard so we only delete clones we created."""
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except (ValueError, OSError):
        return False


_QUESTION_PROMPT = """\
You are answering a developer's question about the repository **{slug}**. Explore the actual \
code with your Read, Grep and Glob tools to verify before answering — do not answer from \
assumptions alone.

## Repository context (precomputed — orientation only, verify against the code)
{context}

## Question
{question}

Answer concisely. Ground every claim in code you actually inspected and cite concrete file \
paths (like `src/module/file.py`) where relevant. Use short paragraphs and bullet lists; no \
headings. If the repository doesn't contain enough information to answer, say so plainly."""


def _question_prompt(slug: str, context_md: str, question: str) -> str:
    return _QUESTION_PROMPT.format(slug=slug, context=context_md, question=question)


def _question_of(row: JobRow) -> QuestionResult:
    usage = JobUsage.model_validate(row.usage) if row.usage else None
    return QuestionResult(
        job_id=row.id,
        question=(row.payload or {}).get("question", row.title),
        answer=row.result,
        status=row.status,
        error=row.error,
        created_at=row.created_at,
        finished_at=row.finished_at,
        duration_seconds=row.duration_seconds,
        total_tokens=usage.total_tokens if usage else None,
    )


class RepositoryService:
    """Business logic for repositories. Constructed per request from a DB session."""

    def __init__(self, session: Session) -> None:
        settings = get_settings()
        settings.ensure_dirs()
        self._session = session
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
    def ingest(self, url: str, connection_id: uuid.UUID | None = None) -> RepositoryResult:
        """Register the repository (or re-adopt an existing row) and return immediately.
        The clone→analyze pipeline runs as a background task (see `run_ingest_pipeline`);
        clients poll the repository's `status` until it settles."""
        repo_url, coordinates = RepoUrl.parse(url)
        repository = self._repos.get_by_coordinates(coordinates)
        if repository is not None and repository.status in (
            IngestionStatus.cloning,
            IngestionStatus.analyzing,
        ):
            raise ConflictError("Repository is busy (cloning/analyzing) — try again shortly.")
        if repository is None:
            repository = Repository(
                coordinates=coordinates, url=repo_url, connection_id=connection_id
            )
            self._repos.add(repository)
        elif connection_id is not None:
            repository.connection_id = connection_id
        # Progress is visible from the first list render; doubles as the double-submit guard.
        repository.mark_cloning()
        self._repos.save(repository)
        # Commit NOW: the request session's teardown commit runs after background tasks, so a
        # pending "cloning" mutation left here would overwrite the pipeline's final status.
        self._session.commit()
        return RepositoryResult.of(repository)

    def remote_head(self, repository_id: uuid.UUID) -> str | None:
        """The remote's current HEAD commit for this repo's *active* branch (cheap `ls-remote`,
        no clone), using the same auth path as ingestion. None if offline/unresolvable."""
        repo = self._repos.get(repository_id)
        if repo is None:
            raise NotFoundError("Repository not found")
        clone_url, _ = self._authenticate(repo.url.value, repo.connection_id)
        return self._clone.remote_head(clone_url, repo.current_branch or repo.default_branch)

    def refresh(self, repository_id: uuid.UUID) -> RepositoryResult:
        """Mark the repo for a pull + re-analysis and return immediately — the pipeline runs as
        a background task. Never checks a branch out; local repos adopt whatever the user has on
        disk (safe for unattended scheduled runs)."""
        repo = self._repos.get(repository_id)
        if repo is None:
            raise NotFoundError("Repository not found")
        if repo.status in (IngestionStatus.cloning, IngestionStatus.analyzing):
            raise ConflictError("Repository is busy (cloning/analyzing) — try again shortly.")
        repo.mark_cloning()
        self._repos.save(repo)
        # Commit NOW — see `ingest` for why (teardown commit runs after the background task).
        self._session.commit()
        return RepositoryResult.of(repo)

    # --- ask ("chat with the repo") --------------------------------------------
    def ask_question(self, repository_id: uuid.UUID, question: str) -> QuestionResult:
        """Enqueue a free-form question about this repository. The engine explores the clone
        (grounded by the context pack) and the answer lands on the job's result — questions
        need no domain rows of their own."""
        repo = self._repos.get(repository_id)
        if repo is None:
            raise NotFoundError("Repository not found")
        if not repo.clone_path or not Path(repo.clone_path).is_dir():
            raise ConflictError("Repository has not been cloned yet")
        question = question.strip()
        if not question:
            raise ValidationError("Question must not be empty")

        from shire.domain.context.services import ContextService

        try:
            context_md = ContextService(self._session).get_markdown(repository_id).effective
        except NotFoundError:
            context_md = "(no context pack yet — the repository has no completed analysis)"

        jobs = JobService(self._session)
        model, timeout_seconds = jobs.engine_defaults()
        row = jobs.enqueue(
            kind=job_kinds.REPO_QUESTION,
            title=f"Q: {question[:120]}{'…' if len(question) > 120 else ''}",
            prompt=_question_prompt(repo.coordinates.slug, context_md, question),
            payload={
                "cwd": repo.clone_path,
                "model": model,
                "timeout_seconds": timeout_seconds,
                "repository_id": str(repository_id),
                "question": question,
            },
            repository_id=repository_id,
        )
        return _question_of(row)

    def list_questions(self, repository_id: uuid.UUID) -> list[QuestionResult]:
        """The repo's asked questions, newest first (the Ask tab's poll target)."""
        if self._repos.get(repository_id) is None:
            raise NotFoundError("Repository not found")
        rows = SqlJobRepository(self._session).list(
            status=None,
            repository_id=repository_id,
            kind=job_kinds.REPO_QUESTION,
            limit=50,
            offset=0,
        )
        return [_question_of(row) for row in rows]

    def switch_branch(self, repository_id: uuid.UUID, branch: str) -> RepositoryResult:
        """Make `branch` the repo's active branch: check it out, clear every generated artifact
        (they reflect the old branch), and re-run the full analysis pipeline in the background
        (non-blocking, like refresh). For local-provider repos this moves the user's own
        checkout — an explicit action, refused while their working tree is dirty."""
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
        repo.mark_cloning()
        self._repos.save(repo)
        # Commit NOW — see `ingest` for why (teardown commit runs after the background task).
        self._session.commit()
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

    def run_pipeline(
        self,
        repository_id: uuid.UUID,
        *,
        branch: str | None = None,
        tool_ids: list[str] | None = None,
    ) -> None:
        """Run clone→analyze for an already-registered repository (the background-task body)."""
        repository = self._repos.get(repository_id)
        if repository is None:
            return
        self._run_pipeline(repository, repository.url.value, branch=branch, tool_ids=tool_ids)

    def _run_pipeline(
        self,
        repository: Repository,
        url: str,
        *,
        branch: str | None = None,
        tool_ids: list[str] | None = None,
    ) -> Repository:
        """Clone/update (optionally checking out `branch`) → analyze → ready; failures persist
        the error state (no raise). Runs on a background-task session — each phase transition
        commits so pollers see cloning → analyzing → ready as it happens."""
        first_ingest = repository.clone_path is None
        repository.mark_cloning()
        self._repos.save(repository)
        self._session.commit()

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
            self._session.commit()

            # Pin the chosen tools before analysis so the language auto-link is bypassed.
            if tool_ids is not None:
                self._analysis.set_integrations(repository.id, set(tool_ids))

            ctx = self._build_context(Path(outcome.clone_path), outcome.head_sha, url)
            self._analysis.analyze(repository.id, ctx)

            repository.mark_ready(outcome.head_sha)
            self._repos.save(repository)
            self._session.commit()
        except Exception as exc:
            logger.exception("Ingestion failed for %s", url)
            # Discard whatever the failed phase half-wrote before persisting the error state.
            self._session.rollback()
            repository.mark_failed(str(exc))
            self._repos.save(repository)
            self._session.commit()
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


def run_ingest_pipeline(
    repository_id: uuid.UUID,
    *,
    branch: str | None = None,
    tool_ids: list[str] | None = None,
) -> None:
    """Background-task entry point for ingest/refresh/branch-switch: run the clone→analyze
    pipeline on its own transactional session. Phase transitions commit inside `_run_pipeline`
    so pollers see cloning → analyzing → ready/failed as they happen."""
    from shire.core.db import unit_of_work

    logger.info("Ingest pipeline started for %s", repository_id)
    with unit_of_work() as session:
        RepositoryService(session).run_pipeline(
            repository_id, branch=branch, tool_ids=tool_ids
        )
    logger.info("Ingest pipeline finished for %s", repository_id)
