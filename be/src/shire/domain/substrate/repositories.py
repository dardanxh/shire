"""Data access for the Analysis aggregate and its child collections."""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, func, insert, select
from sqlalchemy.orm import Session

from shire.domain.substrate.domain import (
    Analysis,
    AnalysisStatus,
    CiCdConfig,
    CiCdSystem,
    CommitRecord,
    Contributor,
    DailyCommitCount,
    Dependency,
    DependencySource,
    Ecosystem,
    Enrichment,
    HealthCheck,
    Hotspot,
    LanguageStat,
    LicenseInfo,
    Rating,
    Ratings,
    RepositoryFacts,
    ToolRun,
    Vulnerability,
)
from shire.domain.substrate.models import (
    AnalysisDeltaNoteRow,
    AnalysisRow,
    ArtifactVersionRow,
    CiCdRow,
    CommitActivityRow,
    CommitRecordRow,
    ContributorRow,
    DependencyRow,
    HealthCheckRow,
    HotspotRow,
    LanguageStatRow,
    RepositoryToolRow,
    ToolRunRow,
    VulnerabilityRow,
)


def _dependency_row(dep: Dependency) -> DependencyRow:
    return DependencyRow(
        ecosystem=dep.ecosystem.value,
        name=dep.name,
        version=dep.version,
        manifest_file=dep.manifest_file,
        is_dev=dep.is_dev,
        source=dep.source.value,
        latest_version=dep.latest_version,
    )


def _dependency_key(name: str, version: str | None) -> tuple[str, str]:
    """Identity of a declared dependency: same package, same declared version — whatever
    ecosystem or manifest it turned up in. Used to keep engine scans from re-adding what the
    deterministic scanners already found."""
    return name.strip().lower(), (version or "").strip()


def _to_domain(row: AnalysisRow) -> Analysis:
    return Analysis(
        id=row.id,
        repository_id=row.repository_id,
        commit_sha=row.commit_sha,
        status=AnalysisStatus(row.status),
        analyzed_at=row.analyzed_at,
        facts=RepositoryFacts(
            first_commit_at=row.first_commit_at,
            last_commit_at=row.last_commit_at,
            commit_count=row.commit_count,
            contributor_count=row.contributor_count,
            loc_total=row.loc_total,
            primary_language=row.primary_language,
            license=LicenseInfo(
                spdx_id=row.license_spdx,
                name=row.license_name,
                source_file=row.license_source_file,
            ),
            has_tests=row.has_tests,
            dependency_count=row.dependency_count,
        ),
        contributors=[
            Contributor(
                id=c.id,
                name=c.name,
                email=c.email,
                commits=c.commits,
                lines_added=c.lines_added,
                lines_removed=c.lines_removed,
                files_touched=c.files_touched,
                first_commit_at=c.first_commit_at,
                last_commit_at=c.last_commit_at,
            )
            for c in row.contributors
        ],
        commit_activity=[DailyCommitCount(day=a.day, count=a.count) for a in row.commit_activity],
        languages=[
            LanguageStat(language=x.language, loc=x.loc, files=x.files, pct=x.pct)
            for x in row.languages
        ],
        dependencies=[
            Dependency(
                ecosystem=Ecosystem(d.ecosystem),
                name=d.name,
                version=d.version,
                manifest_file=d.manifest_file,
                is_dev=d.is_dev,
                source=DependencySource(d.source),
                latest_version=d.latest_version,
            )
            for d in row.dependencies
        ],
        cicd=[
            CiCdConfig(system=CiCdSystem(c.system), config_files=tuple(c.config_files))
            for c in row.cicd
        ],
        hotspots=[
            Hotspot(path=h.path, churn=h.churn, size=h.size, score=h.score) for h in row.hotspots
        ],
        enrichment=Enrichment(
            code_lines=row.code_lines,
            complexity_total=row.complexity_total,
            cocomo_cost_usd=row.cocomo_cost_usd,
            schedule_months=row.schedule_months,
            ccn_average=row.ccn_average,
            ccn_max=row.ccn_max,
            function_count=row.function_count,
            high_complexity_count=row.high_complexity_count,
            maintainability_index=row.maintainability_index,
            sbom_package_count=row.sbom_package_count,
            vulnerability_count=row.vulnerability_count,
            vuln_critical=row.vuln_critical,
            vuln_high=row.vuln_high,
            vuln_moderate=row.vuln_moderate,
            vuln_low=row.vuln_low,
            secret_count=row.secret_count,
            health_score=row.health_score,
            test_count=row.test_count,
            test_file_count=row.test_file_count,
            test_to_code_ratio=row.test_to_code_ratio,
            assertion_density=row.assertion_density,
            test_frameworks=row.test_frameworks,
            test_coverage_pct=row.test_coverage_pct,
            lint_issue_count=row.lint_issue_count,
            sast_issue_count=row.sast_issue_count,
            sast_high=row.sast_high,
            sast_medium=row.sast_medium,
            sast_low=row.sast_low,
            dead_code_count=row.dead_code_count,
            bus_factor=row.bus_factor,
            top_author_share=row.top_author_share,
            active_contributor_count=row.active_contributor_count,
            commits_last_90d=row.commits_last_90d,
            days_since_last_commit=row.days_since_last_commit,
            maintenance_status=row.maintenance_status,
            ratings=Ratings(
                maintainability=Rating(row.rating_maintainability),
                security=Rating(row.rating_security),
                health=Rating(row.rating_health),
            ),
        ),
        vulnerabilities=[
            Vulnerability(
                package=v.package,
                ecosystem=v.ecosystem,
                version=v.version,
                vuln_id=v.vuln_id,
                severity=v.severity,
                fixed_version=v.fixed_version,
            )
            for v in row.vulnerabilities
        ],
        health_checks=[
            HealthCheck(name=h.name, score=h.score, reason=h.reason) for h in row.health_checks
        ],
        tool_runs=[
            ToolRun(name=t.name, available=t.available, contributed=t.contributed, log=t.log)
            for t in row.tool_runs
        ],
    )


