"""Application service: end-to-end ingestion (register → clone → analyze → ready).

Coordinates the Repository aggregate lifecycle with the Substrate analysis pipeline. Runs inside
a single unit of work; on failure it records the error on the aggregate (no exception escapes, so
the failed state is persisted).
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from pathlib import Path

from hobits.repository.domain.models import Repository
from hobits.repository.domain.ports import (
    CloneService,
    GitProviderClient,
    RepositoryRepository,
)
from hobits.repository.domain.value_objects import RepoUrl
from hobits.substrate.application.analyze import AnalyzeRepositoryService
from hobits.substrate.domain.models import Analysis
from hobits.substrate.domain.ports import ScanContext

logger = logging.getLogger(__name__)

ScanContextBuilder = Callable[[Path, str], ScanContext]


class IngestRepositoryService:
    def __init__(
        self,
        repo_repo: RepositoryRepository,
        clone_service: CloneService,
        analyze_service: AnalyzeRepositoryService,
        context_builder: ScanContextBuilder,
        provider_client: GitProviderClient | None = None,
    ) -> None:
        self._repos = repo_repo
        self._clone = clone_service
        self._analyze = analyze_service
        self._build_context = context_builder
        self._provider = provider_client

    def ingest(self, url: str) -> tuple[Repository, Analysis | None]:
        repo_url, coordinates = RepoUrl.parse(url)
        repository = self._repos.get_by_coordinates(coordinates)
        if repository is None:
            repository = Repository(coordinates=coordinates, url=repo_url)
            self._repos.add(repository)

        repository.mark_cloning()
        self._repos.save(repository)

        try:
            outcome = self._clone.clone(url, coordinates)
            default_branch = outcome.default_branch
            if self._provider is not None:
                metadata = self._provider.fetch_metadata(url)
                if metadata and metadata.default_branch:
                    default_branch = metadata.default_branch

            repository.mark_cloned(outcome.clone_path, default_branch)
            repository.mark_analyzing()
            self._repos.save(repository)

            ctx = self._build_context(Path(outcome.clone_path), outcome.head_sha)
            analysis = self._analyze.analyze(repository.id, ctx)

            repository.mark_ready(outcome.head_sha)
            self._repos.save(repository)
            return repository, analysis
        except Exception as exc:
            logger.exception("Ingestion failed for %s", url)
            repository.mark_failed(str(exc))
            self._repos.save(repository)
            return repository, None
