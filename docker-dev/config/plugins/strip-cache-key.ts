import type { Plugin } from "@opencode-ai/plugin"

/**
 * Strip Cache Key Plugin
 *
 * Removes the `promptCacheKey` field from outgoing API requests to prevent
 * "Extra inputs are not permitted" errors with strict model providers
 * (e.g., Kimi, Moonshot, Fireworks).
 *
 * Hook: chat.params
 *   Executed right before the request is sent to the model provider.
 *   We delete promptCacheKey from the params — it's an internal opencode
 *   field that some providers reject.
 *
 * Trade-off: loses session-level prompt caching for a ~100-300ms per-turn
 * optimization. Invisible in practice. Gain: zero model compatibility issues.
 */
export default async function stripCacheKeyPlugin(): Promise<Plugin> {
  return {
    "chat.params": async (_input, output) => {
      const opts = output.options as Record<string, unknown> | undefined
      if (opts?.promptCacheKey) {
        delete opts.promptCacheKey
      }
    },
  }
}
