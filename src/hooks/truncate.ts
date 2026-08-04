import type { Hooks } from "@opencode-ai/plugin"

export const DEFAULT_MAX_CHARS = 4000

function placeholder(tool: string, originalLength: number, maxChars: number): string {
  return `\n\n[memento: truncated ${tool} output — ${originalLength} chars, kept first ${maxChars}. Re-run ${tool} to see the rest.]`
}

/**
 * Mechanical tier: deterministic, no LLM call. Truncates tool output that
 * exceeds maxChars at creation time, before it's added to session history.
 * Never fires at or below the threshold (done.md safety invariant).
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
