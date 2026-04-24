#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

if ! command -v markdownlint >/dev/null 2>&1; then
  if command -v npm >/dev/null 2>&1; then
    npm install -g markdownlint-cli >/dev/null 2>&1 || true
  fi
fi
