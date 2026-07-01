import type { Plugin } from "@opencode-ai/plugin"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { extname } from "node:path"

/**
 * Documenter Plugin — injects documentation skills context into sessions
 * and hooks into documentation file edits.
 *
 * Hooks:
 *   experimental.chat.system.transform
 *     - When the agent is "documenter", inject full documentation skills
 *       as available_skills XML block
 *     - If the session involves doc files (.md in docs/), inject a hint
 *
 *   tool.execute.before
 *     - When editing/creating .md files (especially in docs/), inject
 *       a documentation skills reminder
 */

const DOC_SKILLS_DIR = join(
  process.env.HOME || "/root",
  ".config",
  "opencode",
  "skills",
)

const DOC_SKILLS = ["documentation-writer", "design-doc-mermaid", "codemap", "docx", "frontend-design"] as const

type DocSkill = (typeof DOC_SKILLS)[number]

// File extension restrictions — only these file types can be read/edited
const ALLOWED_DOC_EXTENSIONS = new Set([".md", ".mmd", ".puml", ".dot"])
const ALLOWED_DOC_PATTERNS = [".drawio.svg"]

interface SkillMeta {
  name: string
  description: string
}

function loadSkillMeta(name: string): SkillMeta | null {
  const skillPath = join(DOC_SKILLS_DIR, name, "SKILL.md")
  if (!existsSync(skillPath)) return null
  try {
    const content = readFileSync(skillPath, "utf-8")
    const nameMatch = content.match(/^name:\s*(.+)$/m)
    const descMatch = content.match(/^description:\s*(.+)$/m)
    return {
      name: nameMatch ? nameMatch[1].trim() : name,
      description: descMatch ? descMatch[1].trim() : `Documentation skill: ${name}`,
    }
  } catch {
    return null
  }
}

function buildSkillsXml(skills: DocSkill[]): string {
  const lines: string[] = [
    "",
    "<!-- documenter: documentation skills -->",
    '<available_skills project="documenter">',
  ]

  for (const skillName of skills) {
    const meta = loadSkillMeta(skillName)
    if (!meta) continue
    const skillPath = join(DOC_SKILLS_DIR, skillName, "SKILL.md")
    lines.push(
      `  <skill>`,
      `    <name>${escapeXml(meta.name)}</name>`,
      `    <description>${escapeXml(meta.description)}</description>`,
      `    <location>file://${escapeXml(skillPath)}</location>`,
      `  </skill>`,
    )
  }

  lines.push("</available_skills>", "")
  return lines.join("\n")
}

function buildAutoLoadDirective(skills: DocSkill[]): string {
  const loadCalls = skills.map((s) => `skill("${s}")`).join("\n")
  return [
    "",
    "<!-- documenter: auto-load directive -->",
    "## Auto-Load Documentation Skills",
    "Carga automáticamente TODAS las skills de documentación disponibles llamando a `skill()` para cada una:",
    "",
    "```",
    loadCalls,
    "```",
    "",
    "Haz esto AL INICIO de la sesión, antes de cualquier otra acción.",
    "Si alguna skill no se carga, continuá sin ella.",
    "",
  ].join("\n")
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/**
 * Check if a file path is a documentation or diagram file
 * (used by tool.execute.before to inject metadata hints).
 */
function isDocFile(filePath: string): boolean {
  return isAllowedFile(filePath)
}

/**
 * Check if a file path is an allowed documentation file type
 * (.md + diagram extensions).
 */
function isAllowedFile(filePath: string): boolean {
  const lower = filePath.toLowerCase()
  // Check compound patterns first (.drawio.svg)
  for (const pattern of ALLOWED_DOC_PATTERNS) {
    if (lower.endsWith(pattern)) return true
  }
  // Check simple extensions
  const ext = extname(lower)
  return ALLOWED_DOC_EXTENSIONS.has(ext)
}

export const DocumenterPlugin: Plugin = async () => {
  console.log("[documenter] Plugin loaded — documentation skills injector active")

  // Track whether @documenter was invoked in this session
  let documenterActive = false

  return {
    /**
     * command.execute.before — detect @documenter invocation
     */
    "command.execute.before": async (input, _output) => {
      const cmd = String(input?.command ?? "").toLowerCase()
      if (cmd === "documenter") {
        documenterActive = true
        console.log("[documenter] @documenter command detected — activating documentation mode")
      }
    },

    /**
     * permission.ask — restrict read/edit to allowed doc file types.
     * Denies access to code files, config files, etc.
     */
    "permission.ask": async (input, output) => {
      const tool = String(input?.tool ?? "").toLowerCase()

      // Only restrict read, write, and edit tools
      if (tool !== "read" && tool !== "write" && tool !== "edit") return

      // Skip for skill() tool internal reads (skill files always allowed)
      if (tool === "read" && String(input?.reason ?? "").includes("skill")) return

      const args = input?.args
      if (!args || typeof args !== "object") return

      // Extract file path from tool args
      const filePath = (args as Record<string, unknown>).filePath ??
                       (args as Record<string, unknown>).path ??
                       (args as Record<string, unknown>).file_path
      if (typeof filePath !== "string" || !filePath) return

      if (isAllowedFile(filePath)) {
        // Auto-allow — no user prompt needed
        output.status = "allow"
        return
      }

      // Block access to non-doc files silently
      output.status = "deny"
      output.reason = `documenter solo puede acceder a archivos .md, .mmd, .puml, .dot, .drawio.svg`
    },

    /**
     * experimental.chat.system.transform — inject documentation skills
     * into system prompt when relevant.
     */
    "experimental.chat.system.transform": async (_input, output) => {
      // Always inject if documenter mode is active
      if (documenterActive) {
        output.system.push(buildSkillsXml([...DOC_SKILLS]))
        output.system.push(buildAutoLoadDirective([...DOC_SKILLS]))
        return
      }

      // Check if session context suggests documentation work
      // (lightweight heuristic: only inject if the system prompt
      //  already has documentation-related content)
      const systemText = output.system.join(" ").toLowerCase()
      const docKeywords = [
        "documentation",
        "documenter",
        "diátaxis",
        "readme",
        "wiki",
        "docs",
        "mermaid",
        "diagram",
      ]

      const hasDocContext = docKeywords.some((kw) => systemText.includes(kw))
      if (hasDocContext) {
        output.system.push(buildSkillsXml([...DOC_SKILLS]))
        output.system.push(buildAutoLoadDirective([...DOC_SKILLS]))
      }
    },

    /**
     * tool.execute.before — detect doc file edits and inject
     * documentation hint.
     */
    "tool.execute.before": async (input, output) => {
      const tool = String(input?.tool ?? "").toLowerCase()
      if (tool !== "write" && tool !== "edit") return

      const args = input?.args
      if (!args || typeof args !== "object") return

      const filePath = (args as Record<string, unknown>).filePath ??
                       (args as Record<string, unknown>).path
      if (typeof filePath !== "string" || !filePath) return

      if (isDocFile(filePath)) {
        // Add a metadata hint that documentation skills are available
        output.metadata = output.metadata || {}
        output.metadata.documenter = {
          hint: "Editing documentation file — documentation skills auto-loaded. Use skill() if not yet loaded.",
          availableSkills: [...DOC_SKILLS],
          autoLoad: true,
        }

        // Optionally modify args to add a system-level note
        // (disabled by default to avoid interference)
      }
    },
  }
}
