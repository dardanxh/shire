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
upsert_env() { # upsert_env KEY VALUE — update or append KEY=VALUE in .env
  if grep -q "^$1=" .env; then
    sed -i.bak "s|^$1=.*|$1=$2|" .env && rm -f .env.bak
  else
    printf '%s=%s\n' "$1" "$2" >> .env
  fi
}
strip_claude_mount() { # token/key auth supersedes the ~/.claude mount overlay
  if grep -q '^COMPOSE_FILE=.*docker-compose\.claude\.yml' .env; then
    sed -i.bak 's|:docker-compose.claude.yml||; s|docker-compose.claude.yml:||' .env && rm -f .env.bak
  fi
}
offer_claude_token() {
  # Interactive: mint a subscription token via the host CLI so the containers can run agent
  # jobs on the user's Claude login. The engine's CLI lives inside a container and cannot
  # reach the host's session (macOS keeps it in the Keychain) — `claude setup-token` is the
  # official way to carry a subscription into a headless environment.
  [ -t 0 ] || return 0
  command -v claude >/dev/null 2>&1 || return 0
  bold "==> Claude authorization (optional — powers agent features)"
  note "Shire runs Claude inside its own container, which can't use your desktop Claude"
  note "login directly. Claude can mint a token tied to your subscription instead: one"
  note "browser approval, no key handling, nothing billed beyond your existing plan."
  note ""
  note "Skipping is fine — ingest, scanners, and catalogs all work without it; agent"
  note "features (hobits, ask, council…) stay off until you authorize (re-run ./setup.sh)."
  printf '  Authorize now via `claude setup-token`? [Y/n] '
  read -r reply || reply="n"
  case "$reply" in ""|y|Y|yes|Yes|YES) ;; *) return 0 ;; esac
  claude setup-token || { note "setup-token did not complete — skipping for now."; return 0; }
  printf '  Paste the token it printed (sk-ant-oat01-...): '
  read -r token || token=""
  token="$(printf '%s' "$token" | tr -d '[:space:]')"
  if [ -z "$token" ]; then
    note "No token pasted — skipping for now (re-run ./setup.sh to try again)."
    return 0
  fi
  case "$token" in
    sk-ant-*) ;;
    *) note "WARNING: that doesn't look like a Claude token (expected sk-ant-...) — saving anyway." ;;
  esac
  upsert_env CLAUDE_CODE_OAUTH_TOKEN "$token"
  strip_claude_mount
  note "Saved. Agent jobs will run on your Claude subscription."
}

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

  # Claude auth can be added or replaced on a re-run without editing files:
  #   CLAUDE_CODE_OAUTH_TOKEN=... ./setup.sh   or   ANTHROPIC_API_KEY=... ./setup.sh
  if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
    bold "==> Updating Claude auth in .env (API-key mode)"
    upsert_env ANTHROPIC_API_KEY "${ANTHROPIC_API_KEY}"
    upsert_env USE_API_KEY true
    strip_claude_mount
  elif [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
    bold "==> Updating Claude auth in .env (subscription-token mode)"
    upsert_env CLAUDE_CODE_OAUTH_TOKEN "${CLAUDE_CODE_OAUTH_TOKEN}"
    strip_claude_mount
  elif ! grep -q '^ANTHROPIC_API_KEY=\|^CLAUDE_CODE_OAUTH_TOKEN=' .env; then
    # No usable auth in .env. The ~/.claude mount only counts on Linux — on macOS it can't
    # work (Keychain credentials, torn reads of the live .claude.json), so offer the token
    # flow even when the overlay is present and clean the overlay up on success.
    if [ "$(uname -s)" = "Darwin" ] \
       || ! grep -q '^COMPOSE_FILE=.*docker-compose\.claude\.yml' .env; then
      offer_claude_token
    fi
  fi
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
  elif [ "$(uname -s)" != "Darwin" ] && [ -d "${HOME}/.claude" ] && [ -f "${HOME}/.claude.json" ]; then
    # Linux only. On macOS the mount is broken twice over: credentials live in the Keychain
    # (not ~/.claude), and the host CLI rewrites ~/.claude.json while the stack runs — reads
    # through a bind mount then appear torn and the engine fails with "config file corrupted".
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
      note "Claude auth: mounting ~/.claude into the engine container (Linux)."
      note "If agent jobs fail with an auth error, run \`claude setup-token\` and re-run:"
      note "  CLAUDE_CODE_OAUTH_TOKEN=<token> ./setup.sh"
      ;;
    none)
      if [ -t 0 ] && command -v claude >/dev/null 2>&1; then
        offer_claude_token
      else
        note "No Claude auth found — that's fine to start: ingest, scanners, scorecards, and"
        note "catalogs all work without it. Agent features (hobits, ask, council…) stay off"
        note "until you run ONE of these (no file editing needed):"
        note "  claude setup-token   then   CLAUDE_CODE_OAUTH_TOKEN=<token> ./setup.sh"
        note "  ANTHROPIC_API_KEY=sk-ant-... ./setup.sh   (paid API key)"
      fi
      ;;
  esac
