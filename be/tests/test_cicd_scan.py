"""CI/CD analysis: pipeline-file discovery and the engine scan's parsing rules."""

from __future__ import annotations

from pathlib import Path

from shire.domain.cicd.jobs import parse_scan, parse_suggestions
from shire.domain.substrate.domain import CiCdSystem, ScanContext
from shire.integrations.scanners.code import CiCdScanner, cicd_inventory


def _tree(root: Path, files: dict[str, str]) -> None:
    for rel, content in files.items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)


def test_cicd_inventory_finds_all_three_platforms(tmp_path: Path) -> None:
    _tree(
        tmp_path,
        {
            ".github/workflows/ci.yml": "on: push",
            ".github/workflows/release.yaml": "on: tag",
            ".github/actions/setup/action.yml": "name: setup",
            ".gitlab-ci.yml": "stages: [build]",
            ".gitlab/ci/test.yml": "test: {}",
            "bitbucket-pipelines.yml": "pipelines: {}",
            "Jenkinsfile": "pipeline {}",
            "README.md": "# not a pipeline",
        },
    )
    found = cicd_inventory(tmp_path)
    by_path = dict(found)

    assert by_path[".gitlab-ci.yml"] == CiCdSystem.gitlab_ci.value
    assert by_path["bitbucket-pipelines.yml"] == CiCdSystem.bitbucket_pipelines.value
    assert by_path[".github/workflows/ci.yml"] == CiCdSystem.github_actions.value
    assert by_path[".github/workflows/release.yaml"] == CiCdSystem.github_actions.value
    assert by_path[".github/actions/setup/action.yml"] == CiCdSystem.github_actions.value
    # Included GitLab templates count; other CI systems and plain docs do not.
    assert by_path[".gitlab/ci/test.yml"] == CiCdSystem.gitlab_ci.value
    assert "Jenkinsfile" not in by_path
    assert "README.md" not in by_path
    # Root files come before nested ones.
    assert found[0][0] in {".gitlab-ci.yml", "bitbucket-pipelines.yml"}


def test_cicd_scanner_detects_bitbucket_pipelines(tmp_path: Path) -> None:
    _tree(tmp_path, {"bitbucket-pipelines.yml": "pipelines: {}"})
    ctx = ScanContext(clone_path=tmp_path, head_sha="deadbeef", commits=())

    found = CiCdScanner().scan(ctx).cicd

    assert [c.system for c in found] == [CiCdSystem.bitbucket_pipelines]
    assert found[0].config_files == ("bitbucket-pipelines.yml",)


# --- engine output parsing ------------------------------------------------------

# What the engine actually returns: prose, then one fenced json block as the last thing.
_AGENT_ANSWER = """\
I read `.gitlab-ci.yml` and the two included templates under `.gitlab/ci/`.

Promotion runs develop -> qa -> main, with a manual gate before production.

```json
{
  "platforms": ["gitlab_ci"],
  "summary": "Merges to develop build and test, then auto-deploy to QA. A manual job promotes.",
  "environments": [
    {"key": "Dev", "name": "Development", "kind": "dev", "branch": "develop",
     "trigger": "merge to develop", "source_file": ".gitlab-ci.yml"},
    {"key": "qa", "name": "QA", "kind": "qa", "branch": "release/qa", "auto_deploy": true,
     "deploy_target": "k8s qa", "gates": ["none"], "source_file": ".gitlab/ci/deploy.yml"},
    {"key": "prod", "name": "Production", "kind": "nonsense", "branch": "main",
     "trigger": "manual promote", "gates": ["manual approval"], "source_file": ".gitlab-ci.yml"},
    {"key": "qa", "name": "QA duplicate", "kind": "qa"},
    "not an object"
  ],
  "transitions": [
    {"from_env": "Dev", "to_env": "qa", "trigger": "merge to release/qa",
     "steps": ["build", "lint", "test", "publish image"], "source_file": ".gitlab-ci.yml"},
    {"from_env": "qa", "to_env": "prod", "trigger": "manual promote", "steps": ["deploy"]},
    {"from_env": "qa", "to_env": "staging", "trigger": "does not exist"},
    {"from_env": "prod", "to_env": "prod", "trigger": "self loop"}
  ],
  "pipelines": [
    {"file": ".gitlab-ci.yml", "name": "main", "triggers": ["merge_request", "push"],
     "jobs": ["build", "test", "deploy"]},
    {"name": "no file so dropped"}
  ],
  "suggestions": [
    {"category": "caching", "impact": "high", "effort": "low",
     "title": "Cache pip downloads between jobs",
     "detail": "The build and test jobs each resolve dependencies from scratch.",
     "paths": [".gitlab-ci.yml"]},
    {"category": "made-up", "impact": "enormous", "effort": "trivial",
     "title": "Split the monolithic test job",
     "detail": "Runs 22 minutes serially."},
    {"detail": "no title, dropped"}
  ]
}
```
"""


