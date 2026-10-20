#!/usr/bin/env bash
# Launchpad host runner: the Shire engine, run natively on this machine with YOUR logged-in
# `claude` CLI — the only place your claude.ai MCP connectors (Atlassian, BigQuery, GitHub, ...)
# exist. It claims only Launchpad actions and MCP probes; the Docker engine runs everything else.
#
# Prerequisites:
#   1. The DB published on the host: add docker-compose.db-port.yml to COMPOSE_FILE in .env,
#      then `docker compose up -d db`.
#   2. `claude` on PATH and logged in (`claude mcp list` shows your connectors).
#
# Usage:
#   scripts/host-runner.sh                  run in the foreground (Ctrl-C to stop)
#   scripts/host-runner.sh --install-agent  install + start a launchd agent (survives logout/reboot)
#   scripts/host-runner.sh --uninstall-agent
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="$ROOT/.venv-host-runner"
# Action runs get an empty working directory: they talk to MCP servers, not files.
WORKDIR="${SHIRE_HOST_RUNNER_DIR:-$HOME/.shire/host-runner}"
LABEL="com.shire.host-runner"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PYTHON="${PYTHON:-python3}"

ensure_venv() {
  if [[ ! -x "$VENV/bin/python" ]]; then
    echo "Creating $VENV ..."
    "$PYTHON" -m venv "$VENV"
  fi
  # Cheap when already installed; picks up engine source changes (editable install).
  "$VENV/bin/pip" install -q -e "$ROOT/engine"
}

case "${1:-}" in
  --install-agent)
    ensure_venv
    mkdir -p "$WORKDIR" "$(dirname "$PLIST")"
    CLAUDE_BIN="$(command -v claude || true)"
    [[ -n "$CLAUDE_BIN" ]] || { echo "claude not found on PATH" >&2; exit 1; }
    cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$ROOT/scripts/host-runner.sh</string></array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$(dirname "$CLAUDE_BIN"):/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$WORKDIR/runner.log</string>
  <key>StandardErrorPath</key><string>$WORKDIR/runner.log</string>
</dict>
</plist>
EOF
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST"
    echo "Installed $LABEL — logs: $WORKDIR/runner.log"
    exit 0
    ;;
  --uninstall-agent)
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "Removed $LABEL"
    exit 0
    ;;
  "") ;;
  *) echo "unknown option: $1" >&2; exit 2 ;;
esac

ensure_venv
mkdir -p "$WORKDIR"
cd "$WORKDIR"

export ENGINE_DATABASE_URL="${ENGINE_DATABASE_URL:-postgresql://shire:shire@localhost:5434/shire}"
export ENGINE_INCLUDE_KINDS="launchpad.action,mcp.probe"
export ENGINE_EXCLUDE_KINDS=""
export ENGINE_APPLICATION_NAME="shire-host-runner"
export ENGINE_CONCURRENCY="${ENGINE_CONCURRENCY:-2}"
# Never publish a version marker from the host — that file belongs to the Docker engine.
unset ENGINE_CLAUDE_VERSION_FILE

exec "$VENV/bin/python" -m engine
