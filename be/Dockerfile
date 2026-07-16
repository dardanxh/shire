# Shire backend — FastAPI API + analysis substrate.
# Bundles the core scanner binaries (scc, syft, osv-scanner, gitleaks, scorecard) and the
# Claude Code CLI (used only for availability probes here; agent runs happen in the engine).

# --- scanner binaries (arch-aware GitHub release downloads) ---------------------------
FROM debian:bookworm-slim AS scanners
ARG TARGETARCH
ARG SCC_VERSION=3.7.0
ARG SYFT_VERSION=1.48.0
ARG OSV_SCANNER_VERSION=2.4.0
ARG GITLEAKS_VERSION=8.30.1
ARG SCORECARD_VERSION=5.5.0
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN set -eux; \
    mkdir -p /out /tmp/dl; cd /tmp/dl; \
    case "${TARGETARCH}" in \
      amd64) SCC_ARCH=x86_64; GITLEAKS_ARCH=x64; GOARCH=amd64 ;; \
      arm64) SCC_ARCH=arm64;  GITLEAKS_ARCH=arm64; GOARCH=arm64 ;; \
      *) echo "unsupported arch: ${TARGETARCH}" && exit 1 ;; \
    esac; \
    curl -fsSL -o scc.tgz "https://github.com/boyter/scc/releases/download/v${SCC_VERSION}/scc_Linux_${SCC_ARCH}.tar.gz" \
      && tar -xzf scc.tgz scc && install -m755 scc /out/scc; \
    curl -fsSL -o syft.tgz "https://github.com/anchore/syft/releases/download/v${SYFT_VERSION}/syft_${SYFT_VERSION}_linux_${GOARCH}.tar.gz" \
      && tar -xzf syft.tgz syft && install -m755 syft /out/syft; \
    curl -fsSL -o /out/osv-scanner "https://github.com/google/osv-scanner/releases/download/v${OSV_SCANNER_VERSION}/osv-scanner_linux_${GOARCH}" \
      && chmod 755 /out/osv-scanner; \
    curl -fsSL -o gitleaks.tgz "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_${GITLEAKS_ARCH}.tar.gz" \
      && tar -xzf gitleaks.tgz gitleaks && install -m755 gitleaks /out/gitleaks; \
    curl -fsSL -o scorecard.tgz "https://github.com/ossf/scorecard/releases/download/v${SCORECARD_VERSION}/scorecard_${SCORECARD_VERSION}_linux_${GOARCH}.tar.gz" \
      && tar -xzf scorecard.tgz scorecard && install -m755 scorecard /out/scorecard

# --- runtime ---------------------------------------------------------------------------
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# git for clone/analysis (GitPython shells out); Node 22 for the Claude Code CLI.
RUN apt-get update && apt-get install -y --no-install-recommends git curl ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g @anthropic-ai/claude-code \
    && rm -rf /var/lib/apt/lists/*

COPY --from=scanners /out/ /usr/local/bin/

RUN useradd -m -u 1000 shire && mkdir -p /data && chown shire:shire /data

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY README.md alembic.ini ./
COPY migrations ./migrations
COPY src ./src
RUN uv sync --frozen --no-dev && chown -R shire:shire /app

COPY --chmod=755 docker-entrypoint.sh /docker-entrypoint.sh

USER shire
ENV HOME=/home/shire \
    PATH="/app/.venv/bin:$PATH" \
    # Clones land on a volume shared with the engine; git 2.35+ refuses repos whose owner uid
    # differs from the caller's ("dubious ownership") unless marked safe.
    GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0=*

EXPOSE 8000
ENTRYPOINT ["/docker-entrypoint.sh"]
