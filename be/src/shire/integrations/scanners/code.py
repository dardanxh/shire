"""Filesystem-based scanners: languages/LOC, dependencies, CI/CD, license, tests."""

from __future__ import annotations

import json
import re
import tomllib
from collections.abc import Callable
from pathlib import Path
from typing import ClassVar

from shire.domain.substrate.domain import (
    CiCdConfig,
    CiCdSystem,
    Dependency,
    Ecosystem,
    LanguageStat,
    LicenseInfo,
    ScanContext,
    ScanContribution,
)
from shire.integrations.scanners._common import (
    LANG_BY_EXT,
    NON_CODE_LANGS,
    count_loc,
    is_probably_binary,
    walk_files,
)

_DEV_GROUPS = {
    "dev",
    "develop",
    "development",
    "test",
    "tests",
    "testing",
    "lint",
    "linting",
    "typing",
    "docs",
    "doc",
}
_REQ_RE = re.compile(r"^\s*([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*([<>=!~][^;#]*)?")


class LanguageScanner:
    name = "languages"

    def scan(self, ctx: ScanContext) -> ScanContribution:
        loc_by_lang: dict[str, int] = {}
        files_by_lang: dict[str, int] = {}
        for path in walk_files(ctx.clone_path):
            lang = LANG_BY_EXT.get(path.suffix.lower())
            if lang is None or is_probably_binary(path):
                continue
            loc = count_loc(path)
            loc_by_lang[lang] = loc_by_lang.get(lang, 0) + loc
            files_by_lang[lang] = files_by_lang.get(lang, 0) + 1

        total = sum(loc_by_lang.values())
        stats = [
            LanguageStat(
                language=lang,
                loc=loc,
                files=files_by_lang[lang],
                pct=round(loc / total * 100, 2) if total else 0.0,
            )
            for lang, loc in sorted(loc_by_lang.items(), key=lambda kv: kv[1], reverse=True)
        ]
        code = [s for s in stats if s.language not in NON_CODE_LANGS]
        primary = (code or stats)[0].language if (code or stats) else None
        return ScanContribution(languages=stats, loc_total=total, primary_language=primary)


class DependencyScanner:
    name = "dependencies"

    def scan(self, ctx: ScanContext) -> ScanContribution:
        deps: list[Dependency] = []
        for path in walk_files(ctx.clone_path):
            parser = _PARSERS.get(manifest_kind(path.name) or "")
            if parser is None:
                continue
            rel = str(path.relative_to(ctx.clone_path))
            try:
                deps += parser(path, rel)
            except (OSError, ValueError, tomllib.TOMLDecodeError, json.JSONDecodeError):
                continue
        return ScanContribution(dependencies=deps)


class CiCdScanner:
    name = "cicd"

    def scan(self, ctx: ScanContext) -> ScanContribution:
        root = ctx.clone_path
        found: list[CiCdConfig] = []

        wf = root / ".github" / "workflows"
        if wf.is_dir():
            files = sorted(
                f".github/workflows/{p.name}" for p in wf.iterdir() if p.suffix in {".yml", ".yaml"}
            )
            if files:
                found.append(
                    CiCdConfig(system=CiCdSystem.github_actions, config_files=tuple(files))
                )

        singles = {
            CiCdSystem.gitlab_ci: [".gitlab-ci.yml", ".gitlab-ci.yaml"],
            CiCdSystem.bitbucket_pipelines: [
                "bitbucket-pipelines.yml",
                "bitbucket-pipelines.yaml",
            ],
            CiCdSystem.circleci: [".circleci/config.yml"],
            CiCdSystem.jenkins: ["Jenkinsfile"],
            CiCdSystem.travis: [".travis.yml"],
            CiCdSystem.azure_pipelines: ["azure-pipelines.yml", ".azure-pipelines.yml"],
            CiCdSystem.drone: [".drone.yml"],
        }
        for system, candidates in singles.items():
            present = [c for c in candidates if (root / c).is_file()]
            if present:
                found.append(CiCdConfig(system=system, config_files=tuple(present)))
        return ScanContribution(cicd=found)


