#!/usr/bin/env bash
# AI Actions host runner: the Shire engine, run natively on this machine with YOUR logged-in
# `claude` CLI — the only place your claude.ai connectors (Slack, GitHub, Atlassian, BigQuery...)
# and your user-level skills (~/.claude/skills) exist. It claims only AI action runs; the Docker
# engine runs everything else.
#
# Prerequisites:
#   1. The DB published on the host: add docker-compose.db-port.yml to COMPOSE_FILE in .env,
#      then `docker compose up -d db`.
#   2. `claude` installed and logged in (`claude mcp list` shows your connectors).
#
# Usage:
#   scripts/host-runner.sh                  run in the foreground (Ctrl-C to stop)
#   scripts/host-runner.sh --install-agent  install + start a launchd agent (survives logout/reboot)
#   scripts/host-runner.sh --uninstall-agent
#   scripts/host-runner.sh --status         is the agent loaded? (+ the log tail)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="$ROOT/.venv-host-runner"
# Each run gets a fresh scratch directory under here (removed afterwards); also holds the log.
WORKDIR="${SHIRE_HOST_RUNNER_DIR:-$HOME/.shire/host-runner}"
LABEL="com.shire.host-runner"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PYTHON="${PYTHON:-python3}"

# The stable install location first: a `claude` found via PATH can be a per-terminal shim that
# disappears when that terminal closes, which would break the launchd agent.
resolve_claude() {
  if [[ -n "${ENGINE_CLAUDE_BINARY:-}" ]]; then
    echo "$ENGINE_CLAUDE_BINARY"
  elif [[ -x "$HOME/.local/bin/claude" ]]; then
    echo "$HOME/.local/bin/claude"
  else
    command -v claude || true
  fi
}

ensure_venv() {
  # Also rebuilt when its interpreter is gone (a Homebrew Python upgrade leaves dead links).
  if ! "$VENV/bin/python" -c "" 2>/dev/null; then
    echo "Creating $VENV ..."
    "$PYTHON" -m venv --clear "$VENV"
  fi
  # Cheap when already installed; picks up engine source changes (editable install).
  "$VENV/bin/pip" install -q -e "$ROOT/engine"
}

case "${1:-}" in
  --install-agent)
    ensure_venv
    mkdir -p "$WORKDIR" "$(dirname "$PLIST")"
    CLAUDE_BIN="$(resolve_claude)"
    [[ -n "$CLAUDE_BIN" ]] || { echo "claude not found (set ENGINE_CLAUDE_BINARY)" >&2; exit 1; }
    cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$ROOT/scripts/host-runner.sh</string></array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(dirname "$CLAUDE_BIN"):/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>ENGINE_CLAUDE_BINARY</key><string>$CLAUDE_BIN</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$WORKDIR/runner.log</string>
  <key>StandardErrorPath</key><string>$WORKDIR/runner.log</string>
</dict>
</plist>
EOF
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST"
    echo "Installed $LABEL (claude: $CLAUDE_BIN) — logs: $WORKDIR/runner.log"
    exit 0
    ;;
  --uninstall-agent)
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "Removed $LABEL"
    exit 0
    ;;
  --status)
    launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | grep -E "state =|pid =" || echo "$LABEL not loaded"
    tail -n 20 "$WORKDIR/runner.log" 2>/dev/null || true
    exit 0
    ;;
  "") ;;
  *) echo "unknown option: $1" >&2; exit 2 ;;
esac

ensure_venv
mkdir -p "$WORKDIR"
cd "$WORKDIR"

export ENGINE_DATABASE_URL="${ENGINE_DATABASE_URL:-postgresql://shire:shire@localhost:5434/shire}"
export ENGINE_CLAUDE_BINARY="$(resolve_claude)"
export ENGINE_INCLUDE_KINDS="ai_action.run"
export ENGINE_EXCLUDE_KINDS=""
# The backend looks for this name in pg_stat_activity to show "runner connected".
export ENGINE_APPLICATION_NAME="shire-host-runner"
export ENGINE_CONCURRENCY="${ENGINE_CONCURRENCY:-2}"
# Never publish a version marker from the host — that file belongs to the Docker engine.
unset ENGINE_CLAUDE_VERSION_FILE

exec "$VENV/bin/python" -m engine
