import type { Plugin } from "@opencode-ai/plugin"

/**
 * Delegation Plugin v2 — Runtime enforcement of delegation hierarchy.
 *
 * SIX LAYERS:
 *   1a. event             — track parent→child session relationships
 *   1b. chat.message      — track sessionID→agent name mapping
 *   2.  tool.execute.before — HARD BLOCK task/subtask from subagents (args sabotage)
 *   3.  permission.ask    — auto-allow bash for subagent sessions (prevent ask hangs)
 *   4.  system.transform  — delegation rules injected into system prompt
 *   5.  tool.definition   — delegation hints in tool descriptions
 *   6.  tool.execute.after — post-hoc reminders + fixer circuit breaker
 *
 * Layers 1-3 are RUNTIME enforcement (hard blocks, cannot be ignored by LLM).
 * Layers 4-6 are SOFT enforcement (hints/reminders, may be ignored by cheap models).
 *
 * Why runtime enforcement:
 *   - `subtask:deny` in permission config is silently ignored (not a valid key)
 *   - `task:deny` works but fixer calls `subtask` instead (different tool)
 *   - System prompt warnings ignored by cheap models (deepseek-v4-flash-free)
 *   - `permission.ask` causes headless hangs in non-interactive subagent sessions
 */

// ── Session tracking (populated by event + chat.message hooks) ────
const sessionAgents = new Map<string, string>()   // sessionID → agent name
const sessionParents = new Map<string, string>()   // childID → parentID

/**
 * Returns true if the session belongs to a subagent (not the orchestrator).
 * Dual detection for redundancy:
 *   - chat.message provides agent name (fires before first tool call)
 *   - event/session.created provides parent relationship (fires at session init)
 */
function isSubagent(sessionID: string): boolean {
  const agent = sessionAgents.get(sessionID)
  if (agent && agent !== "orchestrator") return true
  return sessionParents.has(sessionID)
}

// ── Hints per tool (Layer 5: tool.definition) ─────────────────────
type Hints = Record<string, string>

const DELEGATION_HINTS: Hints = {
  read: [
    "!! DELEGATION: For 3+ files, directory patterns, or combining with grep/glob -> subtask @explorer (10x cheaper, parallel).",
    "Direct use ok for 1-2 simple files.",
  ].join(" "),

  bash: [
    "!! DELEGATION: For filesystem exploration across 3+ files (ls, find, cat across dirs) -> subtask @explorer (10x cheaper).",
    "For web research -> subtask @librarian (10x cheaper).",
    "Direct use ok for git, ls, mkdir, and single read-only commands.",
  ].join(" "),

  glob: [
    "!! DELEGATION: ALWAYS prefer subtask -> @explorer (10x cheaper, parallel).",
    "Direct use ok for 1-2 simple patterns only.",
  ].join(" "),

  grep: [
    "!! DELEGATION: ALWAYS prefer subtask -> @explorer (10x cheaper, parallel).",
    "Direct use ok for 1-2 simple patterns in known locations only.",
  ].join(" "),

  websearch: [
    "!! DELEGATION: ALWAYS prefer subtask -> @librarian (10x cheaper).",
    "Direct use only for a quick single query.",
  ].join(" "),

  webfetch: [
    "!! DELEGATION: ALWAYS prefer subtask -> @librarian (10x cheaper).",
    "Direct use only for a quick single URL fetch.",
  ].join(" "),

  write: [
    "!! DELEGATION: Orchestrator has write:deny. ALL file creation MUST go through task(subagent_type: \"fixer\").",
  ].join(" "),

  edit: [
    "!! DELEGATION: Orchestrator has edit:deny. ALL file modification MUST go through task(subagent_type: \"fixer\").",
  ].join(" "),

  subtask: [
    "!! DELEGATION: Only the orchestrator should use subtask.",
    "Subagents (fixer, explorer, librarian, etc.) must NOT use subtask — complete work directly with your tools.",
  ].join(" "),

  task: [
    "!! DELEGATION: Only the orchestrator should use task.",
    "Subagents must NOT spawn other agents — complete work directly with your tools.",
  ].join(" "),
}

