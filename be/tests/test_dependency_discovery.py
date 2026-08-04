"""Dependency coverage: manifest recognition, and the engine fallback's parsing/dedupe rules."""

from __future__ import annotations

from pathlib import Path

from shire.domain.substrate.domain import DependencySource, Ecosystem, ScanContext
from shire.domain.substrate.services import parse_ai_dependencies
from shire.integrations.scanners.code import DependencyScanner, manifest_inventory

# --- manifest recognition -------------------------------------------------------


def _tree(root: Path, files: dict[str, str]) -> None:
    for rel, content in files.items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)


def test_manifest_inventory_flags_unparsed_formats(tmp_path: Path) -> None:
    _tree(
        tmp_path,
        {
            "pom.xml": "<project/>",
            "apps/api/build.gradle": "dependencies {}",
            "apps/web/package.json": '{"dependencies": {"react": "18.2.0"}}',
            "svc/Api.csproj": "<Project/>",
            "README.md": "# not a manifest",
        },
    )
    found = manifest_inventory(tmp_path)
    by_path = {path: (kind, parsed) for path, kind, parsed in found}

    assert by_path["pom.xml"] == ("pom.xml", False)
    assert by_path["apps/api/build.gradle"] == ("build.gradle", False)
    assert by_path["apps/web/package.json"] == ("package.json", True)
    assert by_path["svc/Api.csproj"] == ("*.csproj", False)
    assert "README.md" not in by_path
    # Root manifests come first, then shallower paths before deeper ones.
    assert found[0][0] == "pom.xml"


def test_dependency_scanner_reads_every_app_of_a_monorepo(tmp_path: Path) -> None:
    """The parsers already walk the whole tree — what they can't do is unreadable formats."""
    _tree(
        tmp_path,
        {
            "apps/api/pyproject.toml": '[project]\ndependencies = ["fastapi>=0.115"]\n',
            "apps/web/package.json": '{"dependencies": {"react": "18.2.0"}}',
            "apps/jvm/pom.xml": "<project><dependencies/></project>",
        },
    )

    ctx = ScanContext(clone_path=tmp_path, head_sha="deadbeef", commits=())
    deps = DependencyScanner().scan(ctx).dependencies
    names = {d.name for d in deps}
    assert names == {"fastapi", "react"}  # the pom.xml is invisible to the parsers
    assert all(d.source == DependencySource.scan for d in deps)


# --- the engine fallback --------------------------------------------------------


def test_parse_ai_dependencies_maps_ecosystems_and_dedupes() -> None:
    text = """Here is what I found.

```json
{
  "dependencies": [
    {"name": "org.apache.kafka:kafka-clients", "version": "3.6.1",
     "latest_version": "3.9.0", "ecosystem": "gradle",
     "manifest_file": "apps/jvm/pom.xml", "is_dev": false},
    {"name": "org.apache.kafka:kafka-clients", "version": "3.6.1",
     "latest_version": "3.9.0", "ecosystem": "maven",
     "manifest_file": "apps/other/pom.xml", "is_dev": false},
    {"name": "pytest", "version": "8.2.0", "latest_version": "unknown",
     "ecosystem": "python", "manifest_file": "apps/api/Pipfile", "is_dev": true},
    {"name": "Newtonsoft.Json", "version": null, "latest_version": "13.0.3",
     "ecosystem": "nuget", "manifest_file": "svc/Api.csproj"},
    {"version": "1.0.0", "ecosystem": "pip", "manifest_file": "nope"}
  ]
}
```"""
    deps = parse_ai_dependencies(text)
    assert deps is not None
    # The duplicate (same name + declared version) collapses; the nameless entry is dropped.
    assert [d.name for d in deps] == [
        "org.apache.kafka:kafka-clients",
        "pytest",
        "Newtonsoft.Json",
    ]

    kafka, pytest_dep, nuget = deps
    assert kafka.ecosystem == Ecosystem.maven  # gradle -> maven
    assert kafka.latest_version == "3.9.0"
    assert kafka.source == DependencySource.ai
    assert pytest_dep.ecosystem == Ecosystem.pip  # python -> pip
    assert pytest_dep.is_dev is True
    assert pytest_dep.latest_version is None  # "unknown" is not a version
    assert nuget.ecosystem == Ecosystem.generic  # nuget has no enum of its own
    assert nuget.version is None
    assert nuget.is_dev is False


def test_parse_ai_dependencies_rejects_unusable_output() -> None:
    assert parse_ai_dependencies("I could not find any manifests.") is None
    assert parse_ai_dependencies('```json\n{"packages": []}\n```') is None
    assert parse_ai_dependencies('```json\n{"dependencies": []}\n```') == []
