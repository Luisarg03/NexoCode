#!/usr/bin/env bash
# Smoke test: validates container boots, config loads, and model responds via OpenCode Zen API.
# ponytail: direct API call instead of full TUI session — deterministic, fast.
# upgrade path: add opencode CLI --non-interactive test when that flag exists upstream.
set -euo pipefail

COMPOSE_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/docker-compose.yml"

echo ""
echo "NexoCode — Smoke Test"
echo "====================="
echo ""

docker compose -f "$COMPOSE_FILE" run --rm -T nexocode-dev bash -s << 'INNER'
set -uo pipefail
PASS=0; FAIL=0

ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

echo "[1/4] Container environment"
bun --version  > /dev/null 2>&1 && ok "bun $(bun --version)"  || fail "bun not found"
node --version > /dev/null 2>&1 && ok "node $(node --version)" || fail "node not found"

echo ""
echo "[2/4] Config files"
[ -f /root/.config/opencode/opencode.jsonc ]       && ok "opencode.jsonc"   || fail "opencode.jsonc missing"
[ -f /root/.config/opencode/AGENTS.md ]             && ok "AGENTS.md"        || fail "AGENTS.md missing"
[ -f /root/.config/opencode/plugins/validation.ts ] && ok "plugins/"         || fail "plugins/ missing"
[ -f /root/.config/opencode/skills/refactor/SKILL.md ] && ok "skills/"      || fail "skills/ missing"

echo ""
echo "[3/4] API connectivity — OpenCode Zen"
if [ -z "${OPENCODE_API_KEY:-}" ]; then
  fail "OPENCODE_API_KEY not set"
else
  STATUS=$(curl -sf -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer ${OPENCODE_API_KEY}" \
    "https://opencode.ai/zen/v1/models" 2>&1 || echo "000")
  [ "$STATUS" = "200" ] && ok "Zen endpoint reachable (HTTP $STATUS)" || fail "Zen unreachable (HTTP $STATUS)"
fi

echo ""
echo "[4/4] Model response"
if [ -n "${OPENCODE_API_KEY:-}" ]; then
  RESP=$(curl -sf \
    -H "Authorization: Bearer ${OPENCODE_API_KEY}" \
    -H "Content-Type: application/json" \
    "https://opencode.ai/zen/v1/chat/completions" \
    -d '{"model":"deepseek-v4-flash-free","messages":[{"role":"user","content":"Reply with exactly one word: SMOKE_OK"}],"max_tokens":16}' \
    2>/dev/null || echo "")
  [[ "$RESP" == *"SMOKE_OK"* ]] \
    && ok "deepseek-v4-flash-free responded with SMOKE_OK" \
    || fail "Unexpected response: ${RESP:0:120}"
else
  fail "skipped — no API key"
fi

echo ""
echo "============================="
echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" -eq 0 ] && echo "Result: PASSED" && exit 0 || echo "Result: FAILED" && exit 1
INNER