// ── Reminders (Layer 6: tool.execute.after) ───────────────────────
type ReminderFn = (args: Record<string, unknown>) => string | null

const REMINDERS: Record<string, ReminderFn> = {
  glob: () =>
    "⚠️  DELEGATION: For searching multiple patterns/directories, use subtask -> @explorer (10x cheaper, parallel).",

  grep: () =>
    "⚠️  DELEGATION: For multi-file content search across directories, use subtask -> @explorer (10x cheaper, parallel).",

  read: (args) => {
    const filePath = args?.filePath as string | string[] | undefined
    if (Array.isArray(filePath) && filePath.length >= 3) {
      return "⚠️  DELEGATION: For reading 3+ files or directory exploration, use subtask -> @explorer (10x cheaper, parallel)."
    }
    return null
  },

  bash: (args) => {
    const cmd = String(args?.command ?? "")
    if (/^(ls|find|cat|head|tail|wc|du|df|tree|stat|file|type|which)\b/i.test(cmd.trim())) {
      return "⚠️  DELEGATION: For filesystem exploration, use subtask -> @explorer (10x cheaper, does glob/grep/read in parallel)."
    }
    return null
  },

  websearch: () =>
    "⚠️  DELEGATION: For web research, use subtask -> @librarian (10x cheaper).",

  webfetch: () =>
    "⚠️  DELEGATION: For fetching URLs/web content, use subtask -> @librarian (10x cheaper).",

  write: () =>
    "⚠️  DELEGATION: For well-defined edits or bug fixes, use subtask -> @fixer (10x cheaper, auto-validates).",

  edit: () =>
    "⚠️  DELEGATION: For well-defined edits or bug fixes, use subtask -> @fixer (10x cheaper, auto-validates).",

  subtask: () =>
    "⚠️  DELEGATION: Only the orchestrator should use subtask. Subagents must complete work directly.",

  task: (args) => {
    const subagentType = (args as Record<string, unknown>)?.subagent_type
    if (subagentType) {
      return "⚠️  DELEGATION: Subagents should NOT spawn other agents. Complete work directly with your tools."
    }
    return null
  },
}

// ── Circuit breaker: detect fixer failure loops ───────────────────
const FIXER_FAILURES = new Map<string, number>()
const MAX_FIXER_FAILURES = 2

function checkFixerCircuitBreaker(input: Record<string, unknown>, output: Record<string, unknown>): void {
  if (input.tool !== "task") return
  const args = input.args as Record<string, unknown> | undefined
  if (args?.subagent_type !== "fixer") return

  const sessionId = (input.sessionID as string) ?? "global"
  const result = String(output.output ?? "")
  const isFailure = result.length < 80 || /error|fail|can't|cannot|timed?\s*out/i.test(result.slice(0, 300))

  const current = FIXER_FAILURES.get(sessionId) ?? 0
  if (isFailure) {
    FIXER_FAILURES.set(sessionId, current + 1)
  } else {
    FIXER_FAILURES.set(sessionId, 0)
  }

  if (current >= MAX_FIXER_FAILURES) {
    output.output = (output.output ?? "") +
      "\n\n⚠️  [DELEGATION BREAKER] Fixer ha fallado consecutivamente. " +
      "NO delegar más a fixer en esta sesión. Usar enfoque alternativo " +
      "(bash/comandos directos con aprobación del usuario si es necesario)."
  }
}

// ── Rate limiter ─────────────────────────────────────────────────
const MAX_REMINDERS_PER_SESSION = 5
const reminderCount = new Map<string, number>()

// ══════════════════════════════════════════════════════════════════
// Plugin export
// ══════════════════════════════════════════════════════════════════

