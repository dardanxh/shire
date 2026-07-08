"""Git-history-based scanners: commit statistics and hotspots."""

from __future__ import annotations

from collections import defaultdict

from hobits.domain.substrate.domain import (
    Contributor,
    DailyCommitCount,
    Hotspot,
    ScanContext,
    ScanContribution,
)

_MAX_HOTSPOTS = 25


class GitStatsScanner:
    name = "git_stats"

    def scan(self, ctx: ScanContext) -> ScanContribution:
        if not ctx.commits:
            return ScanContribution(commit_count=0)

        by_email: dict[str, dict] = {}
        by_day: dict = defaultdict(int)
        for commit in ctx.commits:
            by_day[commit.committed_at.date()] += 1
            agg = by_email.get(commit.author_email)
            if agg is None:
                by_email[commit.author_email] = {
                    "name": commit.author_name,
                    "commits": 1,
                    "first": commit.committed_at,
                    "last": commit.committed_at,
                }
            else:
                agg["commits"] += 1
                agg["first"] = min(agg["first"], commit.committed_at)
                agg["last"] = max(agg["last"], commit.committed_at)

        contributors = [
            Contributor(
                name=data["name"],
                email=email,
                commits=data["commits"],
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
            for path in commit.files_changed:
                churn[path] += 1

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