def _build_row(analysis: Analysis) -> AnalysisRow:
    f = analysis.facts
    e = analysis.enrichment
    row = AnalysisRow(
        id=analysis.id,
        repository_id=analysis.repository_id,
        commit_sha=analysis.commit_sha,
        status=analysis.status.value,
        analyzed_at=analysis.analyzed_at,
        first_commit_at=f.first_commit_at,
        last_commit_at=f.last_commit_at,
        commit_count=f.commit_count,
        contributor_count=f.contributor_count,
        loc_total=f.loc_total,
        primary_language=f.primary_language,
        license_spdx=f.license.spdx_id,
        license_name=f.license.name,
        license_source_file=f.license.source_file,
        has_tests=f.has_tests,
        dependency_count=f.dependency_count,
        code_lines=e.code_lines,
        complexity_total=e.complexity_total,
        cocomo_cost_usd=e.cocomo_cost_usd,
        schedule_months=e.schedule_months,
        ccn_average=e.ccn_average,
        ccn_max=e.ccn_max,
        function_count=e.function_count,
        high_complexity_count=e.high_complexity_count,
        maintainability_index=e.maintainability_index,
        sbom_package_count=e.sbom_package_count,
        vulnerability_count=e.vulnerability_count,
        vuln_critical=e.vuln_critical,
        vuln_high=e.vuln_high,
        vuln_moderate=e.vuln_moderate,
        vuln_low=e.vuln_low,
        secret_count=e.secret_count,
        health_score=e.health_score,
        test_count=e.test_count,
        test_file_count=e.test_file_count,
        test_to_code_ratio=e.test_to_code_ratio,
        assertion_density=e.assertion_density,
        test_frameworks=e.test_frameworks,
        test_coverage_pct=e.test_coverage_pct,
        lint_issue_count=e.lint_issue_count,
        sast_issue_count=e.sast_issue_count,
        sast_high=e.sast_high,
        sast_medium=e.sast_medium,
        sast_low=e.sast_low,
        dead_code_count=e.dead_code_count,
        bus_factor=e.bus_factor,
        top_author_share=e.top_author_share,
        active_contributor_count=e.active_contributor_count,
        commits_last_90d=e.commits_last_90d,
        days_since_last_commit=e.days_since_last_commit,
        maintenance_status=e.maintenance_status,
        rating_maintainability=e.ratings.maintainability.value,
        rating_security=e.ratings.security.value,
        rating_health=e.ratings.health.value,
    )
    row.contributors = [
        ContributorRow(
            id=c.id,
            name=c.name,
            email=c.email,
            commits=c.commits,
            lines_added=c.lines_added,
            lines_removed=c.lines_removed,
            files_touched=c.files_touched,
            first_commit_at=c.first_commit_at,
            last_commit_at=c.last_commit_at,
        )
        for c in analysis.contributors
    ]
    row.commit_activity = [
        CommitActivityRow(day=a.day, count=a.count) for a in analysis.commit_activity
    ]
    row.languages = [
        LanguageStatRow(language=x.language, loc=x.loc, files=x.files, pct=x.pct)
        for x in analysis.languages
    ]
    row.dependencies = [_dependency_row(d) for d in analysis.dependencies]
    row.cicd = [
        CiCdRow(system=c.system.value, config_files=list(c.config_files)) for c in analysis.cicd
    ]
    row.hotspots = [
        HotspotRow(path=h.path, churn=h.churn, size=h.size, score=h.score)
        for h in analysis.hotspots
    ]
    row.vulnerabilities = [
        VulnerabilityRow(
            package=v.package,
            ecosystem=v.ecosystem,
            version=v.version,
            vuln_id=v.vuln_id,
            severity=v.severity,
            fixed_version=v.fixed_version,
        )
        for v in analysis.vulnerabilities
    ]
    row.health_checks = [
        HealthCheckRow(name=h.name, score=h.score, reason=h.reason) for h in analysis.health_checks
    ]
    row.tool_runs = [
        ToolRunRow(name=t.name, available=t.available, contributed=t.contributed, log=t.log)
        for t in analysis.tool_runs
    ]
    return row


