import type { Hooks } from "@opencode-ai/plugin"

export const DEFAULT_MAX_CHARS = 4000
const MAX_TOOL_NAME_IN_PLACEHOLDER = 60

function placeholder(tool: string, originalLength: number, maxChars: number): string {
  const safeTool = tool.length > MAX_TOOL_NAME_IN_PLACEHOLDER
    ? tool.slice(0, MAX_TOOL_NAME_IN_PLACEHOLDER) + "…"
    : tool
  return `\n\n[memento: truncated ${safeTool} output — ${originalLength} chars, kept first ${maxChars}. Re-run ${safeTool} to see the rest.]`
}

/**
 * Mechanical tier: deterministic, no LLM call. Truncates tool output that
 * exceeds maxChars at creation time, before it's added to session history.
 * Never fires at or below the threshold (done.md safety invariant). This
 * hook only ever sees already-resolved tool calls — "open turn" is not a
 * concept it can observe or violate; that invariant belongs to tier B.
 */
export function createTruncateHook(
  maxChars: number = DEFAULT_MAX_CHARS,
): NonNullable<Hooks["tool.execute.after"]> {
  return async (input, output) => {
    const original = output.output
    if (original.length <= maxChars) return
    output.output = original.slice(0, maxChars) + placeholder(input.tool, original.length, maxChars)
  }
}
