import type { Part } from "@opencode-ai/sdk"
import type { MessageEntry, Judge } from "../src/hooks/collapse.ts"
import { createTruncateHook } from "../src/hooks/truncate.ts"
import { planCollapse } from "../src/hooks/collapse.ts"
import { buildSyntheticSession } from "./transcript.ts"

function sizeOf(entries: MessageEntry[]): number {
  let total = 0
  for (const entry of entries) {
    for (const part of entry.parts) {
      if (part.type === "text" || part.type === "reasoning") total += part.text.length
      else if (part.type === "tool") {
        const s = part.state
        if (s.status === "completed") total += s.output.length
        else if (s.status === "error") total += s.error.length
      }
    }
  }
  return total
}

async function applyTruncation(entries: MessageEntry[], maxChars: number): Promise<MessageEntry[]> {
  const hook = createTruncateHook(maxChars)
  const out: MessageEntry[] = []
  for (const entry of entries) {
    const parts: Part[] = []
    for (const part of entry.parts) {
      if (part.type !== "tool" || part.state.status !== "completed") {
        parts.push(part)
        continue
      }
      const output = { title: part.state.title, output: part.state.output, metadata: part.state.metadata }
      await hook({ tool: part.tool, sessionID: part.sessionID, callID: part.callID, args: {} }, output)
      parts.push({ ...part, state: { ...part.state, output: output.output } })
    }
    out.push({ info: entry.info, parts })
  }
  return out
}

// A deterministic stand-in for a real LLM judge — always collapses an
// eligible batch. This is the *maximum-savings* scenario: it demonstrates
// what the mechanism does when the judge agrees, not a live judgment call.
// No API key is used or required for this mode.
const alwaysCollapseJudge: Judge = async () => ({
  collapse: true,
  note: "Investigated and fixed a webpack build failure (bad entry path in webpack.config.js); build now compiles cleanly.",
})

function estimateTokens(chars: number): number {
  // Standard rough heuristic (~4 chars/token for English text). Not
  // authoritative — see the ANTHROPIC_API_KEY path below for real counts.
  return Math.round(chars / 4)
}

async function main() {
  const maxChars = 2000
  const original = buildSyntheticSession()
  const afterTruncation = await applyTruncation(original, maxChars)
  const plan = await planCollapse(afterTruncation, alwaysCollapseJudge, new Map(), {
    keepTail: 1,
    batchSize: 2,
    maxJudgeCallsPerRequest: 5,
  })
  const final = plan.messages

  const originalSize = sizeOf(original)
  const truncatedSize = sizeOf(afterTruncation)
  const finalSize = sizeOf(final)

  const pct = (before: number, after: number) => (((before - after) / before) * 100).toFixed(1)

  console.log("Memento benchmark — synthetic session (bench/transcript.ts)")
  console.log(`${original.length} message entries, tier A threshold=${maxChars} chars\n`)
  console.log(`Original content:              ${originalSize} chars  (~${estimateTokens(originalSize)} tok, chars/4 estimate)`)
  console.log(
    `After tier A (truncation):     ${truncatedSize} chars  (~${estimateTokens(truncatedSize)} tok)  -${pct(originalSize, truncatedSize)}%`,
  )
  console.log(
    `After tier B (goal-collapse):  ${finalSize} chars  (~${estimateTokens(finalSize)} tok)  -${pct(originalSize, finalSize)}% total, ${plan.judgeCallsUsed} judge call(s)`,
  )
  console.log(`Final entry count: ${final.length} (from ${original.length})`)

  const apiKey: string | undefined = process.env.ANTHROPIC_API_KEY
  if (apiKey === undefined) {
    console.log("\nNo ANTHROPIC_API_KEY set — the numbers above are chars/4 estimates, not real token counts.")
    console.log("Set ANTHROPIC_API_KEY and re-run for real counts via the Messages API count_tokens endpoint.")
    return
  }

  const renderText = (entries: MessageEntry[]) =>
    entries
      .flatMap((e) => e.parts)
      .map((p) => (p.type === "text" ? p.text : p.type === "tool" && p.state.status === "completed" ? p.state.output : ""))
      .join("\n\n")

  async function countTokens(text: string): Promise<number> {
    const res = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
      method: "POST",
      headers: new Headers({ "content-type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" }),
      body: JSON.stringify({ model: "claude-opus-5", messages: [{ role: "user", content: text }] }),
    } satisfies RequestInit)
    if (!res.ok) throw new Error(`count_tokens failed: ${res.status} ${await res.text()}`)
    const json = (await res.json()) as { input_tokens: number }
    return json.input_tokens
  }

  const [realOriginal, realFinal] = await Promise.all([countTokens(renderText(original)), countTokens(renderText(final))])
  console.log(`\nReal token counts (Messages API count_tokens, claude-opus-5):`)
  console.log(`  Original: ${realOriginal} tokens`)
  console.log(`  Final:    ${realFinal} tokens   -${pct(realOriginal, realFinal)}%`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