class SqlAnalysisRepository:
    """Concrete `AnalysisRepository` port bound to a SQLAlchemy session."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, analysis: Analysis) -> None:
        # Re-analysis of the same commit replaces the prior snapshot (idempotent).
        existing = self._session.scalars(
            select(AnalysisRow).where(
                AnalysisRow.repository_id == analysis.repository_id,
                AnalysisRow.commit_sha == analysis.commit_sha,
            )
        ).first()
        if existing is not None:
            self._session.delete(existing)
            self._session.flush()
        self._session.add(_build_row(analysis))

    def get(self, analysis_id: uuid.UUID) -> Analysis | None:
        row = self._session.get(AnalysisRow, analysis_id)
        return _to_domain(row) if row else None

    def delete_for_repository(self, repository_id: uuid.UUID) -> None:
        """Delete every analysis snapshot for a repo. Child rows (contributors, hotspots, tool
        runs, code chunks, …) cascade via their FK to analyses.id."""
        self._session.execute(
            delete(AnalysisRow).where(AnalysisRow.repository_id == repository_id)
        )

    def get_latest_for_repository(self, repository_id: uuid.UUID) -> Analysis | None:
        stmt = (
            select(AnalysisRow)
            .where(
                AnalysisRow.repository_id == repository_id,
                AnalysisRow.status == AnalysisStatus.complete.value,
            )
            .order_by(AnalysisRow.analyzed_at.desc())
            .limit(1)
        )
        row = self._session.scalars(stmt).first()
        return _to_domain(row) if row else None

    def list_meta_for_repository(self, repository_id: uuid.UUID) -> list[AnalysisRow]:
        """Every complete snapshot's scalar row, oldest first — history/trend reads.

        Returns raw rows (scalar columns only are meant to be read); callers must NOT touch
        child collections or the selectin loads defeat the point of this method.
        """
        stmt = (
            select(AnalysisRow)
            .where(
                AnalysisRow.repository_id == repository_id,
                AnalysisRow.status == AnalysisStatus.complete.value,
            )
            .order_by(AnalysisRow.analyzed_at.asc())
        )
        return list(self._session.scalars(stmt))

    def latest_complete_meta(self) -> list[tuple[uuid.UUID, uuid.UUID, int]]:
        """(repository_id, analysis_id, commit_count) of each repo's latest complete analysis.

        A scalar read (Postgres DISTINCT ON) for cross-repo lookups that must not pay the cost
        of materializing full aggregates.
        """
        stmt = (
            select(AnalysisRow.repository_id, AnalysisRow.id, AnalysisRow.commit_count)
            .where(AnalysisRow.status == AnalysisStatus.complete.value)
            .order_by(AnalysisRow.repository_id, AnalysisRow.analyzed_at.desc())
            .distinct(AnalysisRow.repository_id)
        )
        return [(rid, aid, count) for rid, aid, count in self._session.execute(stmt)]

    def latest_complete_stamps(self) -> list[tuple[uuid.UUID, uuid.UUID, datetime]]:
        """(repository_id, analysis_id, analyzed_at) of each repo's latest complete analysis.

        Sibling of `latest_complete_meta` for callers that need *when* rather than how many
        commits — same DISTINCT ON, same "don't materialize the aggregate" reason.
        """
        stmt = (
            select(AnalysisRow.repository_id, AnalysisRow.id, AnalysisRow.analyzed_at)
            .where(AnalysisRow.status == AnalysisStatus.complete.value)
            .order_by(AnalysisRow.repository_id, AnalysisRow.analyzed_at.desc())
            .distinct(AnalysisRow.repository_id)
        )
        return [(rid, aid, at) for rid, aid, at in self._session.execute(stmt)]

    def list_for_repository(self, repository_id: uuid.UUID) -> list[Analysis]:
        stmt = (
            select(AnalysisRow)
            .where(AnalysisRow.repository_id == repository_id)
            .order_by(AnalysisRow.analyzed_at.desc())
        )
        return [_to_domain(r) for r in self._session.scalars(stmt)]

    def merge_dependencies(self, repository_id: uuid.UUID, deps: list[Dependency]) -> int:
        """Fold externally discovered dependencies into the repo's latest complete snapshot.

        Deduped on (name, declared version): the same package at the same version is never added
        twice, whichever manifest or ecosystem it was found in — including within `deps` itself.
        A row that already exists but has no known latest version inherits one from its incoming
        duplicate, so an engine scan still improves what the parsers found. Returns the number of
        rows inserted; 0 when the repo has no snapshot to merge into.
        """
        stmt = (
            select(AnalysisRow)
            .where(
                AnalysisRow.repository_id == repository_id,
                AnalysisRow.status == AnalysisStatus.complete.value,
            )
            .order_by(AnalysisRow.analyzed_at.desc())
            .limit(1)
        )
        analysis = self._session.scalars(stmt).first()
        if analysis is None:
            return 0

        existing = {_dependency_key(r.name, r.version): r for r in analysis.dependencies}
        inserted = 0
        for dep in deps:
            key = _dependency_key(dep.name, dep.version)
            current = existing.get(key)
            if current is not None:
                if dep.latest_version and not current.latest_version:
                    current.latest_version = dep.latest_version
                continue
            row = _dependency_row(dep)
            analysis.dependencies.append(row)
            existing[key] = row
            inserted += 1
        analysis.dependency_count = len(analysis.dependencies)
        self._session.flush()
        return inserted

    def dependency_usage(self, name: str) -> list[tuple[uuid.UUID, str | None]]:
        """Cross-repo: which repositories depend on `name` (and at what versions)."""
        stmt = (
            select(AnalysisRow.repository_id, DependencyRow.version)
            .join(DependencyRow, DependencyRow.analysis_id == AnalysisRow.id)
            .where(
                DependencyRow.name == name,
                AnalysisRow.status == AnalysisStatus.complete.value,
            )
            .distinct()
        )
        return [(rid, ver) for rid, ver in self._session.execute(stmt).all()]


class SqlCommitRecordRepository:
    """Per-commit history rows, kept out of the Analysis aggregate on purpose.

    Histories run to tens of thousands of rows per repo, so they are bulk-inserted after the
    analysis row and read only through targeted queries — never materialized with the aggregate.
    Deletes ride the FK's ON DELETE CASCADE when an analysis is replaced or purged.
    """

    def __init__(self, session: Session) -> None:
        self._session = session

    def add_many(self, analysis_id: uuid.UUID, records: list[CommitRecord]) -> None:
        if not records:
            return
        # The freshly added analysis row must exist before its FK children.
        self._session.flush()
        self._session.execute(
            insert(CommitRecordRow),
            [
                {
                    "id": uuid.uuid4(),
                    "analysis_id": analysis_id,
                    "sha": record.sha,
                    "author_email": record.author_email,
                    "committed_at": record.committed_at,
                    "insertions": record.insertions,
                    "deletions": record.deletions,
                    "files_changed": record.files_changed,
                    "local_hour": record.local_hour,
                    "weekday": record.weekday,
                }
                for record in records
            ],
        )

    def for_emails(
        self, emails: list[str], analysis_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, list[CommitRecordRow]]:
        """One identity's commit rows (across its alias emails), grouped by analysis id."""
        if not analysis_ids or not emails:
            return {}
        rows = self._session.scalars(
            select(CommitRecordRow).where(
                CommitRecordRow.author_email.in_(emails),
                CommitRecordRow.analysis_id.in_(analysis_ids),
            )
        )
        grouped: dict[uuid.UUID, list[CommitRecordRow]] = {}
        for row in rows:
            grouped.setdefault(row.analysis_id, []).append(row)
        return grouped

    def analyses_with_records(self, analysis_ids: list[uuid.UUID]) -> set[uuid.UUID]:
        """Which of these analyses have any commit rows (i.e. postdate this feature)."""
        if not analysis_ids:
            return set()
        rows = self._session.execute(
            select(CommitRecordRow.analysis_id)
            .where(CommitRecordRow.analysis_id.in_(analysis_ids))
            .distinct()
        )
        return {analysis_id for (analysis_id,) in rows}

    def sha_authors_for_analysis(self, analysis_id: uuid.UUID) -> dict[str, str]:
        """sha -> author_email for one analysis's history (delta "new commits" rollup)."""
        rows = self._session.execute(
            select(CommitRecordRow.sha, CommitRecordRow.author_email).where(
                CommitRecordRow.analysis_id == analysis_id
            )
        )
        return dict(rows.all())

    def records_since(
        self, analysis_id: uuid.UUID, since: datetime, until: datetime | None = None
    ) -> list[tuple[str, datetime, int, int, int]]:
        """(author_email, committed_at, insertions, deletions, files_changed) rows of one
        analysis's history from `since` on (up to but excluding `until` when given) — the
        Pulse interval aggregation."""
        conditions = [
            CommitRecordRow.analysis_id == analysis_id,
            CommitRecordRow.committed_at >= since,
        ]
        if until is not None:
            conditions.append(CommitRecordRow.committed_at < until)
        rows = self._session.execute(
            select(
                CommitRecordRow.author_email,
                CommitRecordRow.committed_at,
                CommitRecordRow.insertions,
                CommitRecordRow.deletions,
                CommitRecordRow.files_changed,
            ).where(*conditions)
        )
        return [tuple(r) for r in rows.all()]

    def sha_line_stats_for_analysis(self, analysis_id: uuid.UUID) -> dict[str, tuple[int, int]]:
        """sha -> (insertions, deletions) for one analysis's history — sums the line churn
        of the delta's new commits (the Developments feed's +added/-deleted)."""
        rows = self._session.execute(
            select(
                CommitRecordRow.sha, CommitRecordRow.insertions, CommitRecordRow.deletions
            ).where(CommitRecordRow.analysis_id == analysis_id)
        )
        return {sha: (ins, dels) for sha, ins, dels in rows.all()}

    def daily_counts_by_analysis(
        self, analysis_ids: list[uuid.UUID], since: datetime
    ) -> dict[uuid.UUID, dict[datetime, int]]:
        """analysis_id -> day (date_trunc) -> commits, across the given analyses.

        One grouped read for the whole repositories table's activity sparklines.
        """
        if not analysis_ids:
            return {}
        day = func.date_trunc("day", CommitRecordRow.committed_at)
        rows = self._session.execute(
            select(CommitRecordRow.analysis_id, day, func.count())
            .where(
                CommitRecordRow.analysis_id.in_(analysis_ids),
                CommitRecordRow.committed_at >= since,
            )
            .group_by(CommitRecordRow.analysis_id, day)
        )
        grouped: dict[uuid.UUID, dict[datetime, int]] = {}
        for analysis_id, bucket, count in rows:
            grouped.setdefault(analysis_id, {})[bucket] = count
        return grouped

    def weekly_counts_by_email(
        self, analysis_ids: list[uuid.UUID], since: datetime
    ) -> dict[str, dict[datetime, int]]:
        """email -> week_start (date_trunc) -> commits, across the given analyses."""
        if not analysis_ids:
            return {}
        week = func.date_trunc("week", CommitRecordRow.committed_at)
        rows = self._session.execute(
            select(CommitRecordRow.author_email, week, func.count())
            .where(
                CommitRecordRow.analysis_id.in_(analysis_ids),
                CommitRecordRow.committed_at >= since,
            )
            .group_by(CommitRecordRow.author_email, week)
        )
        grouped: dict[str, dict[datetime, int]] = {}
        for email, week_start, count in rows:
            grouped.setdefault(email, {})[week_start] = count
        return grouped