class LicenseScanner:
    name = "license"

    _CANDIDATES = ("LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING", "LICENCE")

    def scan(self, ctx: ScanContext) -> ScanContribution:
        for candidate in self._CANDIDATES:
            path = ctx.clone_path / candidate
            if path.is_file():
                text = path.read_text(encoding="utf-8", errors="ignore")[:4000]
                spdx = _detect_spdx(text)
                return ScanContribution(
                    license=LicenseInfo(spdx_id=spdx, name=spdx or "Unknown", source_file=candidate)
                )
        return ScanContribution(license=LicenseInfo())


class TestPresenceScanner:
    name = "tests"

    _DIRS: ClassVar[set[str]] = {"tests", "test", "spec", "__tests__"}
    _PATTERNS: ClassVar[tuple] = (
        re.compile(r"^test_.*\.py$"),
        re.compile(r".*_test\.py$"),
        re.compile(r".*_test\.go$"),
        re.compile(r".*\.(test|spec)\.[jt]sx?$"),
        re.compile(r".*Test\.java$"),
        re.compile(r".*_spec\.rb$"),
    )

    def scan(self, ctx: ScanContext) -> ScanContribution:
        for path in walk_files(ctx.clone_path):
            if any(part in self._DIRS for part in path.parts):
                return ScanContribution(has_tests=True)
            if any(p.match(path.name) for p in self._PATTERNS):
                return ScanContribution(has_tests=True)
        return ScanContribution(has_tests=False)


# --- manifest recognition -----------------------------------------------------

# Manifests we can see but not parse. Their dependencies exist; nothing here reads them — which
# is exactly the case the engine fallback covers (see the substrate service's AI dependency scan).
_UNPARSED_MANIFEST_NAMES = frozenset(
    {
        "pom.xml",
        "build.gradle",
        "build.gradle.kts",
        "build.sbt",
        "ivy.xml",
        "Pipfile",
        "setup.py",
        "setup.cfg",
        "environment.yml",
        "environment.yaml",
        "conda.yml",
        "conda.yaml",
        "mix.exs",
        "pubspec.yaml",
        "Package.swift",
        "Podfile",
        "packages.config",
        "conanfile.txt",
        "conanfile.py",
        "cpanfile",
        "DESCRIPTION",
        "renv.lock",
    }
)
# .NET project files carry their PackageReference items; matched by suffix, not by name.
_UNPARSED_MANIFEST_SUFFIXES = frozenset({".csproj", ".fsproj", ".vbproj"})


def manifest_kind(filename: str) -> str | None:
    """The manifest kind a filename denotes ("pyproject.toml", "pom.xml", "*.csproj", ...), or
    None when it isn't a dependency manifest. Kinds present in `_PARSERS` are the ones the
    deterministic scanner understands; the rest are detection-only."""
    if filename.startswith("requirements") and filename.endswith(".txt"):
        return "requirements.txt"
    if filename in _PARSERS or filename in _UNPARSED_MANIFEST_NAMES:
        return filename
    suffix = Path(filename).suffix.lower()
    if suffix in _UNPARSED_MANIFEST_SUFFIXES:
        return f"*{suffix}"
    return None


def manifest_inventory(root: Path) -> list[tuple[str, str, bool]]:
    """Every dependency manifest under `root` as (repo-relative path, kind, parsed), root
    manifests first and shallower paths before deeper ones. The parsed flag says whether the
    deterministic scanner can read that format — a monorepo of `pom.xml` files reports twenty
    manifests and nothing parsed."""
    found: list[tuple[str, str, bool]] = []
    for path in walk_files(root):
        kind = manifest_kind(path.name)
        if kind is None:
            continue
        rel = path.relative_to(root)
        found.append((str(rel), kind, kind in _PARSERS))
    return sorted(found, key=lambda entry: (entry[0].count("/"), entry[0]))


