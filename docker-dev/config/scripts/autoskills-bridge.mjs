#!/usr/bin/env node
/**
 * autoskills-bridge — autoskills ↔ OpenCode integration
 *
 * Usage:
 *   node autoskills-bridge.mjs [--check|--install|--force]
 *
 * Modes:
 *   --check    Quick check: exit 0 if manifest is fresh, 1 if needs update
 *   --install  Run autoskills + copy skills to .opencode/skills/ + generate manifest (default)
 *   --force    Force re-install even if manifest exists
 *
 * Project-local effects only (never touches ~/.agents/skills/ or global config):
 *   - .opencode/autoskills.json    → tech manifest + installed skills
 *   - .opencode/skills/<name>/     → installed skill SKILL.md + files
 */

import { execSync } from "node:child_process";
import {
  existsSync, mkdirSync, readdirSync, readFileSync,
  writeFileSync, copyFileSync, rmSync, statSync,
} from "node:fs";
import { join, dirname, basename, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

// ── Config ───────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECT_DIR = resolve(".");
const MAX_MANIFEST_AGE_MS = 24 * 60 * 60 * 1000; // 24h before re-check

const MANIFEST_VERSION = 1;

// ── Paths ────────────────────────────────────────────────────

function getProjectDir() {
  return process.env.AUTOSKILLS_PROJECT_DIR || DEFAULT_PROJECT_DIR;
}

function getPaths(projectDir) {
  return {
    opencodeDir: join(projectDir, ".opencode"),
    skillsDir: join(projectDir, ".opencode", "skills"),
    manifestPath: join(projectDir, ".opencode", "autoskills.json"),
    autoskillsInstallDir: join(projectDir, ".agents", "skills"),
    autoskillsLockPath: join(projectDir, "skills-lock.json"),
  };
}

// ── Helpers ──────────────────────────────────────────────────

function copyRecursive(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(s, d);
    } else if (entry.isFile()) {
      copyFileSync(s, d);
    }
  }
}

function rmIfExists(dir) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

function collectFiles(dir, baseDir) {
  const files = [];
  if (!existsSync(dir)) return files;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(abs, baseDir));
    } else if (entry.isFile()) {
      files.push({
        rel: relative(baseDir, abs),
        abs,
      });
    }
  }
  return files;
}

function computeBundleHash(dir) {
  if (!existsSync(dir)) return "";
  const files = collectFiles(dir, dir).sort((a, b) => a.rel.localeCompare(b.rel));
  const hash = createHash("sha256");
  for (const { rel, abs } of files) {
    const content = readFileSync(abs);
    hash.update(`${rel}:${createHash("sha256").update(content).digest("hex")}\n`);
  }
  return hash.digest("hex");
}

// ── Tech Detection ───────────────────────────────────────────

const TECH_PACKAGE_MAP = {
  "next": ["nextjs"],
  "react": ["react"],
  "vue": ["vue"],
  "svelte": ["svelte"],
  "astro": ["astro"],
  "@angular/core": ["angular"],
  "nuxt": ["nuxt"],
  "tailwindcss": ["tailwind"],
  "typescript": ["typescript"],
  "prisma": ["prisma"],
  "@prisma/client": ["prisma"],
  "drizzle-orm": ["drizzle"],
  "drizzle-kit": ["drizzle"],
  "@supabase/supabase-js": ["supabase"],
  "@supabase/ssr": ["supabase"],
  "@clerk/nextjs": ["clerk"],
  "@clerk/react": ["clerk"],
  "better-auth": ["better-auth"],
  "stripe": ["stripe"],
  "turbo": ["turborepo"],
  "vite": ["vite"],
  "vitest": ["vitest"],
  "@playwright/test": ["playwright"],
  "playwright": ["playwright"],
  "expo": ["expo"],
  "react-native": ["react-native"],
  "electron": ["electron"],
  "@tauri-apps/api": ["tauri"],
  "gsap": ["gsap"],
  "three": ["threejs"],
  "react-hook-form": ["react-hook-form"],
  "zod": ["zod"],
  "hono": ["hono"],
  "express": ["express"],
  "@nestjs/core": ["nestjs"],
  "ai": ["vercel-ai"],
  "@ai-sdk/openai": ["vercel-ai"],
  "@ai-sdk/anthropic": ["vercel-ai"],
  "elevenlabs": ["elevenlabs"],
  "remotion": ["remotion"],
  "wrangler": ["cloudflare"],
  "oxlint": ["oxlint"],
};