class SqlArtifactVersionRepository:
    """Versioned history of Claude-produced repo artifacts. Append-only; identical
    regenerations (same content hash as the latest version of the same slot) are skipped."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def record(
        self,
        repository_id: uuid.UUID,
        artifact: str,
        kind: str,
        branch: str,
        commit_sha: str,
        content: dict,
    ) -> bool:
        """Append a version unless it's byte-identical to the slot's latest. Returns True
        when a new version row was written."""
        digest = _content_hash(content)
        latest = self._session.scalars(
            select(ArtifactVersionRow)
            .where(
                ArtifactVersionRow.repository_id == repository_id,
                ArtifactVersionRow.artifact == artifact,
                ArtifactVersionRow.kind == kind,
                ArtifactVersionRow.branch == branch,
            )
            .order_by(ArtifactVersionRow.created_at.desc())
            .limit(1)
        ).first()
        if latest is not None and latest.content_hash == digest:
            return False
        self._session.add(
            ArtifactVersionRow(
                repository_id=repository_id,
                artifact=artifact,
                kind=kind,
                branch=branch,
                commit_sha=commit_sha,
                content=content,
                content_hash=digest,
                created_at=datetime.now(UTC),
            )
        )
        return True

    def list(
        self, repository_id: uuid.UUID, artifact: str, kind: str | None = None
    ) -> list[ArtifactVersionRow]:
        stmt = (
            select(ArtifactVersionRow)
            .where(
                ArtifactVersionRow.repository_id == repository_id,
                ArtifactVersionRow.artifact == artifact,
            )
            .order_by(ArtifactVersionRow.created_at.desc())
        )
        if kind is not None:
            stmt = stmt.where(ArtifactVersionRow.kind == kind)
        return list(self._session.scalars(stmt))


class SqlAnalysisDeltaNoteRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(
        self, from_analysis_id: uuid.UUID, to_analysis_id: uuid.UUID
    ) -> AnalysisDeltaNoteRow | None:
        return self._session.scalars(
            select(AnalysisDeltaNoteRow).where(
                AnalysisDeltaNoteRow.from_analysis_id == from_analysis_id,
                AnalysisDeltaNoteRow.to_analysis_id == to_analysis_id,
            )
        ).first()

    def upsert(
        self,
        repository_id: uuid.UUID,
        from_analysis_id: uuid.UUID,
        to_analysis_id: uuid.UUID,
        narrative: str,
    ) -> AnalysisDeltaNoteRow:
        row = self.get(from_analysis_id, to_analysis_id)
        if row is None:
            row = AnalysisDeltaNoteRow(
                repository_id=repository_id,
                from_analysis_id=from_analysis_id,
                to_analysis_id=to_analysis_id,
                narrative=narrative,
                created_at=datetime.now(UTC),
            )
            self._session.add(row)
        else:
            row.narrative = narrative
            row.created_at = datetime.now(UTC)
        return row


def _content_hash(content: dict) -> str:
    return hashlib.sha256(
        json.dumps(content, sort_keys=True, default=str).encode()
    ).hexdigest()


class SqlRepositoryToolRepository:
    """Per-repo linked-integration allow-list."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def linked_ids(self, repository_id: uuid.UUID) -> set[str]:
        stmt = select(RepositoryToolRow.tool_id).where(
            RepositoryToolRow.repository_id == repository_id
        )
        return set(self._session.scalars(stmt))

    def has_any(self, repository_id: uuid.UUID) -> bool:
        stmt = (
            select(func.count())
            .select_from(RepositoryToolRow)
            .where(RepositoryToolRow.repository_id == repository_id)
        )
        return (self._session.scalar(stmt) or 0) > 0

    def add(self, repository_id: uuid.UUID, tool_id: str) -> None:
        if self._session.get(RepositoryToolRow, (repository_id, tool_id)) is None:
            self._session.add(
                RepositoryToolRow(
                    repository_id=repository_id, tool_id=tool_id, linked_at=datetime.now(UTC)
                )
            )

    def remove(self, repository_id: uuid.UUID, tool_id: str) -> None:
        row = self._session.get(RepositoryToolRow, (repository_id, tool_id))
        if row is not None:
            self._session.delete(row)

    def set_all(self, repository_id: uuid.UUID, tool_ids: set[str]) -> None:
        self._session.execute(
            delete(RepositoryToolRow).where(RepositoryToolRow.repository_id == repository_id)
        )
        self._session.flush()
        now = datetime.now(UTC)
        self._session.add_all(
            RepositoryToolRow(repository_id=repository_id, tool_id=tool_id, linked_at=now)
            for tool_id in tool_ids
        )
