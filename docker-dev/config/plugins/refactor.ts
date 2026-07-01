import type { Plugin } from "@opencode-ai/plugin"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Refactor Plugin — injects the refactor skill into sessions
 * when the @refactor command is invoked.
 *
 * Hooks:
 *   command.execute.before
 *     - Detect @refactor invocation and set active flag
 *
 *   experimental.chat.system.transform
 *     - When refactor mode is active, inject the refactor skill
 *       as an available_skills XML block
 */

const SKILLS_DIR = join(
  process.env.HOME || "/root",
  ".config",
  "opencode",
  "skills",
)

const REFACTOR_SKILLS = ["refactor"] as const

type RefactorSkill = (typeof REFACTOR_SKILLS)[number]

interface SkillMeta {
  name: string
  description: string
}

function loadSkillMeta(name: string): SkillMeta | null {
  const skillPath = join(SKILLS_DIR, name, "SKILL.md")
  if (!existsSync(skillPath)) return null
  try {
    const content = readFileSync(skillPath, "utf-8")
    const nameMatch = content.match(/^name:\s*(.+)$/m)
    const descMatch = content.match(/^description:\s*(.+)$/m)
    return {
      name: nameMatch ? nameMatch[1].trim() : name,
      description: descMatch
        ? descMatch[1].trim()
        : `Refactoring skill: ${name}`,
    }
  } catch {
    return null
  }
}

function buildSkillsXml(skills: RefactorSkill[]): string {
  const lines: string[] = [
    "",
    "<!-- refactor: refactoring skills -->",
    '<available_skills project="refactor">',
  ]

  for (const skillName of skills) {
    const meta = loadSkillMeta(skillName)
    if (!meta) continue
    const skillPath = join(SKILLS_DIR, skillName, "SKILL.md")
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

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

export const RefactorPlugin: Plugin = async () => {
  console.log("[refactor] Plugin loaded — refactoring skill injector active")

  // Track whether @refactor was invoked in this session
  let refactorActive = false

  return {
    /**
     * command.execute.before — detect @refactor invocation
     */
    "command.execute.before": async (input, _output) => {
      const cmd = String(input?.command ?? "").toLowerCase()
      if (cmd === "refactor") {
        refactorActive = true
        console.log(
          "[refactor] @refactor command detected — activating refactoring mode",
        )
      }
    },

    /**
     * experimental.chat.system.transform — inject refactor skill
     * into system prompt when relevant.
     */
    "experimental.chat.system.transform": async (_input, output) => {
      // Inject if refactor mode is active
      if (refactorActive) {
        output.system.push(buildSkillsXml([...REFACTOR_SKILLS]))
        return
      }

      // Lightweight heuristic: inject if system prompt contains
      // refactoring-related keywords
      const systemText = output.system.join(" ").toLowerCase()
      const refactorKeywords = [
        "refactor",
        "refactoring",
        "code smell",
        "clean up",
        "improve code",
      ]

      const hasRefactorContext = refactorKeywords.some((kw) =>
        systemText.includes(kw),
      )
      if (hasRefactorContext) {
        output.system.push(buildSkillsXml([...REFACTOR_SKILLS]))
      }
    },
  }
}
