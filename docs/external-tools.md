# External Analysis Tools (Phase 1.5 enrichment)

Hobits enriches the substrate with best-in-class OSS tools instead of reinventing them. Every
tool is integrated so that a **missing tool degrades gracefully** — its metric is simply absent,
the app still runs. The live status of each tool is available at **`GET /tools`**.

> **Source of truth (code):** the registry lives at
> `be/src/hobits/substrate/infrastructure/external_tools/` — `BINARY_TOOLS` (CLI adapters) and
> `LIBRARY_TOOLS` (bundled Python libs). This doc + `scripts/setup.sh` mirror that registry.

## Binaries (integrated via adapters)

Adapters live in `be/src/hobits/substrate/infrastructure/external_tools/`. Each wraps a subprocess
call, parses JSON, and tolerates a missing binary.

| Tool | Metric it provides | Install (macOS) | Homepage |
| --- | --- | --- | --- |
| **scc** | Comment-aware LOC by language + total complexity + COCOMO cost estimate | `brew install scc` | https://github.com/boyter/scc |
| **syft** | SBOM — resolved + transitive dependencies across ecosystems | `brew install syft` | https://github.com/anchore/syft |
| **osv-scanner** | Known vulnerabilities (CVEs) in dependencies via OSV | `brew install osv-scanner` | https://github.com/google/osv-scanner |
| **gitleaks** | Committed-secret detection (counts + locations; never the value) | `brew install gitleaks` | https://github.com/gitleaks/gitleaks |
| **scorecard** | OpenSSF project health/security rating (0–10) — needs a GitHub token | `brew install scorecard` | https://github.com/ossf/scorecard |

## Python libraries (bundled via `uv sync`)

| Tool | Metric it provides | Homepage |
| --- | --- | --- |
| **lizard** | Multi-language cyclomatic complexity (avg/max CCN, function count) | https://github.com/terryyin/lizard |
| **radon** | Python Maintainability Index (0–100) + complexity | https://github.com/rubik/radon |

## Derived ratings

From the above metrics, Hobits derives three **A–E ratings** (`be/.../substrate/application/ratings.py`):
- **Maintainability** — from radon's Maintainability Index (or complexity fallback).
- **Security** — from vulnerability severities + secret findings.
- **Health** — from the OpenSSF Scorecard aggregate (NA without a token).

## Notes
- **scorecard** requires network + a GitHub token (`HOBITS_GITHUB_TOKEN`) and only rates
  GitHub-hosted repos; without a token it is skipped (`contributed: false` in `tool_runs`).
- Install everything with **`scripts/setup.sh`**; start everything with **`scripts/run.sh`**.
