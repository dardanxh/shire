"""Repository domain service: ingestion lifecycle + reads, returning `*Result` schemas.

The route layer calls this; it never touches SQLAlchemy or HTTP. The clone → analyze pipeline
coordinates the Repository aggregate with the Substrate analysis service (service-to-service, not
another domain's repository).
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from hobits.core.exceptions import NotFoundError
from hobits.core.pagination import Page, PaginationParams
from hobits.core.settings import get_settings
from hobits.domain.connections.domain import AuthMethod, GitProvider
from hobits.domain.connections.services import ConnectionService
from hobits.domain.repository.domain import Repository, RepoUrl
from hobits.domain.repository.repositories import SqlRepositoryRepository
from hobits.domain.repository.schemas import RepositoryResult
from hobits.domain.substrate.services import AnalysisService
from hobits.integrations.git_clone import GitCloneService
from hobits.integrations.git_history import build_scan_context
from hobits.integrations.git_providers.registry import get_connector
from hobits.integrations.github import GithubProviderClient

logger = logging.getLogger(__name__)


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

    # --- ingestion ------------------------------------------------------------
    def ingest(self, url: str, connection_id: uuid.UUID | None = None) -> RepositoryResult:
        repo = self._ingest(url, connection_id)
        return RepositoryResult.of(repo)

    def refresh(self, repository_id: uuid.UUID) -> RepositoryResult:
        existing = self._repos.get(repository_id)
        if existing is None:
            raise NotFoundError("Repository not found")
        repo = self._ingest(existing.url.value, existing.connection_id)
        return RepositoryResult.of(repo)

    def _ingest(self, url: str, connection_id: uuid.UUID | None = None) -> Repository:
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

        repository.mark_cloning()
        self._repos.save(repository)

        try:
            clone_url, provider_client = self._authenticate(url, repository.connection_id)
            outcome = self._clone.clone(clone_url, coordinates)
            default_branch = outcome.default_branch
            metadata = provider_client.fetch_metadata(url)
            if metadata and metadata.default_branch:
                default_branch = metadata.default_branch

            repository.mark_cloned(outcome.clone_path, default_branch)
            repository.mark_analyzing()
            self._repos.save(repository)

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
