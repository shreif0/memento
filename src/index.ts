import type { Plugin } from "@opencode-ai/plugin"
import { createTruncateHook, DEFAULT_MAX_CHARS } from "./hooks/truncate.ts"

// See done.md for scope and safety invariants. Hooks are added incrementally,
// one per milestone, each gated by a critic pass against done.md.
//
// User-facing config, via opencode.json:
//   { "plugin": [["memento", { "maxChars": 4000 }]] }
export const Memento: Plugin = async ({ project, client, $, directory }, options) => {
  const maxChars = readMaxChars(options)
  return {
    "tool.execute.after": createTruncateHook(maxChars),
  }
}

function readMaxChars(options: Record<string, unknown> | undefined): number {
  const value = options?.maxChars
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_CHARS
}
