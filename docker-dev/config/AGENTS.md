# AGENTS.md

## Core Principles

- Make the smallest possible change.
- Preserve existing architecture and system behavior.
- Prefer consistency over novelty.
- Avoid unnecessary complexity.
- Never refactor unrelated code.
- Keep changes isolated, reversible, and reviewable.
- Prefer maintainability over short-term optimization.

---

## Design Principles (DRY, KISS, YAGNI)

- **DRY (Don't Repeat Yourself):** Cada pieza de conocimiento debe tener una representación única y autoritativa. Extraé duplicación en funciones, constantes o abstracciones.
- **KISS (Keep It Simple, Stupid):** La solución más simple que funciona es la mejor. Código claro > código clever. Legibilidad > ingenio.
- **YAGNI (You Ain't Gonna Need It):** No agregues funcionalidad hasta que sea necesaria. Cada línea de código es un pasivo. Preguntá: ¿resuelve el problema AHORA?
- **Consistency over Novelty:** Seguí los patrones existentes del código base. No introduzcas nuevos estilos o abstracciones sin necesidad.

> These principles are defined directly in this file and injected via the `instructions` field in `opencode.jsonc` — no plugin needed.

---

## Engineering Philosophy

- Prefer abstraction through clear boundaries and contracts.
- Prefer modular and composable designs.
- Prefer deterministic and predictable behavior.
- Prefer explicit behavior over hidden magic.
- Prefer resilience and recoverability over fragile optimizations.
- Prefer simplicity over cleverness.
- Design for long-term evolution, not short-term convenience.

---

## Decision Rules

- Verify assumptions directly in code, configuration, schema, or documentation before acting.
- Search for existing implementations before creating new ones.
- Reuse existing patterns, abstractions, and conventions whenever possible.
- Never invent APIs, interfaces, schemas, services, permissions, configurations, or infrastructure.
- Ask for clarification instead of guessing when requirements are ambiguous.

---

## Architectural Rules

- Respect module and service boundaries.
- Prefer loose coupling and high cohesion.
- Keep business logic separated from infrastructure concerns.
- Avoid leaking implementation details across layers.
- Prefer interface-driven design.
- Avoid tight runtime dependencies between components.
- Prefer dependency inversion and composition over inheritance.
- Encapsulate volatility behind stable abstractions.
- Minimize shared mutable state.
- Avoid hidden side effects.
- Design components to fail independently whenever possible.

---

## Reliability & Resilience

- Design for graceful degradation.
- Avoid single points of failure.
- Prefer idempotent operations when possible.
- Prefer retry-safe patterns.
- Handle partial failure scenarios explicitly.
- Preserve backward compatibility whenever possible.
- Avoid destructive operations without explicit confirmation.
- Prefer observable and diagnosable systems.
- Prefer predictable execution paths over implicit behavior.

---

## Security Principles

- Treat all external input as untrusted.
- Apply least-privilege principles.
- Prefer secure defaults.
- Never expose secrets, credentials, or sensitive data.
- Avoid implicit trust between components.
- Validate and sanitize inputs at boundaries.
- Avoid logging sensitive information.
- Prefer immutable and auditable workflows.
- Minimize blast radius of failures and changes.

---

## Change Management

- Keep diffs focused and minimal.
- Avoid broad formatting-only changes.
- Avoid touching unrelated files.
- Prefer incremental multi-step execution over sweeping rewrites.
- Preserve backward compatibility whenever possible.
- Do not introduce silent behavioral changes.
- Do not replace stable implementations without explicit justification.
- Never modify production-critical paths without explicit confirmation.

---

## Abstraction Rules

- Introduce abstractions only when they reduce real complexity.
- Avoid premature abstraction.
- Prefer stable interfaces over implementation coupling.
- Avoid leaking low-level details into high-level logic.
- Prefer declarative patterns when they improve clarity.
- Keep abstractions simple, composable, and testable.
- Avoid abstraction layers that provide no operational value.

---

## Testing & Validation

- Never claim success without validation.
- Validate modified components before completion.
- Prefer focused validation over unnecessary full-system execution.
- Verify behavior, not assumptions.
- If validation cannot be performed, explicitly state it.
- Prefer reproducible and deterministic validation paths.

---

## Performance & Scalability

- Prefer scalable and maintainable solutions.
- Avoid premature optimization.
- Minimize unnecessary computation and data movement.
- Prefer efficient resource utilization.
- Consider concurrency, contention, and failure scenarios.
- Design systems to scale horizontally when appropriate.

---

## Operational Excellence

- Prefer observable systems.
- Preserve diagnosability and traceability.
- Prefer explicit error handling.
- Prefer structured and actionable logging.
- Avoid operational surprises.
- Design for monitoring, recovery, and maintainability.

---

## Dependency Rules

- Prefer existing dependencies and internal capabilities.
- Avoid unnecessary external dependencies.
- Introduce new dependencies only with clear justification.
- Prefer mature, maintainable, and well-supported solutions.
- Minimize dependency surface area whenever possible.

---

## Communication Rules

- Be concise and direct.
- State assumptions explicitly.
- Mention risks and tradeoffs when relevant.
- Do not fabricate:
  - validation results
  - root causes
  - performance improvements
  - system state
  - deployment status
  - operational outcomes

---

## Forbidden Behaviors

- Do not fabricate information.
- Do not fabricate execution results.
- Do not fabricate system behavior.
- Do not perform destructive actions without explicit approval.
- Do not delete files or resources without confirmation.
- Do not introduce hidden side effects.
- Do not silently bypass safeguards or validation steps.

---

## Priority Order

1. Correctness
2. Security
3. Reliability
4. Resilience
5. Maintainability
6. Simplicity
7. Scalability
8. Performance
9. Developer convenience

---

## Python / UV Workflow

When working with Python projects, use **UV** instead of legacy tools (venv, pip, pipenv, poetry).
UV es más rápido, moderno, y reemplaza todo el toolchain clásico de Python.

### Reglas UV

- **Entorno virtual:** `uv venv` — nunca `python -m venv` o `virtualenv`
- **Instalar paquetes:** `uv add <paquete>` (si hay `pyproject.toml`) o `uv pip install <paquete>` (modo pip)
- **Sincronizar dependencias:** `uv sync` (lee `pyproject.toml` y `uv.lock`)
- **Ejecutar scripts/comandos:** `uv run <comando>` — no necesita activar el venv manualmente
- **Inicializar proyecto:** `uv init` crea estructura moderna con `pyproject.toml`
- **Lockfile:** `uv lock` genera `uv.lock` — siempre hacer commit
- **Shell en venv:** si es necesario un shell interactivo, `uv venv` crea el `.venv/`, y entonces sí `.venv/bin/activate`. Pero preferí `uv run` siempre que se pueda.
- **Tests:** `uv run pytest` (no `python -m pytest`)
- **Lint/typecheck:** `uv run ruff check .` o `uv run mypy .` según el proyecto
- **Compatibilidad:** Si el proyecto legacy tiene `requirements.txt`, usar `uv pip install -r requirements.txt`

### Qué NO hacer

- No uses `python -m venv`
- No uses `pip install` directamente
- No actives venv manualmente a menos que sea estrictamente necesario
- No uses `poetry` ni `pipenv`
- No generes `Pipfile` o `Pipfile.lock`
- No uses `setup.py` para proyectos nuevos — siempre `pyproject.toml`

### Inicialización de proyecto nuevo

```
uv init mi-proyecto
cd mi-proyecto
uv add <dependencias>
uv run <comando>
```

### Proyecto existente con pyproject.toml

```
uv sync          # instala todo de pyproject.toml + uv.lock
uv add requests  # agrega dependencia
uv run pytest    # ejecuta tests
```

### Proyecto legacy (requirements.txt)

```
uv venv
uv pip install -r requirements.txt
```

---

## Validation Pipeline

### Code Validation (deterministic)
- Todo write/edit en .ts/.tsx/.js/.py/.rs/.go dispara validation hook via plugin
- Hook corre: linter → typecheck → unit test (archivos relacionados)
- Resultados injectados como metadata.validation en tool output
- Si FAIL: orquestador debe corregir antes de proseguir

### Truth Verification (hallucination mitigation)
- Output de documentacion/analisis → delegar a @validator
- @validator recibe: output producido + contexto original (fuentes)
- Cross-check: cada claim factual debe tener source matching explicito
- Si UNVERIFIED o CONTRADICTED: descartar o marcar como no verificado
- @validator usa modelo barato (deepseek-v4-flash-free), variante high

### Delegación Proactiva (OBLIGATORIA)

El orquestador tiene **write:deny y edit:deny**. NO puede modificar archivos ni
ejecutar scripts/builds/tests directamente. Toda implementación DEBE delegarse.

Antes de ejecutar cualquier tool, evaluá si un subagente especializado puede hacerlo:
más barato, más rápido o en paralelo.

| Si necesitás...                                  | Delegá a...   | Por qué                                          |
|--------------------------------------------------|---------------|--------------------------------------------------|
| CUALQUIER write/edit de archivos                 | `@fixer`      | **OBLIGATORIO** — orquestador tiene write:deny   |
| Correr tests, builds, scripts, installs          | `@fixer`      | **OBLIGATORIO** — orquestador bash restringido   |
| Buscar 3+ archivos, globs, grep multi-archivo    | `@explorer`   | 10x más barato, ejecuta búsquedas en paralelo    |
| Investigar documentación, APIs, web research     | `@librarian`  | 10x más barato                                   |
| Revisar UI/UX, componentes visuales              | `@designer`   | Gratis (nemotron-free)                           |
| Decidir arquitectura, revisar diseño de sistemas | `@oracle`     | Mismo costo, expertise dedicado                  |

**NO delegar si:** es solo de lectura (1 read, 1 glob chico), operación git (status/diff/log/push),
o decisión arquitectónica que requiere contexto denso del orquestador.

**DELEGACION OBLIGATORIA:** el orquestador tiene write:deny y edit:deny. Cualquier modificación
de archivos o ejecución de scripts/builds/tests DEBE ir a `@fixer` via `task(subagent_type: "fixer")`.

**Ejecución paralela:** múltiples subtask independientes pueden lanzarse en simultáneo.
Ej: `task(explorer)` + `task(librarian)` al mismo tiempo.

### Validation Routing
- Code lint+typecheck+test → plugin automatico (tool.execute.after)
- Truth verification → @validator via prompt verify-truth

### When to Validate
- Modulo nuevo creado: pipeline completo (lint + typecheck + test + truth)
- Archivo existente modificado: linter + typecheck
- Documentacion/analisis generado: truth verification via @validator
- Tests: siempre passing antes de marcar tarea como completada
- Validacion fallida: NO continuar. Corregir o escalar.

---

## Repository Map

A full codemap is available at `codemap.md` in the project root.

Before working on any task, read `codemap.md` to understand:
- Project architecture and entry points
- Directory responsibilities and design patterns
- Data flow and integration points between modules

For deep work on a specific folder, also read that folder's `codemap.md`.

The global runtime config is documented at `~/.config/opencode/codemap.md`.