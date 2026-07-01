import { intro, log, outro, spinner } from "@clack/prompts"
import { Effect } from "effect"

import { ConfigPaths } from "@/config/paths"
import { Global } from "@opencode-ai/core/global"
import { installPlugin, patchPluginConfig, readPluginManifest } from "../../plugin/install"
import { resolvePluginTarget } from "../../plugin/shared"
import { errorMessage } from "../../util/error"
import { Filesystem } from "@/util/filesystem"
import { Process } from "@/util/process"
import { UI } from "../ui"
import { effectCmd, fail } from "../effect-cmd"
import { cmd } from "./cmd"
import { PluginMeta } from "../../plugin/meta"
import { InstanceRef } from "@/effect/instance-ref"

type Spin = {
  start: (msg: string) => void
  stop: (msg: string, code?: number) => void
}

export type PlugDeps = {
  spinner: () => Spin
  log: {
    error: (msg: string) => void
    info: (msg: string) => void
    success: (msg: string) => void
  }
  resolve: (spec: string) => Promise<string>
  readText: (file: string) => Promise<string>
  write: (file: string, text: string) => Promise<void>
  exists: (file: string) => Promise<boolean>
  files: (dir: string, name: "opencode" | "tui") => string[]
  global: string
}

export type PlugInput = {
  mod: string
  global?: boolean
  force?: boolean
}

export type PlugCtx = {
  vcs?: string
  worktree: string
  directory: string
}

const defaultPlugDeps: PlugDeps = {
  spinner: () => spinner(),
  log: {
    error: (msg) => log.error(msg),
    info: (msg) => log.info(msg),
    success: (msg) => log.success(msg),
  },
  resolve: (spec) => resolvePluginTarget(spec),
  readText: (file) => Filesystem.readText(file),
  write: async (file, text) => {
    await Filesystem.write(file, text)
  },
  exists: (file) => Filesystem.exists(file),
  files: (dir, name) => ConfigPaths.fileInDirectory(dir, name),
  global: Global.Path.config,
}

function cause(err: unknown) {
  if (!err || typeof err !== "object") return
  if (!("cause" in err)) return
  return (err as { cause?: unknown }).cause
}

export function createPlugTask(input: PlugInput, dep: PlugDeps = defaultPlugDeps) {
  const mod = input.mod
  const force = Boolean(input.force)
  const global = Boolean(input.global)

  return async (ctx: PlugCtx) => {
    const install = dep.spinner()
    install.start("Installing plugin package...")
    const target = await installPlugin(mod, dep)
    if (!target.ok) {
      install.stop("Install failed", 1)
      dep.log.error(`Could not install "${mod}"`)
      const hit = cause(target.error) ?? target.error
      if (hit instanceof Process.RunFailedError) {
        const lines = hit.stderr
          .toString()
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
        const errs = lines.filter((line) => line.startsWith("error:")).map((line) => line.replace(/^error:\s*/, ""))
        const detail = errs[0] ?? lines.at(-1)
        if (detail) dep.log.error(detail)
        if (lines.some((line) => line.includes("No version matching"))) {
          dep.log.info("This package depends on a version that is not available in your npm registry.")
          dep.log.info("Check npm registry/auth settings and try again.")
        }
      }
      if (!(hit instanceof Process.RunFailedError)) {
        dep.log.error(errorMessage(hit))
      }
      return false
    }
    install.stop("Plugin package ready")

    const inspect = dep.spinner()
    inspect.start("Reading plugin manifest...")
    const manifest = await readPluginManifest(target.target)
    if (!manifest.ok) {
      if (manifest.code === "manifest_read_failed") {
        inspect.stop("Manifest read failed", 1)
        dep.log.error(`Installed "${mod}" but failed to read ${manifest.file}`)
        dep.log.error(errorMessage(cause(manifest.error) ?? manifest.error))
        return false
      }

      if (manifest.code === "manifest_no_targets") {
        inspect.stop("No plugin targets found", 1)
        dep.log.error(`"${mod}" does not expose plugin entrypoints in package.json`)
        dep.log.info(
          'Expected one of: exports["./tui"], exports["./server"], package.json main for server, or package.json["oc-themes"] for tui themes.',
        )
        return false
      }

      inspect.stop("Manifest read failed", 1)
      return false
    }

    inspect.stop(
      `Detected ${manifest.targets.map((item) => item.kind).join(" + ")} target${manifest.targets.length === 1 ? "" : "s"}`,
    )

    const patch = dep.spinner()
    patch.start("Updating plugin config...")
    const out = await patchPluginConfig(
      {
        spec: mod,
        targets: manifest.targets,
        force,
        global,
        vcs: ctx.vcs,
        worktree: ctx.worktree,
        directory: ctx.directory,
        config: dep.global,
      },
      dep,
    )
    if (!out.ok) {
      if (out.code === "invalid_json") {
        patch.stop(`Failed updating ${out.kind} config`, 1)
        dep.log.error(`Invalid JSON in ${out.file} (${out.parse} at line ${out.line}, column ${out.col})`)
        dep.log.info("Fix the config file and run the command again.")
        return false
      }

      patch.stop("Failed updating plugin config", 1)
      dep.log.error(errorMessage(out.error))
      return false
    }
    patch.stop("Plugin config updated")
    for (const item of out.items) {
      if (item.mode === "noop") {
        dep.log.info(`Already configured in ${item.file}`)
        continue
      }
      if (item.mode === "replace") {
        dep.log.info(`Replaced in ${item.file}`)
        continue
      }
      dep.log.info(`Added to ${item.file}`)
    }

    dep.log.success(`Installed ${mod}`)
    dep.log.info(global ? `Scope: global (${out.dir})` : `Scope: local (${out.dir})`)
    return true
  }
}

