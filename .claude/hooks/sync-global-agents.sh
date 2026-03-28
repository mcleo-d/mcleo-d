#!/usr/bin/env bash
# Fetches global agent definitions from mcleo-d/mcleo-d and installs them
# into ~/.claude/agents/ so they are available across all projects.
#
# Works in:
#   - Claude Code on the web (cloud sessions)
#   - Any project whose .claude/settings.json includes this hook
#   - Locally via ~/.claude/settings.json (use an absolute path there)

set -euo pipefail

AGENTS_DIR="$HOME/.claude/agents"
REPO_API="https://api.github.com/repos/mcleo-d/mcleo-d/contents/.claude/agents?ref=main"

mkdir -p "$AGENTS_DIR"

echo "[sync-global-agents] Fetching agent list from mcleo-d/mcleo-d..."

# List agent files via GitHub API, download each via its download_url
curl -sf "$REPO_API" \
  | grep -o '"download_url":"[^"]*"' \
  | cut -d'"' -f4 \
  | while IFS= read -r url; do
      name=$(basename "$url")
      curl -sf "$url" -o "$AGENTS_DIR/$name"
      echo "[sync-global-agents] Installed: $name"
    done

echo "[sync-global-agents] Done."
