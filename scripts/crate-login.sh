#!/usr/bin/env bash
# crates.io login — reads token from stdin (not args) to avoid shell history leaks
set -euo pipefail

echo "=== crates.io login ==="
echo "1. Go to https://crates.io/settings/tokens"
echo "2. Revoke any old tokens"
echo "3. Create a new token (scopes: publish-new, publish-update)"
echo "4. Paste the token below (input is hidden)"
echo ""

read -rsp "Token: " TOKEN
echo ""

if [[ -z "$TOKEN" ]]; then
  echo "Error: empty token" >&2
  exit 1
fi

echo "$TOKEN" | cargo login --registry crates-io 2>/dev/null
echo "✓ Logged in to crates.io"

# Verify
WHOAMI=$(cargo owner --list tramli 2>/dev/null | head -1 || echo "unknown")
echo "  Owner: $WHOAMI"
