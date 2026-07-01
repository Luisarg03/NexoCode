# NexoCode — AGENTS.md

Fork of [opencode](https://github.com/sst/opencode) v1.17.6.
AI coding agent CLI — local TUI + HTTP API, Docker-first dev environment.

## Quick Reference

| Task | Command |
|------|---------|
| Dev mode | `cd src && bun run dev` |
| Typecheck | `cd src && bun turbo typecheck` |
| Tests | `cd src && bun turbo test` |
| Docker shell | `docker compose -f docker-dev/docker-compose.yml run -it nexocode-dev` |
| Smoke test | `bash docker-dev/smoke-test.sh` |

## Repository Layout

```
NexoCode/
├── docker-dev/               # Docker dev environment
│   ├── Dockerfile            #   oven/bun:1.3.14 base image
│   ├── docker-compose.yml    #   mounts ..:/workspace, passes OPENCODE_API_KEY
│   ├── config/               #   host ~/.config/opencode replicated into container
│   ├── entrypoint.sh         #   bun install + usage banner + exec "$@"
│   └── smoke-test.sh         #   smoke test: container + config + API + model
├── src/                      # Monorepo (Bun workspace, 13 packages)
│   ├── .opencode/            #   opencode self-config: agents, commands, tools
│   ├── packages/
│   │   ├── opencode/         #   CLI entry (yargs), session, tools, providers
│   │   ├── core/             #   Effect runtime, SQLite, session v2
│   │   ├── tui/              #   Terminal UI (SolidJS + @opentui)
│   │   ├── llm/              #   LLM abstraction, 20+ providers
│   │   ├── server/           #   HTTP API (Hono)
│   │   └── plugin/           #   Plugin SDK
│   └── specs/                #   Architecture specs
└── roadmap/                  #   (gitignored) planning docs
```

## Architecture

**Provider**: OpenCode Zen — single gateway (`opencode/` provider ID), all models via one `OPENCODE_API_KEY`.
Default model: `opencode/deepseek-v4-flash-free`.

**Config chain** (last wins):
1. XDG global — `~/.config/opencode/opencode.jsonc` (plugins, agents, model routing)
2. Root — `opencode.jsonc` (this file, project instructions)
3. Src — `src/.opencode/opencode.jsonc` (enabled_providers, tools, references)

**Session data flow**:
```
CLI (yargs) → bootstrap → InstanceRuntime → Server (Hono) → SDK client
                                                 ↓
                                         SessionExecution (local)
                                                 ↓
                                         SessionRunner → LLMClient → OpenCode Zen API
                                                 ↓
                                         Tool Execution (shell, read, write, ...)
```

**Database**: SQLite via Drizzle ORM — snake_case schema names, Effect SQL layer.

**Effect runtime**: Effect v4-beta (`effect-smol`). Use `Effect.gen(function*() {...})` for multi-step workflows, `Effect.fn("Name")` for named service methods. No raw promises inside Effect services.

## Code Style

Canonical rules in `src/packages/opencode/AGENTS.md`. Summary:

- No `export namespace`
- No `else` after a `return` or `throw`
- No `any` type casts
- `const` over `let` everywhere possible
- No destructuring in function parameters
- No TypeScript import path aliases
- snake_case for Drizzle ORM schema column names

## Docker Dev Environment

All development runs inside the container:

```bash
# Build image (first time, ~5–10 min)
docker compose -f docker-dev/docker-compose.yml build

# Start dev shell (with API key)
OPENCODE_API_KEY=<key> docker compose -f docker-dev/docker-compose.yml run -it nexocode-dev

# Inside container
bun run dev            # start TUI
bun turbo typecheck    # typecheck all packages
bun turbo test         # run full test suite
```

The container copies `docker-dev/config/` → `/root/.config/opencode/` at build time,
replicating the host opencode configuration (plugins, skills, agents, AGENTS.md).

`OPENCODE_API_KEY` is injected via docker-compose environment. Store it in `docker-dev/.env` (gitignored).

## Smoke Test

`docker-dev/smoke-test.sh` validates 4 checks inside the container:

1. **Container** — bun and node are available
2. **Config** — `opencode.jsonc`, `AGENTS.md`, `plugins/`, `skills/` are present at `/root/.config/opencode/`
3. **API** — OpenCode Zen endpoint returns HTTP 200 with the given key
4. **Model** — `deepseek-v4-flash-free` responds to a test prompt

Run from the opencode TUI: `/smoke`
Run standalone: `bash docker-dev/smoke-test.sh`

## Commit Conventions

Format: `type(scope): message`

| Type | When |
|------|------|
| `feat` | new feature |
| `fix` | bug fix |
| `chore` | maintenance, deps, config |
| `docs` | documentation only |
| `refactor` | code change without behavior change |
| `test` | tests only |
| `ci` | CI/CD changes |

Scope examples: `docker-dev`, `core`, `tui`, `llm`, `config`, `plugin`

Branches: `dev` (active) → `main` (stable milestones). Short `kebab-case` branch names.