const TECH_CONFIG_MAP = {
  "tsconfig.json": ["typescript"],
  "next.config.js": ["nextjs"],
  "next.config.mjs": ["nextjs"],
  "next.config.ts": ["nextjs"],
  "tailwind.config.js": ["tailwind"],
  "tailwind.config.ts": ["tailwind"],
  "astro.config.mjs": ["astro"],
  "astro.config.js": ["astro"],
  "astro.config.ts": ["astro"],
  "svelte.config.js": ["svelte"],
  "nuxt.config.js": ["nuxt"],
  "nuxt.config.ts": ["nuxt"],
  "vite.config.js": ["vite"],
  "vite.config.ts": ["vite"],
  "turbo.json": ["turborepo"],
  "vercel.json": ["vercel-deploy"],
  "wrangler.toml": ["cloudflare"],
  "go.mod": ["go"],
  "Cargo.toml": ["rust"],
  "Gemfile": ["ruby"],
  "pyproject.toml": ["python"],
  "requirements.txt": ["python"],
  "composer.json": ["php"],
  "pubspec.yaml": ["dart"],
  "deno.json": ["deno"],
  "deno.jsonc": ["deno"],
  "terraform.tfvars": ["terraform"],
  "main.tf": ["terraform"],
};

function detectProjectTech(projectDir) {
  const tech = new Set();

  // Scan package.json dependencies
  const pkgPath = join(projectDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      for (const [dep, techNames] of Object.entries(TECH_PACKAGE_MAP)) {
        if (deps[dep]) {
          for (const name of techNames) tech.add(name);
        }
      }
    } catch { /* skip invalid package.json */ }
  }

  // Scan config files
  for (const [cfgFile, techNames] of Object.entries(TECH_CONFIG_MAP)) {
    if (existsSync(join(projectDir, cfgFile))) {
      for (const name of techNames) tech.add(name);
    }
  }

  // Detect pnpm
  if (existsSync(join(projectDir, "pnpm-workspace.yaml"))) {
    tech.add("pnpm");
  }

  // Detect .NET
  if (existsSync(join(projectDir, "global.json")) ||
      existsSync(join(projectDir, "NuGet.Config"))) {
    tech.add("dotnet");
  }

  return [...tech].sort();
}

// ── Main Logic ───────────────────────────────────────────────

function cmdCheck(projectDir) {
  const { manifestPath, skillsDir } = getPaths(projectDir);

  if (!existsSync(manifestPath)) {
    console.log("[autoskills] No manifest found — skills need update");
    return false;
  }

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    const age = Date.now() - new Date(manifest.updatedAt).getTime();
    if (age > MAX_MANIFEST_AGE_MS) {
      console.log("[autoskills] Manifest stale (>24h) — skills need update");
      return false;
    }

    // Verify installed skills still exist and match hashes
    for (const [name, entry] of Object.entries(manifest.installedSkills || {})) {
      const skillPath = join(skillsDir, name);
      if (!existsSync(skillPath)) {
        console.log(`[autoskills] Missing skill dir: ${name}`);
        return false;
      }
      const currentHash = computeBundleHash(skillPath);
      if (currentHash !== entry.bundleHash) {
        console.log(`[autoskills] Hash mismatch: ${name}`);
        return false;
      }
    }

    console.log("[autoskills] Manifest is fresh, skills verified");
    return true;
  } catch {
    return false;
  }
}

