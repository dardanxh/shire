#!/usr/bin/env bash
# Shire — one-command containerized setup. Builds and starts the full stack (Postgres,
# backend API, job engine, UI) with Docker Compose. Idempotent; safe to re-run.
#
#   ./setup.sh
#
# Claude auth for agent jobs (picked up automatically, first match wins):
#   1. ANTHROPIC_API_KEY set in your shell        -> paid API-key auth
#   2. CLAUDE_CODE_OAUTH_TOKEN set in your shell  -> subscription auth (from `claude setup-token`)
#   3. ~/.claude exists on this machine           -> mounted into the engine container
# You can also edit .env afterwards and re-run ./setup.sh.
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
note() { printf '  %s\n' "$*"; }

# --- 1. prerequisites -------------------------------------------------------------------
bold "==> Checking prerequisites"
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is not installed. Get it at https://docs.docker.com/get-docker/" >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: the 'docker compose' plugin is missing (Docker Desktop includes it;" >&2
  echo "       on Linux: https://docs.docker.com/compose/install/)" >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: the Docker daemon is not running. Start Docker and re-run ./setup.sh" >&2
  exit 1
fi
note "docker OK"

# --- 2. .env ----------------------------------------------------------------------------
if [ -f .env ]; then
  bold "==> Using existing .env"
  note "(delete .env to regenerate — but keep SHIRE_SECRET_KEY: rotating it orphans any"
  note " credentials already encrypted with it)"
else
  bold "==> Generating .env"

  # SHIRE_SECRET_KEY: a urlsafe-base64 32-byte Fernet key. Generated once and then never
  # touched — it encrypts stored connection credentials at rest.
  if command -v openssl >/dev/null 2>&1; then
    secret_key="$(openssl rand -base64 32 | tr '+/' '-_')"
  else
    secret_key="$(docker run --rm python:3.13-slim python -c \
      'import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())')"
  fi

  {
    echo "# Shire stack configuration — read by docker-compose.yml. See .env.example."
    echo ""
    echo "# Encrypts connection credentials at rest (Fernet). Do NOT rotate once in use."
    echo "SHIRE_SECRET_KEY=${secret_key}"
    echo ""
  } > .env

  auth_mode="none"
  if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
    case "$ANTHROPIC_API_KEY" in
      sk-ant-*) ;;
      *) note "WARNING: ANTHROPIC_API_KEY doesn't look like an Anthropic key (expected sk-ant-...)" ;;
    esac
    auth_mode="api-key"
    {
      echo "# Claude auth: paid API key (from your shell env at setup time)."
      echo "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}"
      echo "USE_API_KEY=true"
    } >> .env
  elif [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
    auth_mode="oauth-token"
    {
      echo "# Claude auth: subscription OAuth token (from \`claude setup-token\`)."
      echo "CLAUDE_CODE_OAUTH_TOKEN=${CLAUDE_CODE_OAUTH_TOKEN}"
    } >> .env
  elif [ -d "${HOME}/.claude" ] && [ -f "${HOME}/.claude.json" ]; then
    auth_mode="mount"
    {
      echo "# Claude auth: host ~/.claude mounted into the engine (docker-compose.claude.yml)."
      echo "COMPOSE_FILE=docker-compose.yml:docker-compose.claude.yml"
    } >> .env
  fi

  if [ -n "${GITHUB_TOKEN:-}" ]; then
    {
      echo ""
      echo "# Optional: richer GitHub metadata + private repo access."
      echo "GITHUB_TOKEN=${GITHUB_TOKEN}"
    } >> .env
  fi

  case "$auth_mode" in
    api-key)     note "Claude auth: ANTHROPIC_API_KEY (API-key mode)" ;;
    oauth-token) note "Claude auth: CLAUDE_CODE_OAUTH_TOKEN (subscription mode)" ;;
    mount)
      note "Claude auth: mounting ~/.claude into the engine container."
      note "NOTE: on macOS the CLI stores credentials in the Keychain, so the mount may not"
      note "carry auth. If agent jobs fail, run \`claude setup-token\` and put the token in"
      note ".env as CLAUDE_CODE_OAUTH_TOKEN=... , then re-run ./setup.sh"
      ;;
    none)
      note "No Claude auth found — that's fine to start: ingest, scanners, scorecards, and"
      note "catalogs all work without it. Agent features (hobits, ask, council…) will be"
      note "unavailable until you add ONE of these to .env and re-run ./setup.sh:"
      note "  ANTHROPIC_API_KEY=sk-ant-...   plus  USE_API_KEY=true"
      note "  CLAUDE_CODE_OAUTH_TOKEN=...    (from \`claude setup-token\`)"
      ;;
  esac
