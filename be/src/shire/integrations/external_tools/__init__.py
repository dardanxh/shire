"""Registry of external analysis tools — the single source of truth for docs + setup scripts.

`BINARY_TOOLS` are CLI binaries integrated via adapters (they may be absent → degrade gracefully).
`LIBRARY_TOOLS` are Python packages bundled by `uv sync` (always available).
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from shire.integrations.external_tools.bandit import BanditAdapter
from shire.integrations.external_tools.base import ToolSpec, ToolStatus
from shire.integrations.external_tools.code_maat import CodeMaatAdapter
from shire.integrations.external_tools.codecharta import CodeChartaAdapter
from shire.integrations.external_tools.emerge import EmergeAdapter
from shire.integrations.external_tools.git_of_theseus import GitOfTheseusAdapter
from shire.integrations.external_tools.gitleaks import GitleaksAdapter
from shire.integrations.external_tools.osv import OsvScannerAdapter
from shire.integrations.external_tools.ruff import RuffAdapter
from shire.integrations.external_tools.scc import SccAdapter
from shire.integrations.external_tools.scorecard import ScorecardAdapter
from shire.integrations.external_tools.syft import SyftAdapter
from shire.integrations.external_tools.vulture import VultureAdapter

BINARY_TOOLS = [
    SccAdapter(),
    SyftAdapter(),
    OsvScannerAdapter(),
    GitleaksAdapter(),
    ScorecardAdapter(),
    # Python-quality tools (bundled via uv → always on PATH; AST-based, need no repo deps)
    RuffAdapter(),
    BanditAdapter(),
    VultureAdapter(),
    # Visualization / artifact tools — surfaced in /tools for availability only; each runs via its
    # own dedicated endpoint, not the generic scanner tool-run flow.
    EmergeAdapter(),  # dependency graph (HTML)
    GitOfTheseusAdapter(),  # code age (SVG)
    CodeMaatAdapter(),  # temporal coupling (data)
    CodeChartaAdapter(),  # code-city map (cc.json + viewer)
]

LIBRARY_TOOLS = [
    ToolSpec(
        name="lizard",
        purpose="Multi-language cyclomatic complexity (avg/max CCN, function count, warnings).",
        homepage="https://github.com/terryyin/lizard",
        install="bundled (uv sync)",
        category="metrics",
    ),
    ToolSpec(
        name="radon",
        purpose="Python Maintainability Index + cyclomatic complexity + Halstead metrics.",
        homepage="https://github.com/rubik/radon",
        install="bundled (uv sync)",
        category="metrics",
        language="python",
    ),
    ToolSpec(
        name="test-metrics",
        purpose=(
            "Test-suite metrics — test/assertion counts, test-to-code ratio, frameworks, "
            "and coverage % parsed from a committed coverage report."
        ),
        homepage="https://docs.pytest.org/",
        install="bundled (built-in scanner)",
        category="testing",
    ),
    ToolSpec(
        name="ownership",
        purpose=(
            "Ownership & maintenance from git history — bus factor, top-author share, "
            "active contributors, and liveness (active / dormant / abandoned)."
        ),
        homepage="https://git-scm.com/",
        install="bundled (built-in scanner)",
        category="maintenance",
    ),
]


def binary_tool_specs() -> list[ToolSpec]:
    return [tool.spec for tool in BINARY_TOOLS]


def tool_languages() -> dict[str, str]:
    """Static tool-id → language scope ("general" / "python" / …) from each ToolSpec.

    Cheap (no subprocess) — used to auto-link only the language-applicable integrations per repo.
    """
    languages = {tool.spec.id or tool.spec.name: tool.spec.language for tool in BINARY_TOOLS}
    languages.update({spec.id or spec.name: spec.language for spec in LIBRARY_TOOLS})
    return languages


# Probing a tool's availability/version shells out to `<tool> --version`. This is the expensive
# part, so callers (the tools-catalog sync) persist the result; here we just make the probe itself
# fast by running the per-tool subprocesses concurrently — a cold probe is bounded by the slowest
# single tool, not the sum of all of them.
def all_tool_statuses() -> list[ToolStatus]:
    with ThreadPoolExecutor(max_workers=8) as pool:
        binary = list(pool.map(lambda tool: tool.status(), BINARY_TOOLS))
    library = [
        ToolStatus(
            name=spec.name,
            available=True,
            version="bundled",
            purpose=spec.purpose,
            install=spec.install,
            homepage=spec.homepage,
            id=spec.id or spec.name,
            category=spec.category,
            kind=spec.kind,
            language=spec.language,
        )
        for spec in LIBRARY_TOOLS
    ]
    return binary + library


__all__ = [
    "BINARY_TOOLS",
    "LIBRARY_TOOLS",
    "ToolSpec",
    "ToolStatus",
    "all_tool_statuses",
    "binary_tool_specs",
    "tool_languages",
]
