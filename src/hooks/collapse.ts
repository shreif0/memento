import type { Hooks } from "@opencode-ai/plugin"
import type { Message, Part } from "@opencode-ai/sdk"

export type MessageEntry = { info: Message; parts: Part[] }
export type JudgeResult = { collapse: false } | { collapse: true; note: string }
export type Judge = (span: MessageEntry[]) => Promise<JudgeResult>

function isPartResolved(part: Part): boolean {
  if (part.type !== "tool") return true
  return part.state.status === "completed" || part.state.status === "error"
}

export function isEntryResolved(entry: MessageEntry): boolean {
  return entry.parts.every(isPartResolved)
}

/**
 * Groups a flat message list into turns, each anchored on a user message.
 * A leading run of non-user entries (shouldn't happen in practice) becomes
 * its own turn rather than being dropped.
 */
export function splitIntoTurns(messages: MessageEntry[]): MessageEntry[][] {
  const turns: MessageEntry[][] = []
  for (const entry of messages) {
    if (entry.info.role === "user" || turns.length === 0) {
      turns.push([entry])
    } else {
      turns[turns.length - 1]!.push(entry)
    }
  }
  return turns
}

export function isTurnResolved(turn: MessageEntry[]): boolean {
  return turn.every(isEntryResolved)
}

/** Reuses the anchor user message's session/agent/model — only id and content change. */
export function buildSyntheticEntry(
  anchor: Extract<Message, { role: "user" }>,
  note: string,
): MessageEntry {
  const id = `memento-collapse-${anchor.id}`
  const info: Message = { ...anchor, id, summary: undefined }
  const parts: Part[] = [
    {
      id: `${id}-text`,
      sessionID: anchor.sessionID,
      messageID: id,
      type: "text",
      text: note,
      synthetic: true,
    },
  ]
  return { info, parts }
}

export interface CollapseOptions {
  /** Never touch the most recent N turns — the model's active working context. */
  keepTail?: number
  /** Fixed batch size: turns are judged together in groups of exactly this many. */
  batchSize?: number
  /** Ceiling on fresh judge calls per hook invocation (per outgoing request). */
  maxJudgeCallsPerRequest?: number
}

export interface CollapsePlan {
  messages: MessageEntry[]
  judgeCallsUsed: number
}

/**
 * Rebuilds the message list for one outgoing request. History is walked in
 * fixed-size batches of turns from the start:
 *
 * - A batch already in `cache` (by its last message id) is applied without
 *   calling the judge — this is what makes repeated requests over a stable
 *   history cheap: the same batch boundary recurs every request (the
 *   persisted session is never mutated, so the harness resends the same
 *   original history each time) and only needs judging once.
 * - The first not-yet-cached, fully-resolved batch is judged fresh, cached,
 *   and applied.
 * - Once `maxJudgeCallsPerRequest` fresh judge calls have been spent (default
 *   1), everything from that point on — including any later eligible batch —
 *   is left completely untouched for this request. It gets picked up on a
 *   later one. This bounds judge cost/latency to a fixed ceiling per request,
 *   regardless of how much history has accumulated.
 * - The instant a batch is unresolved, partial, or doesn't start on a user
 *   message, the walk stops and everything from there on (including the kept
 *   tail) is left untouched. Fail closed, always.
 */
export async function planCollapse(
  messages: MessageEntry[],
  judge: Judge,
  cache: Map<string, JudgeResult>,
  opts: CollapseOptions = {},
): Promise<CollapsePlan> {
  const keepTail = opts.keepTail ?? 1
  const batchSize = opts.batchSize ?? 2
  const maxJudgeCallsPerRequest = opts.maxJudgeCallsPerRequest ?? 1

  const turns = splitIntoTurns(messages)
  const eligibleCount = Math.max(0, turns.length - keepTail)

  const result: MessageEntry[] = []
  let i = 0
  let judgeCallsUsed = 0

  // i + batchSize <= eligibleCount, not i < eligibleCount: a batch must fit
  // entirely within the eligible region. The weaker check let a batch's tail
  // end straddle into the kept-tail turns whenever batchSize didn't evenly
  // divide eligibleCount — caught by planCollapse's own test suite.
  while (i + batchSize <= eligibleCount) {
    const batchTurns = turns.slice(i, i + batchSize)
    if (!batchTurns.every(isTurnResolved)) break

    const anchor = batchTurns[0]![0]!.info
    if (anchor.role !== "user") break // structurally shouldn't happen; never guess

    const batchEntries = batchTurns.flat()
    const key = batchEntries[batchEntries.length - 1]!.info.id

    let verdict = cache.get(key)
    if (!verdict) {
      if (judgeCallsUsed >= maxJudgeCallsPerRequest) break
      verdict = await judge(batchEntries).catch((): JudgeResult => ({ collapse: false }))
      cache.set(key, verdict)
      judgeCallsUsed++
    }

    if (verdict.collapse) {
      result.push(buildSyntheticEntry(anchor, verdict.note))
    } else {
      result.push(...batchEntries)
    }
    i += batchSize
  }

  result.push(...turns.slice(i).flat())
  return { messages: result, judgeCallsUsed }
}

export function createCollapseHook(
  judge: Judge,
  opts: CollapseOptions = {},
): NonNullable<Hooks["experimental.chat.messages.transform"]> {
  const cache = new Map<string, JudgeResult>()
  return async (_input, output) => {
    const plan = await planCollapse(output.messages, judge, cache, opts)
    output.messages = plan.messages
  }
}
