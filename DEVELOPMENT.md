# Development Methodology

## Principles

- **All testing happens inside the Docker container.** Never test on the host directly.
- **Single test model:** `opencode/deepseek-v4-flash-free` — always use this model when validating changes.
- **Branch discipline:** `feat/*` → `dev` → `main` (stable milestones only).
- **No host dependencies:** the container provides the full reproducible environment.

---

## Environment Setup

### Prerequisites

- Docker + Docker Compose
- A `docker-dev/.env` file with API keys (see `docker-dev/.env.example`)

### First-Time Setup

```bash
# 1. Copy env template and fill in your keys
cp docker-dev/.env.example docker-dev/.env
# Edit docker-dev/.env — add OPENROUTER_API_KEY at minimum

# 2. Build the dev image (first time ~5-10 min)
docker compose -f docker-dev/docker-compose.yml build

# 3. Start the container
docker compose -f docker-dev/docker-compose.yml run -it nexocode-dev
```

Inside the container shell:

```bash
bun run dev          # start the TUI in dev mode
bun turbo typecheck  # typecheck all packages
bun turbo test       # run the full test suite
```

### Rebuild After Dockerfile Changes

```bash
docker compose -f docker-dev/docker-compose.yml build --no-cache
```

---

## Testing Model

All manual testing uses **`opencode/deepseek-v4-flash-free`** (OpenRouter).

This is the default in `docker-dev/test-config/opencode.jsonc` — no manual selection needed.

To use a different model temporarily (inside container):

```bash
OPENCODE_CONFIG=/workspace/docker-dev/test-config/opencode.jsonc bun run dev
# Then select model in TUI with /model command
```

---

## Environment Variables

Docker Compose reads `docker-dev/.env` automatically (file is gitignored).

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENROUTER_API_KEY` | ✅ Yes | OpenCode Zen gateway key — required for `opencode/*` models |

See `docker-dev/.env.example` for the full template.

---

## Container Details

| Item | Value |
|------|-------|
| Base image | `oven/bun:1.3.14` (Debian) |
| Working dir | `/workspace/src` |
| Repo mount | `..:/workspace:rw` (edits on host reflect immediately) |
| `node_modules` | Named Docker volume (`src-node-modules`) — not on host |
| Bun cache | Named Docker volume (`bun-cache`) — persists across restarts |
| OpenCode config | `docker-dev/test-config/opencode.jsonc` |
| Network | Host mode |

---

## Branch Workflow

```
main      ← stable milestones (tagged)
dev       ← active development
feat/*    ← short-lived per roadmap item (1-3 days max)
```

```bash
# Start a roadmap item
git checkout dev
git checkout -b feat/p0-xdg

# Work... commit...

# Merge to dev
git checkout dev && git merge feat/p0-xdg

# When milestone is tested inside container → promote to main
git checkout main && git merge dev
git tag v0.1.0
git push origin main --tags
```

---

## Config Files

| File | Purpose | Tracked |
|------|---------|---------|
| `docker-dev/test-config/opencode.jsonc` | Container default config | ✅ Yes |
| `docker-dev/.env` | API keys for container | ❌ No (gitignored) |
| `docker-dev/.env.example` | Template for `.env` | ✅ Yes |
| `roadmap/` | Local planning docs | ❌ No (gitignored) |

---

## Roadmap

See `roadmap/TODO.md` for the P0→P3 implementation plan.
See `roadmap/philosophy.md` for the design change rationale.
