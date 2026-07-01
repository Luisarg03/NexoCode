#!/usr/bin/env bash
set -e

# Mark the mounted workspace as a safe git directory (owner mismatch between host and container)
git config --global --add safe.directory /workspace 2>/dev/null || true

cd /workspace/src

# Sync dependencies only when bun.lockb changed since last install
if [ ! -d "node_modules" ] || [ "bun.lock" -nt "node_modules" ]; then
  echo "[nexocode-dev] Syncing dependencies..."
  bun install --frozen-lockfile 2>/dev/null || bun install
else
  echo "[nexocode-dev] Dependencies up to date."
fi

echo ""
echo "[nexocode-dev] Ready."
echo "[nexocode-dev]   bun run dev            — run CLI in dev mode"
echo "[nexocode-dev]   bun turbo test         — run full test suite"
echo "[nexocode-dev]   bun turbo typecheck    — typecheck all packages"
echo "[nexocode-dev]   bun run --cwd packages/opencode build — build CLI binary"
echo ""

exec "$@"
