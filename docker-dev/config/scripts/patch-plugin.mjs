#!/usr/bin/env node
/**
 * Apply source-built dist to oh-my-opencode-slim plugin.
 *
 * The source-built dist (from /tmp/oh-my-opencode-slim/) includes:
 *   1. Dynamic health check thresholds (computeHealthStatus)
 *   2. LRU cache for buildOrchestratorPrompt (promptCache)
 *
 * Patches ALL cached copies found on the system.
 * Safe to run multiple times — already-patched files are skipped.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import { homedir } from 'os';

const HOME = homedir();
const REF_DIST = `${HOME}/.config/opencode/scripts/opencode-slim-patched-dist.mjs`;

// ── Find all candidate dist files ───────────────────────────────────

const candidates = [];

// bun cache (primary — where opencode loads from)
try {
  const cacheDir = `${HOME}/.bun/install/cache`;
  for (const entry of readdirSync(cacheDir)) {
    if (entry.startsWith('oh-my-opencode-slim')) {
      const dist = `${cacheDir}/${entry}/dist/index.js`;
      if (existsSync(dist)) candidates.push(dist);
    }
  }
} catch {}

// bunx temp caches
try {
  for (const entry of readdirSync('/tmp')) {
    if (entry.startsWith('bunx-') && entry.includes('oh-my-opencode-slim@')) {
      const dist = `/tmp/${entry}/node_modules/oh-my-opencode-slim/dist/index.js`;
      if (existsSync(dist)) candidates.push(dist);
    }
  }
} catch {}

// CWD node_modules
const cwdDist = './node_modules/oh-my-opencode-slim/dist/index.js';
if (existsSync(cwdDist)) candidates.push(cwdDist);

// Deduplicate
const seen = new Set();
const targets = candidates.filter((p) => {
  if (seen.has(p)) return false;
  seen.add(p);
  return true;
});

if (targets.length === 0) {
  console.log('No oh-my-opencode-slim dist files found to patch.');
  console.log('(The plugin will be patched when first loaded by opencode)');
  process.exit(0);
}

if (!existsSync(REF_DIST)) {
  console.log(`Reference dist not found at ${REF_DIST}.`);
  console.log('Rebuild the source at /tmp/oh-my-opencode-slim/ and copy dist/index.js there.');
  process.exit(1);
}

// ── Patch each copy ─────────────────────────────────────────────────

let patched = 0;
let skipped = 0;

for (const filePath of targets) {
  try {
    if (patchFile(filePath)) patched++;
    else skipped++;
  } catch (e) {
    console.error(`  ✗ Error: ${shortPath(filePath)}: ${e.message}`);
  }
}

console.log(`\nDone: ${patched} patched, ${skipped} already up-to-date.`);

// ── Patch logic ─────────────────────────────────────────────────────

function patchFile(filePath) {
  const code = readFileSync(filePath, 'utf8');

  // Already has the LRU prompt cache? → latest source-built dist
  if (code.includes('promptCache')) {
    console.log(`  ✓ Already patched: ${shortPath(filePath)}`);
    return false;
  }

  // Backup original
  const bak = `${filePath}.bak.${Date.now()}`;
  writeFileSync(bak, code, 'utf8');

  // Replace with reference dist
  const ref = readFileSync(REF_DIST, 'utf8');
  writeFileSync(filePath, ref, 'utf8');

  // Verify syntax
  execSync(`node --check "${filePath}"`, { stdio: 'pipe' });
  console.log(`  ✓ Patched: ${shortPath(filePath)}`);
  return true;
}

function shortPath(p) {
  return p.replace(HOME, '~');
}