# Pipeline files for the three platforms the CI/CD analysis covers. Other systems
# (Jenkins, CircleCI, Azure, Drone, Travis) are still *detected* by CiCdScanner — the
# AI analysis deliberately stays focused on these three.
_CICD_GLOBS: tuple[tuple[str, CiCdSystem], ...] = (
    (".github/workflows/*.yml", CiCdSystem.github_actions),
    (".github/workflows/*.yaml", CiCdSystem.github_actions),
    (".github/actions/*/action.yml", CiCdSystem.github_actions),
    (".github/actions/*/action.yaml", CiCdSystem.github_actions),
    (".gitlab-ci.yml", CiCdSystem.gitlab_ci),
    (".gitlab-ci.yaml", CiCdSystem.gitlab_ci),
    # Included templates conventionally live here; `include: local:` can point anywhere,
    # which is one of the reasons the engine is told to look beyond this list.
    (".gitlab/**/*.yml", CiCdSystem.gitlab_ci),
    (".gitlab/**/*.yaml", CiCdSystem.gitlab_ci),
    ("bitbucket-pipelines.yml", CiCdSystem.bitbucket_pipelines),
    ("bitbucket-pipelines.yaml", CiCdSystem.bitbucket_pipelines),
)


def cicd_inventory(root: Path) -> list[tuple[str, str]]:
    """Every GitHub Actions / GitLab CI / Bitbucket Pipelines file under `root` as
    (repo-relative path, system), shallowest first.

    This is the *hint list* handed to the engine, not the data: reusable workflows,
    `extends` templates and `include: project:` indirection are exactly what a filename
    walk cannot resolve, so the prompt tells the agent to go beyond it."""
    found: dict[str, str] = {}
    for pattern, system in _CICD_GLOBS:
        for path in root.glob(pattern):
            if path.is_file():
                found[str(path.relative_to(root))] = system.value
    return sorted(found.items(), key=lambda entry: (entry[0].count("/"), entry[0]))


# --- dependency manifest parsers ---------------------------------------------


def _parse_req(line: str) -> tuple[str, str | None] | None:
    line = line.strip()
    if not line or line.startswith(("#", "-", "git+", "http")):
        return None
    match = _REQ_RE.match(line)
    if not match:
        return None
    version = (match.group(2) or "").strip() or None
    return match.group(1), version


def _pip_requirements(path: Path, rel: str) -> list[Dependency]:
    out = []
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        parsed = _parse_req(line)
        if parsed:
            out.append(
                Dependency(
                    ecosystem=Ecosystem.pip, name=parsed[0], version=parsed[1], manifest_file=rel
                )
            )
    return out


def _pyproject(path: Path, rel: str) -> list[Dependency]:
    data = tomllib.loads(path.read_text(encoding="utf-8", errors="ignore"))
    out: list[Dependency] = []

    def add(spec: str, is_dev: bool) -> None:
        parsed = _parse_req(spec)
        if parsed:
            out.append(
                Dependency(
                    ecosystem=Ecosystem.pip,
                    name=parsed[0],
                    version=parsed[1],
                    manifest_file=rel,
                    is_dev=is_dev,
                )
            )

    project = data.get("project", {})
    for spec in project.get("dependencies", []):
        add(spec, False)
    for group, specs in project.get("optional-dependencies", {}).items():
        for spec in specs:
            add(spec, group.lower() in _DEV_GROUPS)
    for group, specs in data.get("dependency-groups", {}).items():
        for spec in specs:
            if isinstance(spec, str):
                add(spec, group.lower() in _DEV_GROUPS)

    poetry = data.get("tool", {}).get("poetry", {})
    for name, spec in poetry.get("dependencies", {}).items():
        if name.lower() != "python":
            out.append(
                Dependency(
                    ecosystem=Ecosystem.pip,
                    name=name,
                    version=spec if isinstance(spec, str) else None,
                    manifest_file=rel,
                )
            )
    for group, gdata in poetry.get("group", {}).items():
        for name, spec in gdata.get("dependencies", {}).items():
            out.append(
                Dependency(
                    ecosystem=Ecosystem.pip,
                    name=name,
                    version=spec if isinstance(spec, str) else None,
                    manifest_file=rel,
                    is_dev=group.lower() in _DEV_GROUPS,
                )
            )
    return out


