"""Data access for the Analysis aggregate and its child collections."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from hobits.domain.substrate.domain import (
    Analysis,
    AnalysisStatus,
    CiCdConfig,
    CiCdSystem,
    Contributor,
    DailyCommitCount,
    Dependency,
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
from hobits.domain.substrate.models import (
    AnalysisRow,
    CiCdRow,
    CommitActivityRow,
    ContributorRow,
    DependencyRow,
    HealthCheckRow,
    HotspotRow,
    LanguageStatRow,
    RepositoryToolRow,
    ToolRunRow,
    VulnerabilityRow,
)


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
    row.dependencies = [
        DependencyRow(
            ecosystem=d.ecosystem.value,
            name=d.name,
            version=d.version,
            manifest_file=d.manifest_file,
            is_dev=d.is_dev,
        )
        for d in analysis.dependencies
    ]
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

    def list_for_repository(self, repository_id: uuid.UUID) -> list[Analysis]:
        stmt = (
            select(AnalysisRow)
            .where(AnalysisRow.repository_id == repository_id)
            .order_by(AnalysisRow.analyzed_at.desc())
        )
        return [_to_domain(r) for r in self._session.scalars(stmt)]

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
