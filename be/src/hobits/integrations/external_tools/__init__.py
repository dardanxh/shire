"""Registry of external analysis tools — the single source of truth for docs + setup scripts.

`BINARY_TOOLS` are CLI binaries integrated via adapters (they may be absent → degrade gracefully).
`LIBRARY_TOOLS` are Python packages bundled by `uv sync` (always available).
"""

from __future__ import annotations

from hobits.integrations.external_tools.base import ToolSpec, ToolStatus
from hobits.integrations.external_tools.gitleaks import GitleaksAdapter
from hobits.integrations.external_tools.osv import OsvScannerAdapter
from hobits.integrations.external_tools.scc import SccAdapter
from hobits.integrations.external_tools.scorecard import ScorecardAdapter
from hobits.integrations.external_tools.syft import SyftAdapter

BINARY_TOOLS = [
    SccAdapter(),
    SyftAdapter(),
    OsvScannerAdapter(),
    GitleaksAdapter(),
    ScorecardAdapter(),
]

LIBRARY_TOOLS = [
    ToolSpec(
        name="lizard",
        purpose="Multi-language cyclomatic complexity (avg/max CCN, function count, warnings).",
        homepage="https://github.com/terryyin/lizard",
        install="bundled (uv sync)",
    ),
    ToolSpec(
        name="radon",
        purpose="Python Maintainability Index + cyclomatic complexity + Halstead metrics.",
        homepage="https://github.com/rubik/radon",
        install="bundled (uv sync)",
    ),
]


def binary_tool_specs() -> list[ToolSpec]:
    return [tool.spec for tool in BINARY_TOOLS]


def all_tool_statuses() -> list[ToolStatus]:
    binary = [tool.status() for tool in BINARY_TOOLS]
    library = [
        ToolStatus(
            name=spec.name,
            available=True,
            version="bundled",
            purpose=spec.purpose,
            install=spec.install,
            homepage=spec.homepage,
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
]
