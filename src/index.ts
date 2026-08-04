import type { Plugin } from "@opencode-ai/plugin"

// See done.md for scope and safety invariants. Hooks are added incrementally,
// one per milestone, each gated by a critic pass against done.md.
export const Memento: Plugin = async ({ project, client, $, directory }) => {
  return {}
}
