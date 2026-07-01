#!/usr/bin/env bash
set -e

# Mark the mounted workspace as a safe git directory (owner mismatch between host and container)
git config --global --add safe.directory /workspace 2>/dev/null || true

cd /workspace/src

# Sync dependencies only when bun.lockb changed since last install
if [ ! -d "node_modules" ] || [ "bun.lock" -nt "node_modules" ]; then
  echo "[opendrift-dev] Syncing dependencies..."
  bun install --frozen-lockfile 2>/dev/null || bun install
else
  echo "[opendrift-dev] Dependencies up to date."
fi

echo ""
echo "[opendrift-dev] Ready."
echo "[opendrift-dev]   bun run dev            — run CLI in dev mode"
echo "[opendrift-dev]   bun turbo test         — run full test suite"
echo "[opendrift-dev]   bun turbo typecheck    — typecheck all packages"
echo "[opendrift-dev]   bun run --cwd packages/opencode build — build CLI binary"
echo ""

exec "$@"