fi

# --- 2b. opt-in local-repos mount -------------------------------------------------------
# Nothing on the host is visible to the containers by default. To add repos already on this
# machine by absolute path, the user deliberately grants access to ONE directory:
#   SHIRE_LOCAL_REPOS_DIR=/path/to/repos ./setup.sh
# mounts it into backend + engine at the same path. Idempotent against an existing .env.
if [ -n "${SHIRE_LOCAL_REPOS_DIR:-}" ]; then
  repos_dir="${SHIRE_LOCAL_REPOS_DIR%/}"
  if [ ! -d "$repos_dir" ]; then
    echo "ERROR: SHIRE_LOCAL_REPOS_DIR is not a directory: $repos_dir" >&2
    exit 1
  fi
  bold "==> Granting the stack access to ${repos_dir} (local-repos mount)"
  if grep -q '^SHIRE_LOCAL_REPOS_DIR=' .env; then
    sed -i.bak "s|^SHIRE_LOCAL_REPOS_DIR=.*|SHIRE_LOCAL_REPOS_DIR=${repos_dir}|" .env && rm -f .env.bak
  else
    {
      echo ""
      echo "# Host directory you granted the stack access to (mounted into backend+engine at"
      echo "# the same path) so repos under it can be added by absolute path in the UI."
      echo "SHIRE_LOCAL_REPOS_DIR=${repos_dir}"
    } >> .env
  fi
  if grep -q '^COMPOSE_FILE=' .env; then
    # Anchor on the COMPOSE_FILE line itself — comments elsewhere in .env mention the file too.
    if ! grep -q '^COMPOSE_FILE=.*docker-compose\.local-repos\.yml' .env; then
      sed -i.bak 's|^COMPOSE_FILE=.*|&:docker-compose.local-repos.yml|' .env && rm -f .env.bak
    fi
  else
    echo "COMPOSE_FILE=docker-compose.yml:docker-compose.local-repos.yml" >> .env
  fi
fi

# --- 3. build + start -------------------------------------------------------------------
bold "==> Building and starting the stack (first build takes a few minutes)"
docker compose up -d --build

# --- 4. wait for the API ----------------------------------------------------------------
bold "==> Waiting for the backend (migrations run on first boot)"
for _ in $(seq 1 60); do
  if curl -sf http://localhost:8000/health >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 3
done
if [ -z "${healthy:-}" ]; then
  echo "ERROR: backend did not become healthy. Inspect with: docker compose logs backend" >&2
  exit 1
fi

bold "==> Shire is up"
note "UI:        http://localhost:3000"
note "Backend:   http://localhost:8000"
note "API docs:  http://localhost:8000/docs"
note ""
note "Logs:      docker compose logs -f"
note "Stop:      docker compose down          (data is kept in named volumes)"
note "Reset:     docker compose down -v       (DELETES the database and cloned repos)"

# Open the UI in the default browser (best-effort; no-op on headless machines).
if command -v open >/dev/null 2>&1; then
  open "http://localhost:3000" >/dev/null 2>&1 || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:3000" >/dev/null 2>&1 || true
fi
