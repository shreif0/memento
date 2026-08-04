import type { Plugin } from "@opencode-ai/plugin"
import { createTruncateHook, DEFAULT_MAX_CHARS } from "./hooks/truncate.ts"
import { createCollapseHook } from "./hooks/collapse.ts"
import { createOpencodeSessionJudge } from "./hooks/judge.ts"
import { createAnthropicContextHook } from "./hooks/anthropic-context.ts"

// See done.md for scope and safety invariants. Hooks are added incrementally,
// one per milestone, each gated by a critic pass against done.md.
//
// User-facing config, via opencode.json:
//   { "plugin": [["memento", {
//       "maxChars": 4000,
//       "collapse": true,
//       "contextManagement": true
//   }]] }
//
// - maxChars (truncation / tier A): always on.
// - collapse (goal-collapse / tier B): opt-in, defaults OFF — the highest-risk
//   tier, no live end-to-end verification yet (see done.md).
// - contextManagement (Anthropic context-clearing passthrough): defaults ON.
//   Source-verified against @ai-sdk/anthropic and structurally scoped to
//   Anthropic-served requests only (see hooks/anthropic-context.ts) — lower
//   risk than collapse even without a live end-to-end test, since an
//   unrecognized option is inert rather than corrupting.
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
  if (readContextManagementEnabled(options)) {
    hooks["chat.params"] = createAnthropicContextHook()
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

function readContextManagementEnabled(options: Record<string, unknown> | undefined): boolean {
  return options?.contextManagement !== false
}
