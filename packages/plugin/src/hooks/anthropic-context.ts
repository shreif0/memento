import type { Hooks } from "@opencode-ai/plugin"

const ANTHROPIC_NPM_PACKAGE = "@ai-sdk/anthropic"

export interface AnthropicContextOptions {
  clearToolUses?: boolean
  clearThinking?: boolean
  clearToolInputs?: boolean
}

/**
 * Verified against @ai-sdk/anthropic source
 * (packages/anthropic/src/anthropic-language-model.ts, vercel/ai):
 * `providerOptions.anthropic.contextManagement.edits` maps directly to
 * Anthropic's `context-management-2025-06-27` beta wire format
 * (`clear_tool_uses_20250919` / `clear_thinking_20251015`), and the SDK adds
 * the `anthropic-beta` header itself — no manual header injection needed.
 * This is a real, source-verified mapping, not a guess. What's *not*
 * verified: an actual live call through opencode → this AI SDK path (no
 * running opencode server + funded provider credentials in the environment
 * this was built in). See done.md.
 *
 * Only activates when the active model is actually served through
 * `@ai-sdk/anthropic` — checked via `model.api.npm`, the same field
 * opencode's own request-prep code uses to branch on provider identity — so
 * this structurally can never touch a non-Anthropic request.
 */
export function createAnthropicContextHook(
  opts: AnthropicContextOptions = {},
): NonNullable<Hooks["chat.params"]> {
  const clearToolUses = opts.clearToolUses ?? true
  const clearThinking = opts.clearThinking ?? true

  return async (input, output) => {
    if (input.model.api.npm !== ANTHROPIC_NPM_PACKAGE) return

    const edits: Record<string, unknown>[] = []
    if (clearToolUses) {
      edits.push({
        type: "clear_tool_uses_20250919",
        ...(opts.clearToolInputs !== undefined ? { clearToolInputs: opts.clearToolInputs } : {}),
      })
    }
    if (clearThinking) {
      edits.push({ type: "clear_thinking_20251015" })
    }
    if (edits.length === 0) return

    const anthropic = (output.options.anthropic ??= {}) as Record<string, unknown>
    anthropic.contextManagement = { edits }
  }
}
