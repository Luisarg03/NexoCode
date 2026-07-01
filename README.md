# NexoCode

> **⚠️ Status: Heavily WIP — not stable.**

Independent fork of [opencode](https://github.com/sst/opencode) — the open-source AI coding agent CLI.

## What NexoCode Changes

| Area | Change |
|------|--------|
| **XDG compliance** | Config, cache, and data directories follow the XDG Base Directory spec |
| **Plugin hardening** | Error isolation, capability manifests, sandboxed external plugin execution |
| **Scope reduction** | CLI-only packages retained; web/enterprise/server packages removed |
| **Dev environment** | Docker-first workflow via `docker-dev/` |

## Quick Start (Docker)

```bash
# 1. Clone
git clone https://github.com/NexoCode/NexoCode
cd NexoCode

# 2. Build image (first time ~5–10 min — downloads Node.js, bun, native build tools)
docker compose -f docker-dev/docker-compose.yml build

# 3. Set at least one API key and run
export ANTHROPIC_API_KEY=sk-ant-...   # or any supported provider below
docker compose -f docker-dev/docker-compose.yml run -it nexocode-dev
```

Inside the container shell:

```bash
bun run dev          # start CLI / TUI in dev mode
bun turbo typecheck  # typecheck all packages
bun turbo test       # run full test suite
```

## Provider: OpenCode Zen

NexoCode works exclusively with [OpenCode Zen](https://opencode.ai/zen) — the opencode.ai API gateway.

```bash
export OPENCODE_API_KEY=your-zen-key
```

Get a key at https://opencode.ai/zen. Free tier available (rate-limited free models).

## Repository Layout

```
NexoCode/
├── docker-dev/              # Docker dev environment
│   ├── Dockerfile           #   oven/bun:1.3.14 + nodejs + node-gyp + build tools
│   ├── docker-compose.yml   #   host-network, named volumes for bun cache + node_modules
│   └── entrypoint.sh        #   runs bun install, prints usage, execs CMD
└── src/                     # Monorepo root (Bun workspace, 13 packages)
    ├── package.json
    ├── packages/
    │   ├── opencode/        #   CLI entry point — yargs commands, TUI launcher (v1.17.6)
    │   ├── core/            #   Session runtime, storage, context management
    │   ├── tui/             #   Terminal UI (SolidJS + @opentui)
    │   ├── llm/             #   LLM abstraction layer over 17 providers
    │   ├── server/          #   HTTP API (Hono)
    │   ├── plugin/          #   Plugin runtime + sandboxing
    │   ├── sdk/             #   Public SDK (js/)
    │   ├── ui/              #   Shared UI components (SolidJS + Kobalte + Tailwind)
    │   └── ...              #   effect-drizzle-sqlite, effect-sqlite-node, http-recorder, script
    └── specs/               #   Architecture specs and design documents
```

## Running Without Docker

Requirements:

- **Bun** ≥ 1.3.14
- **Node.js** + **npm** (required by tree-sitter native grammar compilation)
- **Python 3** + `python-is-python3` (node-gyp dependency)
- **C/C++ build tools** (`build-essential` on Debian/Ubuntu, Xcode CLT on macOS)
- **node-gyp** globally: `npm install -g node-gyp`

```bash
cd src
bun install
bun run dev
```

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Bun 1.3.14 |
| Language | TypeScript (ESM) |
| TUI | SolidJS + @opentui |
| HTTP API | Hono |
| Database | SQLite via Drizzle ORM |
| Effects | Effect (typed effects, OTel, platform-node) |
| Protocol | MCP SDK, ACP, LSP |
| Parsing | tree-sitter (bash, powershell grammars) |

## License

MIT — see [`src/LICENSE`](src/LICENSE).

---

*Based on [opencode](https://github.com/sst/opencode) by SST.*
