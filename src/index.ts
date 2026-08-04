import type { Plugin } from "@opencode-ai/plugin"
import { createTruncateHook, DEFAULT_MAX_CHARS } from "./hooks/truncate.ts"
import { createCollapseHook } from "./hooks/collapse.ts"
import { createOpencodeSessionJudge } from "./hooks/judge.ts"

// See done.md for scope and safety invariants. Hooks are added incrementally,
// one per milestone, each gated by a critic pass against done.md.
//
// User-facing config, via opencode.json:
//   { "plugin": [["memento", { "maxChars": 4000, "collapse": true }]] }
//
// "collapse" (goal-collapse / tier B) is opt-in and defaults to off — it's
// the higher-risk, not-yet-live-verified tier (see done.md). "maxChars"
// (truncation / tier A) is always on.
export const Memento: Plugin = async ({ client }, options) => {
  const maxChars = readMaxChars(options)
  const hooks: Awaited<ReturnType<Plugin>> = {
    "tool.execute.after": createTruncateHook(maxChars),
  }
  if (readCollapseEnabled(options)) {
    hooks["experimental.chat.messages.transform"] = createCollapseHook(
      createOpencodeSessionJudge(client),
    )
  }
  return hooks
}

function readMaxChars(options: Record<string, unknown> | undefined): number {
  const value = options?.maxChars
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_CHARS
}

function readCollapseEnabled(options: Record<string, unknown> | undefined): boolean {
  return options?.collapse === true
}