fi

# --- 2b. local repos access (deliberate grant) ------------------------------------------
# Nothing on the host is visible to the containers by default. To add repos already on this
# machine by absolute path, the user grants access to ONE directory, mounted into backend +
# engine at the same path. The grant comes from $SHIRE_LOCAL_REPOS_DIR (scripted use) or the
# interactive prompt below; skipping is fine — git-URL ingest needs nothing. Idempotent
# against an existing .env; re-run ./setup.sh anytime to grant or change the folder.
repos_dir="${SHIRE_LOCAL_REPOS_DIR:-}"
if [ -n "$repos_dir" ] && [ ! -d "${repos_dir%/}" ]; then
  echo "ERROR: SHIRE_LOCAL_REPOS_DIR is not a directory: $repos_dir" >&2
  exit 1
fi
if [ -z "$repos_dir" ] && [ -t 0 ]; then
  current="$(grep '^SHIRE_LOCAL_REPOS_DIR=' .env | cut -d= -f2- || true)"
  bold "==> Repositories on this machine (optional)"
  if [ -n "$current" ]; then
    note "Folder currently shared with Shire: ${current}"
    note "Enter a different folder to change it, or press Enter to keep it."
  else
    note "Shire can also analyze repos that already live on this machine, added in the UI by"
    note "their folder path. That needs your permission: name ONE folder (e.g. ~/projects)"
    note "and only that folder is shared with Shire — nothing else on your disk is visible."
    note ""
    note "Press Enter to skip. Skipping means adding repos by local path will NOT work (repos"
    note "by git URL always work); you can grant a folder later by re-running ./setup.sh."
  fi
  while :; do
    printf '  Folder where you keep your repositories (Enter to skip): '
    read -r answer || answer=""
    [ -z "$answer" ] && break
    case "$answer" in
      "~") answer="$HOME" ;;
      "~/"*) answer="${HOME}/${answer#\~/}" ;;
    esac
    case "$answer" in
      /*) ;;
      *) note "Please enter an absolute path (starting with /) — got: $answer"; continue ;;
    esac
    if [ -d "$answer" ]; then
      repos_dir="$answer"
      break
    fi
    note "Not a directory: $answer (try again, or press Enter to skip)"
  done
fi
if [ -n "$repos_dir" ]; then
  repos_dir="${repos_dir%/}"
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
if grep -q '^SHIRE_LOCAL_REPOS_DIR=' .env; then
  note "Local repos: $(grep '^SHIRE_LOCAL_REPOS_DIR=' .env | cut -d= -f2-) is shared with Shire"
else
  note "Local repos: no folder shared — repos by git URL only (re-run ./setup.sh to grant one)"
fi
if grep -q '^ANTHROPIC_API_KEY=\|^CLAUDE_CODE_OAUTH_TOKEN=' .env \
   || grep -q '^COMPOSE_FILE=.*docker-compose\.claude\.yml' .env; then
  note "Claude:    authorized — agent features (hobits, ask, council…) are on"
else
  note "Claude:    not authorized — agent features off (re-run ./setup.sh to authorize)"
fi
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