export const DelegationPlugin: Plugin = async () => {
  console.log("[delegation] Plugin v2 loaded — 6 layers: tracking + block + auto-allow + system prompt + hints + reminders")

  return {
    // ── Layer 1a: Event tracking ────────────────────────────────
    // Tracks parent→child session relationships for isSubagent().
    event: async (input) => {
      const ev = input.event
      if (ev.type === "session.created") {
        const props = (ev as any).properties
        const info = props?.info ?? props
        const childId = info?.id as string | undefined
        const parentId = info?.parentID as string | undefined
        if (childId && parentId) {
          sessionParents.set(childId, parentId)
          console.log(`[delegation] session tracked: ${childId} (parent: ${parentId})`)
        }
      }
      if (ev.type === "session.deleted") {
        const props = (ev as any).properties
        const id = (props?.info?.id ?? props?.sessionID ?? props?.id) as string | undefined
        if (id) {
          sessionParents.delete(id)
          sessionAgents.delete(id)
        }
      }
    },

    // ── Layer 1b: Agent tracking ────────────────────────────────
    // Maps sessionID → agent name for isSubagent().
    "chat.message": async (input) => {
      if (input.agent && input.sessionID) {
        sessionAgents.set(input.sessionID, input.agent)
      }
    },

    // ── Layer 2: HARD BLOCK task/subtask from subagents ─────────
    // Sabotages the prompt so the child session receives an error
    // message and returns immediately. Cannot be bypassed by LLM.
    "tool.execute.before": async (input, output) => {
      const tool = input.tool
      if (tool !== "task" && tool !== "subtask") return

      if (isSubagent(input.sessionID)) {
        const agent = sessionAgents.get(input.sessionID) ?? "unknown-subagent"
        const args = output.args as Record<string, unknown>

        // Replace prompt with error — child session will return this
        args.prompt = [
          `[DELEGATION BLOCKED BY PLUGIN]`,
          `Agent "${agent}" attempted to use ${tool}() but subagents cannot re-delegate.`,
          `Return this exact message to the caller:`,
          `"ERROR: Re-delegation blocked. Agent ${agent} must complete work directly`,
          `with its own tools (read, write, edit, bash, glob, grep).`,
          `Do not attempt to spawn child agents."`,
        ].join(" ")

        console.log(`[delegation] BLOCKED: ${agent} tried ${tool}() in session ${input.sessionID}`)
      }
    },

    // ── Layer 3: Auto-allow bash for subagent sessions ──────────
    // Prevents headless 'ask' hangs where no user can respond.
    // Only fires when permission would be 'ask' (deny stays deny).
    // Safe because: rm→deny (untouched), npm→deny (untouched).
    "permission.ask": async (input, output) => {
      if (input.type === "bash" && output.status === "ask" && isSubagent(input.sessionID)) {
        output.status = "allow"
        console.log(`[delegation] auto-allowed bash for subagent session ${input.sessionID}`)
      }
    },

    // ── Layer 4: System prompt injection ────────────────────────
    // Orchestrator gets full delegation rules + cost table.
    // Subagents get only the prohibition (they cannot delegate — ~50 tokens vs ~400).
    "experimental.chat.system.transform": async (_input, output) => {
      const sessionID = _input.sessionID ?? ""
      const isSub = isSubagent(sessionID)

      if (isSub) {
        output.system.push([
          "<delegation_rules>",
          "",
          "PROHIBIDO PARA SUBAGENTES:",
          "  - NO uses task() ni subtask(). Completá el trabajo directamente con tus tools.",
          "  - Solo el orquestador principal puede delegar via task()/subtask().",
          "  - Si algo falta, retorná un mensaje explicando qué necesitás.",
          "  - El plugin de delegación BLOQUEARÁ task/subtask de subagentes en runtime.",
          "",
          "</delegation_rules>",
        ].join("\n"))
      } else {
        output.system.push([
          "<delegation_rules>",
          "",
          "OBLIGATORIO: DELEGACION PROACTIVA para optimizar costo y velocidad.",
          "",
          "COSTOS RELATIVOS:",
          "  orquestador (big-pickle)     = 1x (caro, para razonamiento arquitectonico)",
          "  @explorer @librarian @fixer  = deepseek-v4-flash-free (0.1x, MUY barato)",
          "  @designer                    = nemotron-free (GRATIS)",
          "",
          "REGLA DE ORO:",
          "  Si la tarea es exploracion/multi-archivo/investigacion web",
          "  y no requiere razonamiento denso del orquestador -> DELEGA.",
          "  Usa task() para lanzar subagentes especializados en paralelo.",
          "",
          "CUANDO NO DELEGAR:",
          "  - Tareas puramente de lectura (1 read, 1 glob chico)",
          "  - Operaciones git (add, commit, push, status, diff, log)",
          "  - Decisiones arquitectonicas (esas van a @oracle, mismo costo)",
          "",
          "CUANDO DELEGAR OBLIGATORIO (write:deny / edit:deny):",
          "  - CUALQUIER write/edit de archivos -> task(subagent_type: \"fixer\")",
          "  - CUALQUIER bash que no sea git/ls/mkdir -> task(subagent_type: \"fixer\")",
          "  - Tests, builds, installs -> task(subagent_type: \"fixer\")",
          "  - Busquedas multi-archivo -> task(subagent_type: \"explorer\")",
          "  - Investigacion web -> task(subagent_type: \"librarian\")",
          "",
          "CUANDO UN SUBAGENTE FALLA:",
          "  - Si un subagente retorna sin completar la tarea, NO reintentar mas de una vez.",
          "  - Reportar el fallo y continuar con enfoque alternativo.",
          "  - El systema inyectara [DELEGATION BREAKER] si fixer falla repetidamente.",
          "",
          "PERMISOS BASH (global, aplica a TODOS los agentes):",
          "  - rm / rm -rf: DENEGADO. No intentar. Usar mv para reubicar, write/edit para reemplazar.",
          "  - cp, mv, cat, echo, ls, git, mkdir: PERMITIDO.",
          "  - Otros comandos: requieren aprobacion del usuario (ask).",
          "  - Si un comando es denegado, NO reintentar. Usar herramientas alternativas (write, edit, mv).",
          "",
          "PROHIBIDO PARA SUBAGENTES:",
          "  - Si sos un subagente (fixer, explorer, librarian, designer, refactor, etc.),",
          "    NO uses task() ni subtask(). Completá el trabajo directamente con tus tools.",
          "  - Solo el orquestador principal puede delegar via task()/subtask().",
          "  - Si necesitas algo que no podes hacer, retorná un mensaje explicando qué falta.",
          "  - El plugin de delegación BLOQUEARÁ task/subtask de subagentes en runtime.",
          "",
          "</delegation_rules>",
        ].join("\n"))
      }
    },

    // ── Layer 5: Tool description hints ─────────────────────────
    "tool.definition": async (input, output) => {
      const hint = DELEGATION_HINTS[input.toolID]
      if (!hint) return
      output.description = [
        "[DELEGATION]",
        hint,
        "",
        "---",
        output.description,
      ].join("\n")
    },

    // ── Layer 6: Post-hoc reminders + circuit breaker ───────────
    "tool.execute.after": async (input, output) => {
      // Circuit breaker — independent of rate limiter
      checkFixerCircuitBreaker(input as Record<string, unknown>, output as Record<string, unknown>)

      const reminderFn = REMINDERS[input.tool]
      if (!reminderFn) return

      const sessionId = input.sessionID ?? "global"
      const count = reminderCount.get(sessionId) ?? 0
      if (count >= MAX_REMINDERS_PER_SESSION) return

      const reminder = reminderFn(input.args as Record<string, unknown>)
      if (!reminder) return

      reminderCount.set(sessionId, count + 1)
      output.output = (output.output ?? "") + "\n\n" + reminder
    },
  }
}
