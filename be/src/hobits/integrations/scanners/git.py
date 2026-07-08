"""Git-history-based scanners: commit statistics and hotspots."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime, timedelta

from hobits.domain.substrate.domain import (
    Contributor,
    DailyCommitCount,
    Hotspot,
    ScanContext,
    ScanContribution,
    ToolRun,
)

_MAX_HOTSPOTS = 25
_ACTIVE_DAYS = 90
_DORMANT_DAYS = 365


class GitStatsScanner:
    name = "git_stats"

    def scan(self, ctx: ScanContext) -> ScanContribution:
        if not ctx.commits:
            return ScanContribution(commit_count=0)

        by_email: dict[str, dict] = {}
        by_day: dict = defaultdict(int)
        for commit in ctx.commits:
            by_day[commit.committed_at.date()] += 1
            added = sum(fc.additions for fc in commit.files_changed)
            removed = sum(fc.deletions for fc in commit.files_changed)
            paths = {fc.path for fc in commit.files_changed}
            agg = by_email.get(commit.author_email)
            if agg is None:
                by_email[commit.author_email] = {
                    "name": commit.author_name,
                    "commits": 1,
                    "added": added,
                    "removed": removed,
                    "paths": set(paths),
                    "first": commit.committed_at,
                    "last": commit.committed_at,
                }
            else:
                agg["commits"] += 1
                agg["added"] += added
                agg["removed"] += removed
                agg["paths"].update(paths)
                agg["first"] = min(agg["first"], commit.committed_at)
                agg["last"] = max(agg["last"], commit.committed_at)

        contributors = [
            Contributor(
                name=data["name"],
                email=email,
                commits=data["commits"],
                lines_added=data["added"],
                lines_removed=data["removed"],
                files_touched=len(data["paths"]),
                first_commit_at=data["first"],
                last_commit_at=data["last"],
            )
            for email, data in sorted(
                by_email.items(), key=lambda kv: kv[1]["commits"], reverse=True
            )
        ]
        activity = [DailyCommitCount(day=day, count=count) for day, count in sorted(by_day.items())]
        dates = [c.committed_at for c in ctx.commits]
        return ScanContribution(
            commit_count=len(ctx.commits),
            contributors=contributors,
            commit_activity=activity,
            first_commit_at=min(dates),
            last_commit_at=max(dates),
        )


class HotspotScanner:
    name = "hotspots"

    def scan(self, ctx: ScanContext) -> ScanContribution:
        churn: dict = defaultdict(int)
        for commit in ctx.commits:
            for fc in commit.files_changed:
                churn[fc.path] += 1

        hotspots: list[Hotspot] = []
        for path, times in churn.items():
            file_path = ctx.clone_path / path
            try:
                size = file_path.stat().st_size if file_path.is_file() else 0
            except OSError:
                size = 0
            if size == 0:
                continue
            hotspots.append(Hotspot(path=path, churn=times, size=size, score=times * size))

        hotspots.sort(key=lambda h: h.score, reverse=True)
        return ScanContribution(hotspots=hotspots[:_MAX_HOTSPOTS])


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


class OwnershipScanner:
    """Ownership concentration + maintenance liveness, derived from git commit history.

    A fleet-triage lens: which repos are one-person-deep (bus factor) and which are dormant.
    """

    name = "ownership"

    def scan(self, ctx: ScanContext) -> ScanContribution:
        if not ctx.commits:
            return ScanContribution(
                tool_runs=[ToolRun(name="ownership", available=True, contributed=False)]
            )

        counts: dict[str, int] = defaultdict(int)
        for commit in ctx.commits:
            counts[commit.author_email] += 1
        total = sum(counts.values())
        ranked = sorted(counts.values(), reverse=True)

        # Bus factor: fewest top authors whose commits together exceed 50% of all commits.
        cumulative = bus_factor = 0
        for n in ranked:
            cumulative += n
            bus_factor += 1
            if cumulative / total > 0.5:
                break

        now = datetime.now(UTC)
        last_commit = max(_aware(c.committed_at) for c in ctx.commits)
        days_since = (now - last_commit).days
        cutoff = now - timedelta(days=_ACTIVE_DAYS)
        recent = [c for c in ctx.commits if _aware(c.committed_at) >= cutoff]

        if days_since < _ACTIVE_DAYS:
            status = "active"
        elif days_since < _DORMANT_DAYS:
            status = "dormant"
        else:
            status = "abandoned"

        return ScanContribution(
            bus_factor=bus_factor,
            top_author_share=round(ranked[0] / total, 3),
            active_contributor_count=len({c.author_email for c in recent}),
            commits_last_90d=len(recent),
            days_since_last_commit=days_since,
            maintenance_status=status,
            tool_runs=[ToolRun(name="ownership", available=True, contributed=True)],
        )
