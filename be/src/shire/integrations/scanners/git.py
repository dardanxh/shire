"""Git-history-based scanners: commit statistics and hotspots."""

from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Callable, Iterable
from datetime import UTC, datetime, timedelta

from shire.domain.substrate.domain import (
    CommitRecord,
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


def _author_key_resolver(commits: Iterable) -> Callable[[object], str]:
    """Return a function mapping a commit to a canonical author-identity key.

    Git records whatever `user.name`/`user.email` each machine is configured with, so one person
    routinely appears under several identities (two emails, or the same email with different name
    spellings). We union authors that share a normalized email OR a normalized name (union-find over
    both token kinds), which merges those cases without collapsing genuinely distinct people. Empty
    tokens never merge anyone.
    """
    parent: dict[tuple[str, str], tuple[str, str]] = {}

    def find(token: tuple[str, str]) -> tuple[str, str]:
        parent.setdefault(token, token)
        root = token
        while parent[root] != root:
            root = parent[root]
        while parent[token] != root:  # path compression
            parent[token], token = root, parent[token]
        return root

    def tokens(commit: object) -> tuple[tuple[str, str] | None, tuple[str, str] | None]:
        email = (getattr(commit, "author_email", "") or "").strip().lower()
        name = (getattr(commit, "author_name", "") or "").strip().lower()
        return (("e", email) if email else None, ("n", name) if name else None)

    for commit in commits:
        etok, ntok = tokens(commit)
        if etok:
            find(etok)
        if ntok:
            find(ntok)
        if etok and ntok:
            parent[find(etok)] = find(ntok)

    def key(commit: object) -> str:
        etok, ntok = tokens(commit)
        token = etok or ntok or ("e", "")
        return "\x00".join(find(token))

    return key


def _top(counter: Counter) -> str:
    """The most-frequent value in a counter (ties broken by first-seen), or "" when empty."""
    return counter.most_common(1)[0][0] if counter else ""


class GitStatsScanner:
    name = "git_stats"

    def scan(self, ctx: ScanContext) -> ScanContribution:
        if not ctx.commits:
            return ScanContribution(commit_count=0)

        author_key = _author_key_resolver(ctx.commits)
        by_author: dict[str, dict] = {}
        by_day: dict = defaultdict(int)
        for commit in ctx.commits:
            by_day[commit.committed_at.date()] += 1
            added = sum(fc.additions for fc in commit.files_changed)
            removed = sum(fc.deletions for fc in commit.files_changed)
            paths = {fc.path for fc in commit.files_changed}
            agg = by_author.get(author_key(commit))
            if agg is None:
                by_author[author_key(commit)] = agg = {
                    # Count spellings so the displayed name/email is the person's most-used one.
                    "names": Counter(),
                    "emails": Counter(),
                    "commits": 0,
                    "added": 0,
                    "removed": 0,
                    "paths": set(),
                    "first": commit.committed_at,
                    "last": commit.committed_at,
                }
            if commit.author_name:
                agg["names"][commit.author_name] += 1
            if commit.author_email:
                agg["emails"][commit.author_email] += 1
            agg["commits"] += 1
            agg["added"] += added
            agg["removed"] += removed
            agg["paths"].update(paths)
            agg["first"] = min(agg["first"], commit.committed_at)
            agg["last"] = max(agg["last"], commit.committed_at)

        contributors = [
            Contributor(
                name=_top(data["names"]),
                email=_top(data["emails"]),
                commits=data["commits"],
                lines_added=data["added"],
                lines_removed=data["removed"],
                files_touched=len(data["paths"]),
                first_commit_at=data["first"],
                last_commit_at=data["last"],
            )
            for data in sorted(
                by_author.values(), key=lambda d: d["commits"], reverse=True
            )
        ]
        activity = [DailyCommitCount(day=day, count=count) for day, count in sorted(by_day.items())]

        # Per-commit rows carry the identity's canonical email so alias addresses roll up to the
        # same person the members context aggregates by.
        canonical_email = {
            key: _top(data["emails"]).strip().lower() for key, data in by_author.items()
        }
        records = [
            CommitRecord(
                sha=commit.sha,
                author_email=canonical_email.get(author_key(commit), "")
                or commit.author_email.strip().lower(),
                committed_at=commit.committed_at,
                insertions=sum(fc.additions for fc in commit.files_changed),
                deletions=sum(fc.deletions for fc in commit.files_changed),
                files_changed=len(commit.files_changed),
                # committed_at keeps the author's own UTC offset (%aI), so .hour/.weekday()
                # are author-local — exactly what work-pattern views want.
                local_hour=commit.committed_at.hour,
                weekday=commit.committed_at.weekday(),
            )
            for commit in ctx.commits
        ]

        dates = [c.committed_at for c in ctx.commits]
        return ScanContribution(
            commit_count=len(ctx.commits),
            contributors=contributors,
            commit_activity=activity,
            commit_records=records,
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

        # Count by canonical author identity (merges a person's multiple git emails/names) so
        # bus factor and contributor counts reflect people, not identities.
        author_key = _author_key_resolver(ctx.commits)
        counts: dict[str, int] = defaultdict(int)
        for commit in ctx.commits:
            counts[author_key(commit)] += 1
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
            active_contributor_count=len({author_key(c) for c in recent}),
            commits_last_90d=len(recent),
            days_since_last_commit=days_since,
            maintenance_status=status,
            tool_runs=[ToolRun(name="ownership", available=True, contributed=True)],
        )
