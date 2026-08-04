import type { OpencodeClient, Part } from "@opencode-ai/sdk"
import type { Judge, JudgeResult, MessageEntry } from "./collapse.ts"

const JUDGE_PROMPT = `You are reviewing a segment of an AI coding agent's conversation history to decide whether it represents a fully achieved sub-goal that is now safe to compress into a one-line memory note.

Respond with exactly one line:
- "NO_COLLAPSE" if the segment is not a clearly completed, self-contained unit of work, or you are not confident.
- "COLLAPSE: <one sentence stating what was achieved and any fact that must be remembered, e.g. a file path, a decision, or a capability learned>" if it is.

When in doubt, respond NO_COLLAPSE. A missed collapse costs a few tokens; a wrong collapse loses information permanently.

Segment:
`

function summarizeSpanForJudge(span: MessageEntry[]): string {
  const lines: string[] = []
  for (const entry of span) {
    for (const part of entry.parts) {
      if (part.type === "text") {
        lines.push(`[${entry.info.role}] ${part.text}`)
      } else if (part.type === "tool" && part.state.status === "completed") {
        lines.push(`[tool:${part.tool}] ${part.state.title}: ${part.state.output.slice(0, 500)}`)
      } else if (part.type === "tool" && part.state.status === "error") {
        lines.push(`[tool:${part.tool} error] ${part.state.error}`)
      }
    }
  }
  return lines.join("\n")
}

function extractText(parts: Part[]): string {
  return parts
    .filter((p): p is Extract<Part, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim()
}

/**
 * NOT independently verified against a live opencode server + real provider
 * (no running instance in the environment this was built in — see done.md).
 * Uses the caller's already-configured provider/credentials via an ephemeral,
 * throwaway session — no separate API key required. Reviewed, not
 * live-tested; treat as best-effort until confirmed.
 */
export function createOpencodeSessionJudge(client: OpencodeClient): Judge {
  return async (span: MessageEntry[]): Promise<JudgeResult> => {
    const transcript = summarizeSpanForJudge(span)
    const created = await client.session.create({ body: { title: "memento-judge" } })
    const sessionId = created.data?.id
    if (!sessionId) return { collapse: false }

    try {
      const result = await client.session.prompt({
        path: { id: sessionId },
        body: { parts: [{ type: "text", text: JUDGE_PROMPT + transcript }] },
      })
      if (!result.data) return { collapse: false }
      const text = extractText(result.data.parts)
      if (text.startsWith("COLLAPSE:")) {
        const note = text.slice("COLLAPSE:".length).trim()
        if (note.length === 0) return { collapse: false }
        return { collapse: true, note }
      }
      return { collapse: false }
    } finally {
      await client.session.delete({ path: { id: sessionId } }).catch(() => {})
    }
  }
}