async function cmdInstall(projectDir, force) {
  const { opencodeDir, skillsDir, manifestPath, autoskillsInstallDir, autoskillsLockPath } = getPaths(projectDir);

  // Step 1: Quick check skip
  if (!force && cmdCheck(projectDir)) {
    console.log("[autoskills] Skills are up to date. Use --force to reinstall.");
    return;
  }

  // Step 2: Kill any stale installs
  rmIfExists(autoskillsInstallDir);
  rmIfExists(autoskillsLockPath);

  // Step 3: Run autoskills
  console.log("[autoskills] Running npx autoskills -y ...");
  try {
    execSync("npx autoskills -y", {
      cwd: projectDir,
      stdio: "pipe",
      timeout: 120_000,
      env: { ...process.env },
    });
    console.log("[autoskills] autoskills completed");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[autoskills] autoskills: ${msg.includes("Command failed") ? "detection ran (no skills or errors)" : msg}`);
  }

  // Step 4: Detect project technologies
  const projectTech = detectProjectTech(projectDir);
  console.log(`[autoskills] Detected tech: ${projectTech.join(", ") || "(none)"}`);

  // Step 5: Copy installed skills from .agents/skills/ → .opencode/skills/
  mkdirSync(skillsDir, { recursive: true });
  const installedSkills = {};

  if (existsSync(autoskillsInstallDir)) {
    const skillNames = readdirSync(autoskillsInstallDir).filter((name) =>
      statSync(join(autoskillsInstallDir, name)).isDirectory(),
    );

    for (const name of skillNames) {
      const srcDir = join(autoskillsInstallDir, name);
      const dstDir = join(skillsDir, name);

      // Read source info from skills-lock.json if available
      let source = "autoskills-registry";
      if (existsSync(autoskillsLockPath)) {
        try {
          const lock = JSON.parse(readFileSync(autoskillsLockPath, "utf-8"));
          if (lock.skills?.[name]?.source) {
            source = lock.skills[name].source;
          }
        } catch { /* ignore */ }
      }

      // Remove existing skill
      rmIfExists(dstDir);

      // Copy skill files
      copyRecursive(srcDir, dstDir);
      const bundleHash = computeBundleHash(dstDir);

      installedSkills[name] = {
        source,
        bundleHash,
        installedAt: new Date().toISOString(),
      };
      console.log(`[autoskills]   ✔ ${name} installed`);
    }

    // Clean up autoskills temp files
    rmIfExists(autoskillsInstallDir);
    rmIfExists(autoskillsLockPath);
  } else {
    console.log("[autoskills] No skills were installed by autoskills.");
  }

  // Step 6: Write manifest
  const manifest = {
    version: MANIFEST_VERSION,
    updatedAt: new Date().toISOString(),
    projectTech,
    installedSkills,
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  const skillCount = Object.keys(installedSkills).length;
  if (skillCount > 0) {
    console.log(`\n[autoskills] ✅ ${skillCount} skill(s) installed to .opencode/skills/`);
    console.log(`[autoskills] 📋 Manifest: .opencode/autoskills.json`);
  } else {
    console.log(`\n[autoskills] 📋 Tech manifest written to .opencode/autoskills.json`);
    if (projectTech.length > 0) {
      console.log(`[autoskills] 💡 No matching skills found for: ${projectTech.join(", ")}`);
    }
  }
}

// ── CLI ──────────────────────────────────────────────────────

function showHelp() {
  console.log(`
autoskills-bridge — autoskills ↔ OpenCode integration

USAGE:
  node autoskills-bridge.mjs [options]

OPTIONS:
  --check     Quick check: exit 0 if manifest is fresh, 1 if needs update
  --install   Run autoskills + install skills to .opencode/skills/ (default)
  --force     Force re-install even if manifest exists
  --help      Show this help

ENV:
  AUTOSKILLS_PROJECT_DIR   Override project directory (default: cwd)

This script only modifies project-local files:
  .opencode/autoskills.json
  .opencode/skills/<name>/
`);
}

async function main() {
  const args = process.argv.slice(2);
  const projectDir = getProjectDir();

  if (args.includes("--help") || args.includes("-h")) {
    showHelp();
    process.exit(0);
  }

  if (args.includes("--check")) {
    process.exit(cmdCheck(projectDir) ? 0 : 1);
  }

  const force = args.includes("--force");
  await cmdInstall(projectDir, force);
}

main().catch((err) => {
  console.error(`[autoskills] ❌ Fatal: ${err.message}`);
  process.exit(1);
});
