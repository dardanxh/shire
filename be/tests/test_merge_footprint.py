"""Merge-review tests: real temp git repos for the footprint, pure functions for the rest."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from shire.domain.hobits.domain import HobitSpec
from shire.domain.merge_review.domain import (
    ClassificationLabel,
    CommentSeverity,
    Footprint,
    MrComment,
    MrSize,
    RiskVerdict,
    classify_size,
    compute_risk,
    is_test_path,
)
from shire.domain.merge_review.mr_hobit import MrHobit, parse_classification, parse_overview
from shire.integrations.git_diff import (
    BranchNotFoundError,
    compute_footprint,
    diff_excerpt,
)


def _git(cwd: Path, *args: str, date: str = "2026-07-01T12:00:00", author: str = "Alice") -> None:
    env = {
        "GIT_AUTHOR_NAME": author,
        "GIT_AUTHOR_EMAIL": f"{author.lower()}@example.com",
        "GIT_COMMITTER_NAME": author,
        "GIT_COMMITTER_EMAIL": f"{author.lower()}@example.com",
        "GIT_AUTHOR_DATE": date,
        "GIT_COMMITTER_DATE": date,
    }
    subprocess.run(["git", *args], cwd=cwd, check=True, env={"PATH": "/usr/bin:/bin", **env})


@pytest.fixture
def mr_repo(tmp_path: Path) -> Path:
    """main + a feature branch exercising every footprint case: modify, add (test), rename,
    delete, binary, second author — plus a post-branch commit on main so merge-base ≠ target."""
    repo = tmp_path / "mr"
    repo.mkdir()
    _git(repo, "init", "-q", "-b", "main")

    (repo / "src").mkdir()
    (repo / "src" / "app.py").write_text("line1\nline2\nline3\nline4\n")
    (repo / "src" / "old_name.py").write_text("keep me\n" * 12)
    (repo / "src" / "doomed.py").write_text("delete me\n" * 5)
    _git(repo, "add", ".")
    _git(repo, "commit", "-q", "-m", "base", date="2026-06-01T12:00:00")

    _git(repo, "checkout", "-q", "-b", "feature")
    # Modify: +3 added lines, -1 deleted line.
    (repo / "src" / "app.py").write_text("line1\nline2 changed\nline3\nline4\nnew5\nnew6\n")
    _git(repo, "add", ".")
    _git(repo, "commit", "-q", "-m", "modify app", date="2026-06-02T12:00:00")
    # New test file (by a second author).
    (repo / "tests").mkdir()
    (repo / "tests" / "test_app.py").write_text("def test_app():\n    assert True\n")
    _git(repo, "add", ".")
    _git(repo, "commit", "-q", "-m", "add test", date="2026-06-03T12:00:00", author="Bob")
    # Rename (content unchanged so rename detection is exact).
    _git(repo, "mv", "src/old_name.py", "src/new_name.py")
    _git(repo, "commit", "-q", "-m", "rename", date="2026-06-04T12:00:00")
    # Delete + binary in one commit.
    (repo / "src" / "doomed.py").unlink()
    (repo / "logo.bin").write_bytes(bytes([0, 159, 146, 150]) * 10)
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "delete + binary", date="2026-06-05T12:00:00")

    # main moves on after the branch point: merge-base must be the fork, not main's head.
    _git(repo, "checkout", "-q", "main")
    (repo / "mainline.txt").write_text("mainline\n")
    _git(repo, "add", ".")
    _git(repo, "commit", "-q", "-m", "mainline moves", date="2026-06-06T12:00:00")
    return repo


def test_compute_footprint(mr_repo: Path) -> None:
    fp = compute_footprint(mr_repo, "feature", "main", provider_is_local=True)
    by_path = {f.path: f for f in fp.files}

    # Three-dot semantics: main's post-fork commit is NOT part of the diff.
    assert "mainline.txt" not in by_path
    assert fp.commit_count == 4
    assert fp.author_count == 2
    assert fp.merge_base_sha != fp.target_sha

    app = by_path["src/app.py"]
    assert (app.additions, app.deletions) == (3, 1)
    assert app.total_loc == 6  # current LOC at the source head
    assert not app.is_test and not app.is_new and not app.is_deleted

    test_file = by_path["tests/test_app.py"]
    assert test_file.is_new and test_file.is_test
    assert test_file.total_loc == 2

    renamed = by_path["src/new_name.py"]
    assert renamed.old_path == "src/old_name.py"
    assert (renamed.additions, renamed.deletions) == (0, 0)

    doomed = by_path["src/doomed.py"]
    assert doomed.is_deleted
    assert doomed.total_loc == 5  # pre-change LOC from the merge-base blob

    binary = by_path["logo.bin"]
    assert binary.is_binary and binary.total_loc is None
    assert (binary.additions, binary.deletions) == (0, 0)

    assert fp.test_files_changed == 1
    assert fp.tests_to_code_ratio is not None and fp.tests_to_code_ratio > 0
    assert fp.size is MrSize.small and fp.efficient

    dirs = {d.directory: d for d in fp.directories}
    assert dirs["src"].files_changed == 3  # app, old->new (rename counted once), doomed
    assert dirs["src"].additions == 3 and dirs["src"].deletions == 6
    assert dirs["tests"].files_changed == 1
    assert dirs["."].files_changed == 1  # logo.bin


def test_missing_branch_raises(mr_repo: Path) -> None:
    with pytest.raises(BranchNotFoundError):
        compute_footprint(mr_repo, "no-such-branch", "main", provider_is_local=True)


def test_diff_excerpt(mr_repo: Path) -> None:
    fp = compute_footprint(mr_repo, "feature", "main", provider_is_local=True)
    excerpt = diff_excerpt(mr_repo, fp.merge_base_sha, fp.source_sha, fp.files)
    assert "line2 changed" in excerpt  # the code hunk is present
    assert "logo.bin" not in excerpt  # binaries are skipped

    tiny = diff_excerpt(
        mr_repo, fp.merge_base_sha, fp.source_sha, fp.files, max_total_bytes=80, max_file_bytes=80
    )
    assert "[truncated]" in tiny
    assert "more files omitted" in tiny


# --- pure functions ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("tests/test_app.py", True),
        ("src/__tests__/foo.ts", True),
        ("spec/thing_spec.rb", True),
        ("ui/src/Foo.test.tsx", True),
        ("ui/src/Foo.spec.ts", True),
        ("src/utils_test.go", True),
        ("conftest.py", True),
        ("src/app.py", False),
        ("src/contest.py", False),
        ("docs/testing.md", False),
    ],
)
def test_is_test_path(path: str, expected: bool) -> None:
    assert is_test_path(path) is expected


def test_classify_size_boundaries() -> None:
    assert classify_size(5, 100) is MrSize.small
    assert classify_size(6, 100) is MrSize.medium  # worst axis wins
    assert classify_size(5, 101) is MrSize.medium
    assert classify_size(15, 400) is MrSize.medium
    assert classify_size(40, 1500) is MrSize.large
    assert classify_size(41, 10) is MrSize.huge
    assert classify_size(1, 5000) is MrSize.huge


def _footprint(**overrides) -> Footprint:
    base = {
        "merge_base_sha": "a",
        "source_sha": "b",
        "target_sha": "c",
        "commit_count": 1,
        "author_count": 1,
        "authors": ["Alice"],
        "files": [],
        "directories": [],
        "total_additions": 10,
        "total_deletions": 2,
        "files_changed": 2,
        "test_files_changed": 1,
        "code_files_changed": 1,
        "test_lines_changed": 6,
        "code_lines_changed": 6,
        "tests_to_code_ratio": 1.0,
        "hotspot_paths_touched": [],
        "size": MrSize.small,
        "efficient": True,
    }
    base.update(overrides)
    return Footprint.model_validate(base)


def test_compute_risk_small_tested_mr_is_safe() -> None:
    breakdown = compute_risk(_footprint(), [])
    assert breakdown.size_score == 10
    assert breakdown.hotspot_score == 0
    assert breakdown.test_score == 0
    assert breakdown.findings_score == 0
    assert breakdown.verdict is RiskVerdict.looks_safe


def test_compute_risk_huge_untested_hotspot_mr_is_high_risk() -> None:
    fp = _footprint(
        size=MrSize.huge,
        efficient=False,
        test_lines_changed=0,
        tests_to_code_ratio=0.0,
        hotspot_paths_touched=["a.py", "b.py", "c.py"],
    )
    breakdown = compute_risk(fp, [])
    assert breakdown.size_score == 95
    assert breakdown.hotspot_score == 100
    assert breakdown.test_score == 90
    assert breakdown.verdict is RiskVerdict.high_risk


def test_compute_risk_renormalizes_without_hobits() -> None:
    fp = _footprint(size=MrSize.huge, test_lines_changed=0, tests_to_code_ratio=0.0)
    with_none = compute_risk(fp, None)
    with_empty = compute_risk(fp, [])
    assert with_none.findings_score is None
    assert with_empty.findings_score == 0
    # Dropping the findings term renormalizes the others upward.
    assert with_none.total > with_empty.total


def test_compute_risk_critical_finding_never_looks_safe() -> None:
    critical = [MrComment(severity=CommentSeverity.critical, body="boom")]
    breakdown = compute_risk(_footprint(), critical)
    assert breakdown.verdict is not RiskVerdict.looks_safe


def test_docs_only_mr_has_no_test_risk() -> None:
    fp = _footprint(code_lines_changed=0, test_lines_changed=0, tests_to_code_ratio=None)
    assert compute_risk(fp, []).test_score == 0


# --- output parsing ----------------------------------------------------------------------------

_SPEC = HobitSpec(
    slug="x",
    name="X",
    description="",
    category="MR Reviewer",
    default_charter="",
    default_instructions="",
    default_model="sonnet",
    default_timeout_seconds=1.0,
)


def test_mr_hobit_parses_valid_output() -> None:
    text = (
        "Some analysis prose.\n\n```json\n"
        '{"headline": "One bug found", "self_score": 70, "comments": '
        '[{"severity": "major", "file": "src/app.py", "line": 3, "body": "Off-by-one"}]}\n```'
    )
    output = MrHobit(_SPEC).parse_output(text)
    assert output is not None
    assert output.headline == "One bug found"
    assert output.self_score == 70
    assert output.comments[0].severity is CommentSeverity.major


def test_mr_hobit_parse_clamps_and_coerces() -> None:
    text = (
        '```json\n{"headline": "h", "self_score": 300, "comments": '
        '[{"severity": "catastrophic", "body": "x"}]}\n```'
    )
    output = MrHobit(_SPEC).parse_output(text)
    assert output is not None
    assert output.self_score == 100  # clamped
    assert output.comments[0].severity is CommentSeverity.info  # unknown severity degrades


def test_mr_hobit_parse_failures_return_none() -> None:
    assert MrHobit(_SPEC).parse_output("no json here") is None
    assert MrHobit(_SPEC).parse_output("```json\n{not valid json}\n```") is None


def test_parse_classification_validates_and_renormalizes() -> None:
    text = (
        '```json\n{"labels": [{"label": "bug_fix", "proportion": 0.6}, '
        '{"label": "tests", "proportion": 0.2}, {"label": "alien", "proportion": 0.2}]}\n```'
    )
    labels = parse_classification(text)
    assert labels is not None
    assert [entry.label.value for entry in labels] == ["bug_fix", "tests"]
    assert sum(entry.proportion for entry in labels) == pytest.approx(1.0, abs=0.01)
    assert isinstance(labels[0], ClassificationLabel)


def test_parse_classification_rejects_garbage() -> None:
    assert parse_classification("prose only") is None
    assert parse_classification('```json\n{"labels": []}\n```') is None


def test_parse_overview() -> None:
    assert parse_overview('```json\n{"overview": "This MR does X."}\n```') == "This MR does X."
    assert parse_overview('```json\n{"overview": "   "}\n```') is None
    assert parse_overview("nope") is None
