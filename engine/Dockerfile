# Shire engine — stateless job worker. Claims jobs from Postgres and runs them through the
# Claude Code CLI. Auth: ANTHROPIC_API_KEY (set ENGINE_USE_API_KEY=true), CLAUDE_CODE_OAUTH_TOKEN
# (from `claude setup-token`), or a mounted ~/.claude (see docker-compose.claude.yml).
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# git for worktree/clone jobs; Node 22 for the Claude Code CLI.
RUN apt-get update && apt-get install -y --no-install-recommends git curl ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g @anthropic-ai/claude-code \
    && rm -rf /var/lib/apt/lists/*

# uid 1000 matches the backend image so files on the shared /data volume have one owner.
RUN useradd -m -u 1000 shire && mkdir -p /data && chown shire:shire /data

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY README.md ./
COPY src ./src
RUN uv sync --frozen --no-dev && chown -R shire:shire /app

USER shire
ENV HOME=/home/shire \
    PATH="/app/.venv/bin:$PATH" \
    # Job cwds live on the shared volume; avoid git "dubious ownership" refusals.
    GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0=*

CMD ["uv", "run", "--no-sync", "python", "-m", "engine"]
