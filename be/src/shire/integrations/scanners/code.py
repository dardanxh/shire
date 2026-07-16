"""Filesystem-based scanners: languages/LOC, dependencies, CI/CD, license, tests."""

from __future__ import annotations

import json
import re
import tomllib
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
            rel = str(path.relative_to(ctx.clone_path))
            name = path.name
            try:
                if name == "requirements.txt" or (
                    name.startswith("requirements") and name.endswith(".txt")
                ):
                    deps += _pip_requirements(path, rel)
                elif name == "pyproject.toml":
                    deps += _pyproject(path, rel)
                elif name == "package.json":
                    deps += _package_json(path, rel)
                elif name == "Cargo.toml":
                    deps += _cargo(path, rel)
                elif name == "go.mod":
                    deps += _go_mod(path, rel)
                elif name == "Gemfile":
                    deps += _gemfile(path, rel)
                elif name == "composer.json":
                    deps += _composer(path, rel)
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
            CiCdSystem.gitlab_ci: [".gitlab-ci.yml"],
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