def _from_dict(data: dict, ecosystem: Ecosystem, rel: str, is_dev: bool) -> list[Dependency]:
    return [
        Dependency(
            ecosystem=ecosystem,
            name=name,
            version=version if isinstance(version, str) else None,
            manifest_file=rel,
            is_dev=is_dev,
        )
        for name, version in data.items()
    ]


def _package_json(path: Path, rel: str) -> list[Dependency]:
    data = json.loads(path.read_text(encoding="utf-8", errors="ignore"))
    out = _from_dict(data.get("dependencies", {}), Ecosystem.npm, rel, False)
    out += _from_dict(data.get("devDependencies", {}), Ecosystem.npm, rel, True)
    return out


def _cargo(path: Path, rel: str) -> list[Dependency]:
    data = tomllib.loads(path.read_text(encoding="utf-8", errors="ignore"))
    out: list[Dependency] = []
    for key, is_dev in (("dependencies", False), ("dev-dependencies", True)):
        for name, spec in data.get(key, {}).items():
            version = (
                spec
                if isinstance(spec, str)
                else spec.get("version")
                if isinstance(spec, dict)
                else None
            )
            out.append(
                Dependency(
                    ecosystem=Ecosystem.cargo,
                    name=name,
                    version=version,
                    manifest_file=rel,
                    is_dev=is_dev,
                )
            )
    return out


def _go_mod(path: Path, rel: str) -> list[Dependency]:
    out: list[Dependency] = []
    in_block = False
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if line.startswith("require ("):
            in_block = True
            continue
        if in_block and line == ")":
            in_block = False
            continue
        target = line
        if line.startswith("require ") and not line.endswith("("):
            target = line[len("require ") :].strip()
        elif not in_block:
            continue
        parts = target.split()
        if len(parts) >= 2 and not parts[0].startswith("//"):
            out.append(
                Dependency(
                    ecosystem=Ecosystem.go, name=parts[0], version=parts[1], manifest_file=rel
                )
            )
    return out


def _gemfile(path: Path, rel: str) -> list[Dependency]:
    out: list[Dependency] = []
    gem_re = re.compile(r"""^\s*gem\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?""")
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        match = gem_re.match(line)
        if match:
            out.append(
                Dependency(
                    ecosystem=Ecosystem.gem,
                    name=match.group(1),
                    version=match.group(2),
                    manifest_file=rel,
                )
            )
    return out


def _composer(path: Path, rel: str) -> list[Dependency]:
    data = json.loads(path.read_text(encoding="utf-8", errors="ignore"))
    out = _from_dict(data.get("require", {}), Ecosystem.composer, rel, False)
    out += _from_dict(data.get("require-dev", {}), Ecosystem.composer, rel, True)
    return out


# Manifest kind -> parser. The single source of truth for "we can read this format"; both the
# scanner's dispatch and `manifest_kind`'s parsed flag come off this dict.
_PARSERS: dict[str, Callable[[Path, str], list[Dependency]]] = {
    "requirements.txt": _pip_requirements,
    "pyproject.toml": _pyproject,
    "package.json": _package_json,
    "Cargo.toml": _cargo,
    "go.mod": _go_mod,
    "Gemfile": _gemfile,
    "composer.json": _composer,
}


_SPDX_RULES = [
    ("Apache-2.0", lambda t: "apache license" in t and "2.0" in t),
    ("GPL-3.0", lambda t: "gnu general public license" in t and "version 3" in t),
    ("GPL-2.0", lambda t: "gnu general public license" in t and "version 2" in t),
    ("LGPL-3.0", lambda t: "lesser general public license" in t and "version 3" in t),
    ("MPL-2.0", lambda t: "mozilla public license" in t and "2.0" in t),
    ("BSD-3-Clause", lambda t: "redistribution and use" in t and "neither the name" in t),
    ("BSD-2-Clause", lambda t: "redistribution and use" in t),
    ("ISC", lambda t: "isc license" in t),
    ("Unlicense", lambda t: "this is free and unencumbered software" in t),
    ("MIT", lambda t: "permission is hereby granted, free of charge" in t or "mit license" in t),
]


def _detect_spdx(text: str) -> str | None:
    lowered = text.lower()
    for spdx, rule in _SPDX_RULES:
        if rule(lowered):
            return spdx
    return None
