"""Members service: aggregate people across repositories, ethically.

Reads per-repo contributor data from the substrate (service-to-service), resolves identities by
normalized email, applies opt-out/bot exclusions, and optionally anonymizes for sharing. The
output is a project-health lens: knowledge distribution and single-maintainer risk, not a ranking.
"""

from __future__ import annotations

import uuid
from collections import Counter
from datetime import UTC, date, datetime, timedelta
from fnmatch import fnmatch

from sqlalchemy.orm import Session

from shire.core.exceptions import ConflictError, NotFoundError
from shire.domain.members.models import MemberExclusionRow
from shire.domain.members.repositories import SqlMemberExclusionRepository
from shire.domain.members.schemas import (
    CommitSizeBucketResult,
    CreateMemberExclusion,
    MemberActivityResult,
    MemberCommitSizesResult,
    MemberDetailResult,
    MemberExclusionResult,
    MemberHeatmapCellResult,
    MemberRepositoryBreakdownResult,
    MemberRepositoryShareResult,
    MembersOverviewResult,
    MemberSummaryResult,
    MemberWeeklyActivityResult,
    PortfolioHealthResult,
)
from shire.domain.substrate.services import AnalysisService

# Identities are keyed by a stable UUIDv5 of the normalized email, so ids survive re-analysis.
_IDENTITY_NS = uuid.uuid5(uuid.NAMESPACE_URL, "hobits/member-identity")

# A member is "active" if their most recent commit (anywhere) is within this window.
_ACTIVE_DAYS = 90

# Row-sparkline window (weeks, oldest first).
_SPARKLINE_WEEKS = 26

# Commit-size histogram bars; commits above the last bound count as "large" (batch-y changes).
_SIZE_BUCKETS = ((0, 10, "≤10"), (11, 50, "11-50"), (51, 200, "51-200"), (201, 500, "201-500"))
_LARGE_COMMIT_LINES = 500

# Applied on top of user-managed exclusions. Deliberately narrow — matches obvious automation, not
# privacy-masked human emails (e.g. GitHub noreply addresses are real people and are kept).
_DEFAULT_BOT_PATTERNS = (
    # fnmatch treats [seq] as a character class, so the literal "[bot]" suffix GitHub gives
    # bot accounts must be written with escaped brackets — "*[bot]*" would silently exclude
    # every member whose name/email contains a b, o, or t.
    "*[[]bot[]]*",
    "dependabot*",
    "renovate*",
    "github-actions*",
    "*-bot@*",
)


def _norm_email(email: str) -> str:
    return email.strip().lower()


def _identity_id(normalized_email: str) -> uuid.UUID:
    return uuid.uuid5(_IDENTITY_NS, normalized_email)


def _letter_label(index: int) -> str:
    """0 -> 'A', 25 -> 'Z', 26 -> 'AA' — a stable, name-free pseudonym for anonymized views."""
    label = ""
    index += 1
    while index > 0:
        index, rem = divmod(index - 1, 26)
        label = chr(ord("A") + rem) + label
    return label


class _Aggregate:
    """Mutable accumulator for one resolved identity while folding repo contributions."""

    def __init__(self, identity_id: uuid.UUID, email: str) -> None:
        self.id = identity_id
        self.email = email
        self.commits = 0
        self.lines_added = 0
        self.lines_removed = 0
        self.files_touched = 0
        self.first_active_at: datetime | None = None
        self.last_active_at: datetime | None = None
        self._name_votes: dict[str, int] = {}
        # repository_id -> breakdown accumulator
        self.repositories: dict[uuid.UUID, dict] = {}

    def add_name(self, name: str) -> None:
        self._name_votes[name] = self._name_votes.get(name, 0) + 1

    @property
    def name(self) -> str:
        return max(self._name_votes.items(), key=lambda kv: kv[1])[0] if self._name_votes else ""


