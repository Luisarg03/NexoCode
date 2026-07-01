import type { Plugin } from "@opencode-ai/plugin";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Autoskill Plugin — auto-detects project tech and integrates
 * autoskills-installed skills into OpenCode sessions.
 *
 * Hooks:
 *   experimental.chat.system.transform
 *     - Checks .opencode/autoskills.json in the project root
 *     - If missing or stale: adds instructions to run `@autoskill`
 *     - If present: injects detected tech and available skills into context
 *
 * Project-local only — never touches global skill directories.
 */

const MAX_MANIFEST_AGE_MS = 24 * 60 * 60 * 1000; // 24h

interface Manifest {
  version: number;
  updatedAt: string;
  projectTech: string[];
  installedSkills: Record<string, {
    source: string;
    bundleHash: string;
    installedAt: string;
  }>;
}

export const AutoskillPlugin: Plugin = async () => {
  console.log("[autoskill] Plugin loaded — monitoring project skills");

  return {
    "experimental.chat.system.transform": async (_input, output) => {
      try {
        await injectAutoskillContext(output);
      } catch (err) {
        // Don't let autoskill crash the session
        console.error("[autoskill] Error injecting context:", err instanceof Error ? err.message : err);
      }
    },
  };
};

/**
 * Get projectTech safely — handles missing/null/undefined gracefully.
 */
function getProjectTech(manifest: Partial<Manifest>): string[] {
  if (Array.isArray(manifest.projectTech)) return manifest.projectTech;
  return [];
}

/**
 * Inject autoskill context into system prompt.
 */
async function injectAutoskillContext(output: { system: string[] }): Promise<void> {
  // Resolve project root — walk up from cwd looking for .opencode/
  let projectDir = process.cwd();
  let found = false;
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(projectDir, ".opencode"))) {
      found = true;
      break;
    }
    const parent = join(projectDir, "..");
    if (parent === projectDir) break;
    projectDir = parent;
  }

  if (!found) {
    return;
  }

  const manifestPath = join(projectDir, ".opencode", "autoskills.json");

  if (!existsSync(manifestPath)) {
    output.system.push([
      "",
      "<!-- autoskill: project skills manifest not found -->",
      `<note type="autoskill">`,
      `  This project has no tech skills manifest yet.`,
      `  Run \`@autoskill\` to scan the project and install matching skills.`,
      `  This only needs to be done once per project setup.`,
      `</note>`,
      "",
    ].join("\n"));
    return;
  }

  // Manifest exists — read it
  let manifest: Manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch {
    return; // invalid manifest, skip
  }

  const projectTech = getProjectTech(manifest);
  const installedSkills = manifest.installedSkills || {};

  // Check freshness
  const age = Date.now() - new Date(manifest.updatedAt).getTime();
  const isStale = age > MAX_MANIFEST_AGE_MS;

  if (Object.keys(installedSkills).length === 0) {
    output.system.push([
      "",
      "<!-- autoskill: project tech manifest (no skills installed) -->",
      "<autoskill>",
      `  <projectTech>${projectTech.join(", ") || "(none detected)"}</projectTech>`,
      `  <status>No matching skills found for this project's tech stack.</status>`,
      `  ${isStale ? '<note>Manifest is stale. Run `@autoskill` to refresh.</note>' : ''}`,
      "</autoskill>",
      "",
    ].join("\n"));
    return;
  }

  // Skills are installed — build available_skills XML block
  const skillsBlock: string[] = [
    "",
    "<!-- autoskill: project-local skills -->",
    '<available_skills project="local">',
  ];

  const skillsDir = join(projectDir, ".opencode", "skills");

  for (const [name, entry] of Object.entries(installedSkills)) {
    const skillPath = join(skillsDir, name, "SKILL.md");
    if (!existsSync(skillPath)) {
      continue;
    }

    let skillName = name;
    let description = `AI skill for ${name}`;
    try {
      const content = readFileSync(skillPath, "utf-8");
      const nameMatch = content.match(/^name:\s*(.+)$/m);
      const descMatch = content.match(/^description:\s*(.+)$/m);
      if (nameMatch) skillName = nameMatch[1].trim();
      if (descMatch) description = descMatch[1].trim();
    } catch { /* use defaults */ }

    skillsBlock.push([
      `  <skill>`,
      `    <name>${escapeXml(skillName)}</name>`,
      `    <description>${escapeXml(description)}</description>`,
      `    <source>${escapeXml(entry.source)}</source>`,
      `    <location>file://${escapeXml(skillPath)}</location>`,
      `    <installedAt>${entry.installedAt}</installedAt>`,
      `  </skill>`,
    ].join("\n"));
  }

  skillsBlock.push("</available_skills>");

  const staleNote = isStale
    ? `\n  <note>Manifest is stale (>24h). Run \`@autoskill\` to refresh skills.</note>`
    : "";

  skillsBlock.push(
    `<autoskill>`,
    `  <projectTech>${projectTech.join(", ") || "(none)"}</projectTech>`,
    `  <updatedAt>${manifest.updatedAt}</updatedAt>`,
    `${staleNote}`,
    `</autoskill>`,
    "",
  );

  output.system.push(skillsBlock.join("\n"));
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