// --- Default install subcommand ($0) ---

export const PluginInstallCommand = effectCmd({
  command: "$0 <module>",
  describe: "install plugin and update config",
  builder: (yargs) =>
    yargs
      .positional("module", {
        type: "string",
        describe: "npm module name",
      })
      .option("global", {
        alias: ["g"],
        type: "boolean",
        default: false,
        describe: "install in global config",
      })
      .option("force", {
        alias: ["f"],
        type: "boolean",
        default: false,
        describe: "replace existing plugin version",
      }),
  handler: Effect.fn("Cli.plug")(function* (args) {
    const mod = String(args.module ?? "").trim()
    if (!mod) {
      UI.error("module is required")
      process.exitCode = 1
      return
    }

    UI.empty()
    intro(`Install plugin ${mod}`)

    const run = createPlugTask({
      mod,
      global: Boolean(args.global),
      force: Boolean(args.force),
    })

    const ctx = yield* InstanceRef
    if (!ctx) return
    const ok = yield* Effect.promise(() =>
      run({
        vcs: ctx.project.vcs,
        worktree: ctx.worktree,
        directory: ctx.directory,
      }),
    )

    outro("Done")
    if (!ok) process.exitCode = 1
  }),
})

// --- List subcommand ---

export const PluginListCommand = effectCmd({
  command: "list",
  aliases: ["ls"],
  describe: "list installed plugins",
  instance: false,
  handler: Effect.fn("Cli.plug.list")(function* () {
    UI.empty()
    intro("Installed Plugins")

    const entries = Object.values(yield* Effect.promise(() => PluginMeta.list()))

    if (entries.length === 0) {
      log.warn("No plugins installed")
      outro('Add plugins with: opencode plugin <module>')
      return
    }

    for (const entry of entries) {
      const label = entry.id || entry.spec
      const ver = entry.version ? ` v${entry.version}` : ""
      const req = entry.requested ? ` (requested: ${entry.requested})` : ""
      log.info(`${label}${ver}  ${entry.source}  (loaded ${entry.load_count} time${entry.load_count === 1 ? "" : "s"})`)
      log.info(`  ${UI.Style.TEXT_DIM}${entry.spec}${req}`)
    }

    outro(`${entries.length} plugin(s)`)
  }),
})

// --- Update subcommand ---

export const PluginUpdateCommand = effectCmd({
  command: "update [module]",
  aliases: ["up"],
  describe: "update installed plugins to latest matching their origin spec",
  instance: false,
  builder: (yargs) =>
    yargs.positional("module", {
      type: "string",
      describe: "plugin id to update (omit to update all)",
    }),
  handler: Effect.fn("Cli.plug.update")(function* (args) {
    const module = args.module?.trim()

    UI.empty()
    intro("Update Plugins")

    const all = yield* Effect.promise(() => PluginMeta.list())
    const entries = Object.values(all)

    if (module) {
      const match = entries.find((e) => e.id === module || e.spec === module)
      if (!match) {
        yield* fail(`Plugin "${module}" is not installed. Installed plugins: ${entries.map((e) => e.id).join(", ") || "none"}.`)
        return
      }
      const result = yield* Effect.promise(() => updateOne(match))
      if (result) {
        log.success(`Updated ${module}: ${result.old ?? "(unknown)"} -> ${result.new ?? "(unknown)"}`)
      }
    } else {
      if (entries.length === 0) {
        log.warn("No plugins installed")
        outro("Nothing to update")
        return
      }

      let count = 0
      for (const entry of entries) {
        log.info(`Updating ${entry.id || entry.spec}...`)
        const result = yield* Effect.promise(() => updateOne(entry))
        if (result) {
          log.info(`  ${result.old ?? "(unknown)"} -> ${result.new ?? "(unknown)"}`)
          count++
        }
      }
      if (count === 0) {
        log.info("All plugins already up to date")
      } else {
        log.success(`Updated ${count} plugin(s)`)
      }
    }

    outro("Done")
  }),
})

async function updateOne(entry: PluginMeta.Entry) {
  const oldVersion = entry.version
  try {
    const target = await resolvePluginTarget(entry.spec)
    const touched = await PluginMeta.touch(entry.spec, target, entry.id)
    return { old: oldVersion, new: touched.entry.version }
  } catch (err) {
    log.error(`Failed to update ${entry.id || entry.spec}: ${errorMessage(err)}`)
    return null
  }
}

// --- Parent command ---

export const PluginCommand = cmd({
  command: "plugin",
  aliases: ["plug"],
  describe: "manage plugins (install/list/update)",
  builder: (yargs) =>
    yargs
      .command(PluginInstallCommand)
      .command(PluginListCommand)
      .command(PluginUpdateCommand)
      .demandCommand(1, "Specify a subcommand or plugin module"),
  async handler() {},
})