class MembersService:
    def __init__(self, session: Session) -> None:
        self._substrate = AnalysisService(session)
        self._exclusions = SqlMemberExclusionRepository(session)

    # --- overview + detail ----------------------------------------------------
    def overview(self, *, anonymize: bool = False) -> MembersOverviewResult:
        aggregates, repo_count, single_maintainer = self._aggregate()
        labels = self._anon_labels(aggregates) if anonymize else {}
        weeks = _week_grid(_SPARKLINE_WEEKS)
        weekly_by_email = self._substrate.weekly_commit_counts(
            datetime.now(UTC) - timedelta(weeks=_SPARKLINE_WEEKS)
        )
        # Neutral default order: alphabetical by display name (NOT by output — not a ranking).
        ordered = sorted(aggregates.values(), key=lambda a: a.name.lower())
        members = [self._to_summary(a, labels, weekly_by_email, weeks) for a in ordered]
        return MembersOverviewResult(
            health=self._health(aggregates, repo_count, single_maintainer),
            members=members,
        )

    def detail(self, identity_id: uuid.UUID, *, anonymize: bool = False) -> MemberDetailResult:
        aggregates, _, _ = self._aggregate()
        agg = aggregates.get(identity_id)
        if agg is None:
            raise NotFoundError("No member with that id (they may be excluded).")
        labels = self._anon_labels(aggregates) if anonymize else {}
        name, email, anonymized = self._display(agg, labels)
        breakdown = [
            MemberRepositoryBreakdownResult(
                repository_id=rid,
                repository_name=data["name"],
                commits=data["commits"],
                lines_added=data["lines_added"],
                lines_removed=data["lines_removed"],
                files_touched=data["files_touched"],
            )
            for rid, data in sorted(
                agg.repositories.items(), key=lambda kv: kv[1]["commits"], reverse=True
            )
        ]
        return MemberDetailResult(
            id=agg.id,
            name=name,
            email=email,
            anonymized=anonymized,
            commits=agg.commits,
            lines_added=agg.lines_added,
            lines_removed=agg.lines_removed,
            files_touched=agg.files_touched,
            first_active_at=agg.first_active_at,
            last_active_at=agg.last_active_at,
            status=self._status(agg.last_active_at),
            repositories=breakdown,
        )

    def activity(
        self, identity_id: uuid.UUID, *, anonymize: bool = False
    ) -> MemberActivityResult:
        """One member's activity shape: weekly timeline, commit sizes, work pattern, repo shares.

        Built from per-commit records of each repo's latest analysis. Repos analyzed before
        per-commit persistence contribute nothing to the timeline/sizes/heatmap and are counted
        in `missing_data_repositories` (a repo refresh backfills them).
        """
        aggregates, _, _ = self._aggregate()
        agg = aggregates.get(identity_id)
        if agg is None:
            raise NotFoundError("No member with that id (they may be excluded).")
        labels = self._anon_labels(aggregates) if anonymize else {}
        name, email, anonymized = self._display(agg, labels)

        history = self._substrate.commit_history_for_email(agg.email)
        by_repo = {h.repository_id: h for h in history}
        records = [record for h in history for record in h.records]

        weekly_map: dict[date, list[int]] = {}
        for record in records:
            week = record.committed_at.date() - timedelta(
                days=record.committed_at.weekday()
            )
            bucket = weekly_map.setdefault(week, [0, 0])
            bucket[0] += 1
            bucket[1] += record.insertions + record.deletions
        weekly = [
            MemberWeeklyActivityResult(
                week_start=week, commits=commits, lines_changed=lines
            )
            for week, (commits, lines) in sorted(weekly_map.items())
        ]

        heat = Counter((record.weekday, record.local_hour) for record in records)
        heatmap = [
            MemberHeatmapCellResult(weekday=weekday, hour=hour, commits=commits)
            for (weekday, hour), commits in sorted(heat.items())
        ]

        repositories: list[MemberRepositoryShareResult] = []
        missing = 0
        for rid, data in sorted(
            agg.repositories.items(), key=lambda kv: kv[1]["commits"], reverse=True
        ):
            hist = by_repo.get(rid)
            total = hist.total_commits if hist else 0
            if hist is not None and not hist.has_records:
                missing += 1
            repositories.append(
                MemberRepositoryShareResult(
                    repository_id=rid,
                    repository_name=data["name"],
                    member_commits=data["commits"],
                    total_commits=total,
                    share=round(data["commits"] / total, 4) if total else 0.0,
                    sole_maintainer=bool(data.get("sole")),
                )
            )

        return MemberActivityResult(
            id=agg.id,
            name=name,
            email=email,
            anonymized=anonymized,
            weekly=weekly,
            sizes=_commit_sizes([r.insertions + r.deletions for r in records]),
            heatmap=heatmap,
            repositories=repositories,
            missing_data_repositories=missing,
        )

    # --- exclusions (opt-out / bots) ------------------------------------------
    def list_exclusions(self) -> list[MemberExclusionResult]:
        return [
            MemberExclusionResult.model_validate(row) for row in self._exclusions.list_all()
        ]

    def add_exclusion(self, body: CreateMemberExclusion) -> MemberExclusionResult:
        pattern = body.pattern.strip().lower()
        if not pattern:
            raise ConflictError("Exclusion pattern cannot be empty.")
        if self._exclusions.get_by_pattern(pattern) is not None:
            raise ConflictError(f"Exclusion '{pattern}' already exists.")
        row = MemberExclusionRow(
            id=uuid.uuid4(),
            pattern=pattern,
            reason=body.reason,
            is_bot=body.is_bot,
            created_at=datetime.now(UTC),
        )
        self._exclusions.add(row)
        return MemberExclusionResult.model_validate(row)

    def remove_exclusion(self, exclusion_id: uuid.UUID) -> None:
        if not self._exclusions.delete(exclusion_id):
            raise NotFoundError("No exclusion with that id.")

    # --- internals ------------------------------------------------------------
    def _aggregate(self) -> tuple[dict[uuid.UUID, _Aggregate], int, int]:
        """Fold every repo's contributors into per-identity member aggregates.

        Returns (identity_id -> aggregate, repositories_analyzed, single_member_repos).
        """
        patterns = self._exclusion_patterns()
        repos = self._substrate.contributors_across_repositories()
        aggregates: dict[uuid.UUID, _Aggregate] = {}
        single_maintainer = 0

        for repo in repos:
            kept = [c for c in repo.contributors if not _is_excluded(c.name, c.email, patterns)]
            if len(kept) == 1:
                single_maintainer += 1
            sole = len(kept) == 1
            for c in kept:
                email = _norm_email(c.email)
                ident = _identity_id(email)
                agg = aggregates.get(ident)
                if agg is None:
                    agg = aggregates[ident] = _Aggregate(ident, email)
                agg.add_name(c.name)
                agg.commits += c.commits
                agg.lines_added += c.lines_added
                agg.lines_removed += c.lines_removed
                agg.files_touched += c.files_touched
                agg.first_active_at = _min(agg.first_active_at, c.first_commit_at)
                agg.last_active_at = _max(agg.last_active_at, c.last_commit_at)
                bucket = agg.repositories.setdefault(
                    repo.repository_id,
                    {
                        "name": repo.repository_name,
                        "commits": 0,
                        "lines_added": 0,
                        "lines_removed": 0,
                        "files_touched": 0,
                        "sole": sole,
                    },
                )
                bucket["commits"] += c.commits
                bucket["lines_added"] += c.lines_added
                bucket["lines_removed"] += c.lines_removed
                bucket["files_touched"] += c.files_touched

        return aggregates, len(repos), single_maintainer

    def _exclusion_patterns(self) -> tuple[str, ...]:
        stored = tuple(row.pattern for row in self._exclusions.list_all())
        return _DEFAULT_BOT_PATTERNS + stored

    @staticmethod
    def _anon_labels(aggregates: dict[uuid.UUID, _Aggregate]) -> dict[uuid.UUID, str]:
        # Stable across list and detail: order by identity id, then assign A, B, C…
        return {
            ident: f"Member {_letter_label(i)}"
            for i, ident in enumerate(sorted(aggregates.keys(), key=str))
        }

    @staticmethod
    def _display(agg: _Aggregate, labels: dict[uuid.UUID, str]) -> tuple[str, str, bool]:
        if agg.id in labels:
            label = labels[agg.id]
            return label, f"{label.lower().replace(' ', '-')}@hidden", True
        return agg.name, agg.email, False

    def _to_summary(
        self,
        agg: _Aggregate,
        labels: dict[uuid.UUID, str],
        weekly_by_email: dict[str, dict[date, int]],
        weeks: list[date],
    ) -> MemberSummaryResult:
        name, email, anonymized = self._display(agg, labels)
        by_week = weekly_by_email.get(agg.email)
        return MemberSummaryResult(
            id=agg.id,
            name=name,
            email=email,
            anonymized=anonymized,
            commits=agg.commits,
            lines_added=agg.lines_added,
            lines_removed=agg.lines_removed,
            files_touched=agg.files_touched,
            repository_count=len(agg.repositories),
            first_active_at=agg.first_active_at,
            last_active_at=agg.last_active_at,
            status=self._status(agg.last_active_at),
            # Empty (not zeros) when no repo has per-commit records for this member yet.
            weekly_commits=[by_week.get(week, 0) for week in weeks] if by_week else [],
            sole_maintainer_repos=sum(
                1 for data in agg.repositories.values() if data.get("sole")
            ),
        )

    @staticmethod
    def _status(last_active_at: datetime | None) -> str:
        if last_active_at is None:
            return "dormant"
        last = last_active_at if last_active_at.tzinfo else last_active_at.replace(tzinfo=UTC)
        return "active" if (datetime.now(UTC) - last) <= timedelta(days=_ACTIVE_DAYS) else "dormant"

    @staticmethod
    def _health(
        aggregates: dict[uuid.UUID, _Aggregate], repo_count: int, single_maintainer: int
    ) -> PortfolioHealthResult:
        total_commits = sum(a.commits for a in aggregates.values())
        top = max((a.commits for a in aggregates.values()), default=0)
        active = sum(
            1 for a in aggregates.values() if MembersService._status(a.last_active_at) == "active"
        )
        return PortfolioHealthResult(
            member_count=len(aggregates),
            active_member_count=active,
            dormant_member_count=len(aggregates) - active,
            repository_count=repo_count,
            single_member_repositories=single_maintainer,
            knowledge_concentration=round(top / total_commits, 3) if total_commits else 0.0,
        )