def test_parse_scan_maps_environments_and_transitions() -> None:
    parsed = parse_scan(_AGENT_ANSWER)

    assert parsed is not None
    assert parsed["platforms"] == ["gitlab_ci"]
    assert parsed["summary"].startswith("Merges to develop")

    envs = {env.key: env for env in parsed["environments"]}
    # Keys are normalized to lower case and de-duplicated (first one wins).
    assert set(envs) == {"dev", "qa", "prod"}
    assert envs["qa"].name == "QA"
    assert envs["qa"].auto_deploy is True
    assert envs["dev"].branch == "develop"
    # An out-of-vocabulary kind falls back rather than poisoning the diagram's palette.
    assert envs["prod"].kind == "other"

    hops = {(t.from_env, t.to_env): t for t in parsed["transitions"]}
    # Transitions to unknown environments and self-loops have nothing to draw.
    assert set(hops) == {("dev", "qa"), ("qa", "prod")}
    assert hops[("dev", "qa")].steps == ["build", "lint", "test", "publish image"]

    assert [p.file for p in parsed["pipelines"]] == [".gitlab-ci.yml"]

    # Suggestions ride along in the same block; unknown enum values fall back to safe defaults.
    assert [s["title"] for s in parsed["suggestions"]] == [
        "Cache pip downloads between jobs",
        "Split the monolithic test job",
    ]
    assert parsed["suggestions"][0]["paths"] == [".gitlab-ci.yml"]
    assert parsed["suggestions"][1]["category"] == "practice"
    assert parsed["suggestions"][1]["impact"] == "medium"
    assert parsed["suggestions"][1]["effort"] == "medium"


def test_parse_scan_rejects_unusable_output() -> None:
    assert parse_scan("I could not find any pipelines in this repository.") is None
    assert parse_scan('```json\n{"environments": []}\n```') is None  # no summary
    # A repository with no CI/CD on the three platforms is a legitimate empty answer.
    empty = parse_scan('```json\n{"summary": "No GitHub/GitLab/Bitbucket CI here."}\n```')
    assert empty is not None
    assert empty["environments"] == []
    assert empty["suggestions"] == []


def test_parse_suggestions_reads_the_hobit_block() -> None:
    """The ci-cd hobit returns its suggestions inside the hobit output contract's JSON block."""
    hobit_output = """\
Some markdown narrative.

```json
{"headline": "The pipeline rebuilds the image three times",
 "narrative": "## Findings\\n...",
 "self_score": {"importance": 70, "confidence": 80, "urgency": 40},
 "suggestions": [
   {"category": "parallelism", "impact": "medium", "effort": "medium",
    "title": "Fan the test suite out over a matrix",
    "detail": "One job runs all 900 tests serially.",
    "paths": [".github/workflows/ci.yml"]}
 ]}
```
"""
    items = parse_suggestions(hobit_output)

    assert items is not None
    assert len(items) == 1
    assert items[0]["category"] == "parallelism"
    assert items[0]["paths"] == [".github/workflows/ci.yml"]
    # A narrative-only run is still a good run — there is simply nothing to harvest.
    assert parse_suggestions('```json\n{"headline": "x", "narrative": "y"}\n```') is None
