---
name: autoskill
description: "Scan project tech stack and auto-install matching AI skills to .opencode/skills/"
---

# autoskill

Scans your project's tech stack, installs matching AI skills from the
[autoskills](https://github.com/midudev/autoskills) registry, and generates
`.opencode/autoskills.json` with verified bundle hashes.

## Usage

```bash
@autoskill
```

Run ONE TIME per project to install relevant skills.

## Execution

Run this command to execute the bridge script:

```bash
node ~/.config/opencode/scripts/autoskills-bridge.mjs --install
```

This will:
1. Run `npx autoskills -y` to detect technologies and download skills
2. Copy skills from `.agents/skills/` → `.opencode/skills/`
3. Generate `.opencode/autoskills.json` with tech list + bundle hashes
4. Clean up `.agents/skills/` (autoskills temp dir)

## Options

```bash
@autoskill --force    # Force re-install even if manifest is fresh
```

## Project-local only

Modifies only:
- `.opencode/autoskills.json`
- `.opencode/skills/<name>/`

Never touches global agent configs or `~/.agents/skills/`.

## Auto-hook

The autoskill plugin injects installed skills as XML into the system prompt
at session start. If no manifest exists, it shows a hint to run `@autoskill`.