def _is_excluded(name: str, email: str, patterns: tuple[str, ...]) -> bool:
    haystacks = (name.strip().lower(), _norm_email(email))
    return any(fnmatch(h, p) for p in patterns for h in haystacks)


def _week_grid(count: int) -> list[date]:
    """The last `count` ISO week-start dates (Mondays), oldest first, current week last."""
    monday = datetime.now(UTC).date()
    monday -= timedelta(days=monday.weekday())
    return [monday - timedelta(weeks=offset) for offset in range(count - 1, -1, -1)]


def _commit_sizes(sizes: list[int]) -> MemberCommitSizesResult:
    """Histogram + robust stats over per-commit changed-line counts."""
    buckets = [
        CommitSizeBucketResult(
            label=label, count=sum(1 for size in sizes if low <= size <= high)
        )
        for low, high, label in _SIZE_BUCKETS
    ]
    large = sum(1 for size in sizes if size > _LARGE_COMMIT_LINES)
    buckets.append(CommitSizeBucketResult(label=f"{_LARGE_COMMIT_LINES}+", count=large))
    if not sizes:
        return MemberCommitSizesResult(
            buckets=buckets, median_lines=0, p90_lines=0, large_share=0.0
        )
    ordered = sorted(sizes)
    return MemberCommitSizesResult(
        buckets=buckets,
        median_lines=ordered[len(ordered) // 2],
        p90_lines=ordered[min(len(ordered) - 1, int(len(ordered) * 0.9))],
        large_share=round(large / len(sizes), 3),
    )


def _min(a: datetime | None, b: datetime | None) -> datetime | None:
    return b if a is None else (a if b is None else min(a, b))


def _max(a: datetime | None, b: datetime | None) -> datetime | None:
    return b if a is None else (a if b is None else max(a, b))
