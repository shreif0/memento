import type { Plugin } from "@opencode-ai/plugin"
import { createTruncateHook } from "./hooks/truncate.js"

// See done.md for scope and safety invariants. Hooks are added incrementally,
// one per milestone, each gated by a critic pass against done.md.
export const Memento: Plugin = async ({ project, client, $, directory }) => {
  return {
    "tool.execute.after": createTruncateHook(),
  }
}
