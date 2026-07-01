import type { Plugin } from "@opencode-ai/plugin"
import { extname } from "path"

const VALIDATABLE_EXTS = new Set([".ts", ".tsx", ".js", ".py", ".rs", ".go"])

/**
 * Await a Bun $ shell command, capture result without throwing.
 * `promise` must be a chained $ shell call (with .quiet().nothrow() etc).
 */
async function tryRun(promise: Promise<unknown>): Promise<{
  ok: boolean
  stdout: string
  stderr: string
  exitCode: number
}> {
  try {
    const r = (await promise) as {
      exitCode: number
      stdout: string | Buffer
      stderr: string | Buffer
    }
    const ec = typeof r.exitCode === "number" ? r.exitCode : 1
    const decode = (v: string | Buffer): string =>
      typeof v === "string" ? v : new TextDecoder().decode(v)
    return {
      ok: ec === 0,
      exitCode: ec,
      stdout: decode(r.stdout),
      stderr: decode(r.stderr),
    }
  } catch {
    return { ok: false, exitCode: -1, stdout: "", stderr: "" }
  }
}

/** Truncate + prefix an error message for metadata. */
function err(label: string, r: { stderr: string; stdout: string }): string {
  const msg = (r.stderr || r.stdout || "").trim().slice(0, 2000)
  return msg ? `${label}: ${msg}` : ""
}

/**
 * Validation Plugin — auto-runs code validation on write/edit tool executions.
 *
 * Hook: tool.execute.after
 * Pipeline per extension:
 *   .ts/.tsx → tsc --noEmit (typecheck) + oxlint (linter)
 *   .js      → node --check (syntax) + oxlint (linter)
 *   .py      → python3 -m py_compile (syntax) + ruff check (linter, fallback flake8)
 *   .rs      → cargo clippy (linter)
 *   .go      → go vet (linter)
 *
 * Non-blocking: never throws, never blocks execution.
 * Tools not found → SKIP (graceful degradation).
 */
