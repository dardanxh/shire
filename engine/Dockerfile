# Shire engine — stateless job worker. Claims jobs from Postgres and runs them through the
# Claude Code CLI (the standalone native binary — no Node runtime, which keeps the image
# hundreds of MB smaller than an npm install). Auth: ANTHROPIC_API_KEY (set
# ENGINE_USE_API_KEY=true), CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`), or a
# mounted ~/.claude (see docker-compose.claude.yml).
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# git for worktree/clone jobs.
RUN apt-get update && apt-get install -y --no-install-recommends git curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# uid 1000 matches the backend image so files on the shared /data volume have one owner.
RUN useradd -m -u 1000 shire && mkdir -p /data /app && chown shire:shire /data /app

USER shire
ENV HOME=/home/shire \
    PATH="/app/.venv/bin:/home/shire/.local/bin:$PATH" \
    # The image is immutable; the CLI must not try to replace its own binary at runtime.
    DISABLE_AUTOUPDATER=1 \
    # Job cwds live on the shared volume; avoid git "dubious ownership" refusals.
    GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0=*

# Native Claude Code binary into ~/.local/bin (self-contained; no Node needed).
RUN curl -fsSL https://claude.ai/install.sh | bash

WORKDIR /app
COPY --chown=shire:shire pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY --chown=shire:shire README.md ./
COPY --chown=shire:shire src ./src
RUN uv sync --frozen --no-dev

CMD ["uv", "run", "--no-sync", "python", "-m", "engine"]