export const ValidationPlugin: Plugin = async ({ $, directory }) => {
  console.log("[validation] Plugin loaded — monitoring write/edit for validatable files")

  return {
    "tool.execute.after": async (input, output) => {
      // ── Only validate write/edit tools ──────────────────────────
      const tool = String(input?.tool ?? "").toLowerCase()
      if (tool !== "write" && tool !== "edit") return

      // ── Extract file path from tool args ────────────────────────
      const args = input?.args
      if (!args || typeof args !== "object") return

      const filePath = (args as Record<string, unknown>).filePath ??
                       (args as Record<string, unknown>).path
      if (typeof filePath !== "string" || !filePath) return

      // ── Check if validatable extension ──────────────────────────
      const ext = extname(filePath).toLowerCase()
      if (!VALIDATABLE_EXTS.has(ext)) return

      const results: Record<string, "PASS" | "FAIL" | "SKIP"> = {}
      const errors: string[] = []

      // ═══════════════════════════════════════════════════════════
      // TypeScript / TSX
      // ═══════════════════════════════════════════════════════════
      if (ext === ".ts" || ext === ".tsx") {
        // ── Typecheck: tsc --noEmit ────────────────────────────
        {
          const r = await tryRun(
            $`npx -p typescript -y tsc --noEmit --pretty false`
              .quiet().nothrow().cwd(directory).timeout(30_000),
          )
          results.typecheck = r.ok ? "PASS" : "FAIL"
          if (!r.ok) {
            const e = err("tsc", r)
            if (e) errors.push(e)
          }
        }

        // ── Linter: oxlint (fast Rust-based) ───────────────────
        {
          const r = await tryRun(
            $`npx -y oxlint@latest --deny-warnings ${filePath}`
              .quiet().nothrow().timeout(30_000),
          )
          if (r.exitCode === -1) {
            results.lint = "SKIP"  // command not found
          } else {
            results.lint = r.ok ? "PASS" : "FAIL"
            if (!r.ok) {
              const e = err("oxlint", r)
              if (e) errors.push(e)
            }
          }
        }
      }

      // ═══════════════════════════════════════════════════════════
      // JavaScript
      // ═══════════════════════════════════════════════════════════
      if (ext === ".js") {
        // ── Syntax: node --check ───────────────────────────────
        {
          const r = await tryRun(
            $`node --check ${filePath}`.quiet().nothrow().timeout(10_000),
          )
          results.syntax = r.ok ? "PASS" : "FAIL"
          if (!r.ok) {
            const e = err("syntax", r)
            if (e) errors.push(e)
          }
        }

        // ── Linter: oxlint ─────────────────────────────────────
        {
          const r = await tryRun(
            $`npx -y oxlint@latest ${filePath}`.quiet().nothrow().timeout(30_000),
          )
          if (r.exitCode === -1) {
            results.lint = "SKIP"
          } else {
            results.lint = r.ok ? "PASS" : "FAIL"
            if (!r.ok) {
              const e = err("oxlint", r)
              if (e) errors.push(e)
            }
          }
        }
      }

      // ═══════════════════════════════════════════════════════════
      // Python
      // ═══════════════════════════════════════════════════════════
      if (ext === ".py") {
        // ── Syntax: python3 -m py_compile ──────────────────────
        {
          const r = await tryRun(
            $`python3 -m py_compile ${filePath}`.quiet().nothrow().timeout(10_000),
          )
          results.syntax = r.ok ? "PASS" : "FAIL"
          if (!r.ok) {
            const e = err("syntax", r)
            if (e) errors.push(e)
          }
        }

        // ── Linter: ruff (fast Rust-based, replaces flake8) ────
        {
          const r = await tryRun(
            $`ruff check --quiet ${filePath}`.quiet().nothrow().timeout(15_000),
          )
          if (r.exitCode === -1) {
            results.lint = "SKIP"
          } else {
            results.lint = r.ok ? "PASS" : "FAIL"
            if (!r.ok) {
              const e = err("ruff", r)
              if (e) errors.push(e)
            }
          }
        }

        // ── Fallback: flake8 (if ruff not available) ───────────
        if (results.lint === "SKIP") {
          const r = await tryRun(
            $`flake8 ${filePath}`.quiet().nothrow().timeout(15_000),
          )
          if (r.exitCode !== -1) {
            results.lint = r.ok ? "PASS" : "FAIL"
            if (!r.ok) {
              const e = err("flake8", r)
              if (e) errors.push(e)
            }
          }
        }
      }

      // ═══════════════════════════════════════════════════════════
      // Rust
      // ═══════════════════════════════════════════════════════════
      if (ext === ".rs") {
        // ── Linter: cargo clippy ───────────────────────────────
        {
          const r = await tryRun(
            $`cargo clippy --quiet -- -D warnings`
              .quiet().nothrow().cwd(directory).timeout(60_000),
          )
          if (r.exitCode === -1) {
            results.lint = "SKIP"
          } else {
            results.lint = r.ok ? "PASS" : "FAIL"
            if (!r.ok) {
              const e = err("clippy", r)
              if (e) errors.push(e)
            }
          }
        }
      }

      // ═══════════════════════════════════════════════════════════
      // Go
      // ═══════════════════════════════════════════════════════════
      if (ext === ".go") {
        // ── Linter: go vet ─────────────────────────────────────
        {
          const r = await tryRun(
            $`go vet ./...`.quiet().nothrow().cwd(directory).timeout(60_000),
          )
          if (r.exitCode === -1) {
            results.lint = "SKIP"
          } else {
            results.lint = r.ok ? "PASS" : "FAIL"
            if (!r.ok) {
              const e = err("govet", r)
              if (e) errors.push(e)
            }
          }
        }
      }

      // ── Attach validation metadata to tool result ───────────────
      output.metadata = output.metadata || {}
      output.metadata.validation = {
        file: filePath,
        ext,
        results,
        ...(errors.length > 0 ? { errors } : {}),
      }

      // ── Update title on failure ─────────────────────────────────
      const failed = Object.values(results).some((v) => v === "FAIL")
      if (failed) {
        output.title = `\u26A0\uFE0F ${tool} ${filePath} [validation: FAIL]`
      }
    },
  }
}
