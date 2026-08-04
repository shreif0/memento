import { test } from "node:test"
import assert from "node:assert/strict"
import type { Message, Part } from "@opencode-ai/sdk"
import {
  isEntryResolved,
  splitIntoTurns,
  buildSyntheticEntry,
  planCollapse,
  createCollapseHook,
  type MessageEntry,
  type Judge,
  type JudgeResult,
} from "../src/hooks/collapse.ts"

function userMsg(id: string): Message {
  return {
    id,
    sessionID: "ses_1",
    role: "user",
    time: { created: 0 },
    agent: "build",
    model: { providerID: "anthropic", modelID: "claude-opus-5" },
  }
}

function assistantMsg(id: string): Message {
  return {
    id,
    sessionID: "ses_1",
    role: "assistant",
    time: { created: 0 },
    parentID: "x",
    modelID: "claude-opus-5",
    providerID: "anthropic",
    mode: "build",
    path: { cwd: "/", root: "/" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  }
}

function textPart(id: string, text: string): Part {
  return { id, sessionID: "ses_1", messageID: id, type: "text", text }
}

function toolPart(id: string, status: "pending" | "running" | "completed" | "error"): Part {
  const base = { id, sessionID: "ses_1", messageID: id, type: "tool" as const, callID: id, tool: "read" }
  if (status === "pending") return { ...base, state: { status, input: {}, raw: "" } }
  if (status === "running") return { ...base, state: { status, input: {}, time: { start: 0 } } }
  if (status === "completed")
    return {
      ...base,
      state: { status, input: {}, output: "ok", title: "read", metadata: {}, time: { start: 0, end: 1 } },
    }
  return { ...base, state: { status, input: {}, error: "boom", time: { start: 0, end: 1 } } }
}

function turn(userId: string, ...toolStatuses: Array<"pending" | "running" | "completed" | "error">): MessageEntry[] {
  const entries: MessageEntry[] = [{ info: userMsg(userId), parts: [textPart(`${userId}-t`, "do thing")] }]
  if (toolStatuses.length > 0) {
    entries.push({
      info: assistantMsg(`${userId}-a`),
      parts: toolStatuses.map((s, i) => toolPart(`${userId}-tool-${i}`, s)),
    })
  }
  return entries
}

const alwaysCollapse: Judge = async () => ({ collapse: true, note: "did the thing" })
const neverCollapse: Judge = async () => ({ collapse: false })

test("splitIntoTurns groups messages by leading user message", () => {
  const messages = [...turn("u1", "completed"), ...turn("u2", "completed")]
  const turns = splitIntoTurns(messages)
  assert.equal(turns.length, 2)
  assert.equal(turns[0]!.length, 2)
  assert.equal(turns[0]![0]!.info.id, "u1")
})

test("isEntryResolved is false for pending/running tool parts, true otherwise", () => {
  assert.equal(isEntryResolved({ info: assistantMsg("a"), parts: [toolPart("t", "pending")] }), false)
  assert.equal(isEntryResolved({ info: assistantMsg("a"), parts: [toolPart("t", "running")] }), false)
  assert.equal(isEntryResolved({ info: assistantMsg("a"), parts: [toolPart("t", "completed")] }), true)
  assert.equal(isEntryResolved({ info: assistantMsg("a"), parts: [toolPart("t", "error")] }), true)
  assert.equal(isEntryResolved({ info: assistantMsg("a"), parts: [textPart("t", "hi")] }), true)
})

test("buildSyntheticEntry reuses the anchor's session/agent/model and marks the part synthetic", () => {
  const anchor = userMsg("u1") as Extract<Message, { role: "user" }>
  const entry = buildSyntheticEntry(anchor, "did the thing")
  assert.equal(entry.info.role, "user")
  assert.notEqual(entry.info.id, anchor.id)
  assert.equal((entry.info as any).sessionID, "ses_1")
  assert.equal((entry.info as any).agent, "build")
  assert.equal(entry.parts.length, 1)
  assert.equal(entry.parts[0]!.type, "text")
  assert.equal((entry.parts[0] as any).text, "did the thing")
  assert.equal((entry.parts[0] as any).synthetic, true)
})

test("planCollapse: below batch size + keepTail leaves everything untouched", async () => {
  const messages = [...turn("u1", "completed")]
  const plan = await planCollapse(messages, alwaysCollapse, new Map(), { keepTail: 1, batchSize: 2 })
  assert.equal(plan.messages.length, messages.length)
  assert.equal(plan.judgeCallsUsed, 0)
})

test("planCollapse: never spans across an unresolved (pending/running) turn", async () => {
  const messages = [
    ...turn("u1", "completed"),
    ...turn("u2", "running"), // breaks the first batch
    ...turn("u3", "completed"),
    ...turn("u4", "completed"), // kept tail
  ]
  const plan = await planCollapse(messages, alwaysCollapse, new Map(), { keepTail: 1, batchSize: 2 })
  assert.equal(plan.messages.length, messages.length, "nothing eligible — batch [u1,u2] is blocked by u2's running tool")
  assert.equal(plan.judgeCallsUsed, 0)
})

test("planCollapse: never touches the kept tail even if fully resolved", async () => {
  const messages = [...turn("u1", "completed"), ...turn("u2", "completed"), ...turn("u3", "completed")]
  // batchSize 2, keepTail 1 -> eligible = turns[0..2) = [u1,u2]; u3 stays untouched as tail.
  const plan = await planCollapse(messages, alwaysCollapse, new Map(), { keepTail: 1, batchSize: 2 })
  // u1+u2 (4 entries) collapse to 1 synthetic entry; u3 (2 entries: user + assistant) passes through.
  assert.equal(plan.messages.length, 1 + 2, "u1+u2 collapse to 1 synthetic entry, u3 passes through untouched")
  assert.equal(plan.messages[1]!.info.id, "u3")
})

test("planCollapse: collapses a full eligible batch when the judge says so", async () => {
  const messages = [...turn("u1", "completed"), ...turn("u2", "completed"), ...turn("u3", "completed")]
  const plan = await planCollapse(messages, alwaysCollapse, new Map(), { keepTail: 1, batchSize: 2 })
  assert.equal(plan.messages[0]!.info.role, "user")
  assert.equal((plan.messages[0]!.parts[0] as any).text, "did the thing")
  assert.equal(plan.judgeCallsUsed, 1)
})

test("planCollapse: leaves a batch untouched (not just uncollapsed) when the judge declines", async () => {
  const messages = [...turn("u1", "completed"), ...turn("u2", "completed"), ...turn("u3", "completed")]
  const plan = await planCollapse(messages, neverCollapse, new Map(), { keepTail: 1, batchSize: 2 })
  assert.equal(plan.messages.length, messages.length)
  assert.equal(plan.messages[0]!.info.id, "u1", "declined batch keeps its original entries, not a synthetic one")
})

test("planCollapse: fails closed if the judge throws — never corrupts or shrinks history", async () => {
  const throwing: Judge = async () => {
    throw new Error("judge exploded")
  }
  const messages = [...turn("u1", "completed"), ...turn("u2", "completed"), ...turn("u3", "completed")]
  const plan = await planCollapse(messages, throwing, new Map(), { keepTail: 1, batchSize: 2 })
  assert.equal(plan.messages.length, messages.length)
  assert.equal(plan.messages[0]!.info.id, "u1")
})

test("planCollapse: caches a batch's verdict by its last message id — stable across requests", async () => {
  let calls = 0
  const countingJudge: Judge = async () => {
    calls++
    return { collapse: true, note: "done" }
  }
  const cache = new Map<string, JudgeResult>()
  const base = [...turn("u1", "completed"), ...turn("u2", "completed"), ...turn("u3", "completed")]

  const plan1 = await planCollapse(base, countingJudge, cache, { keepTail: 1, batchSize: 2 })
  assert.equal(calls, 1)
  assert.equal(plan1.judgeCallsUsed, 1)

  // Next request: harness resends the *original* uncollapsed history (transform
  // never mutates the persisted session) — the [u1,u2] batch boundary is
  // identical, so it must hit the cache and cost zero fresh judge calls, even
  // though u3 (now non-tail, since u4 exists) is a newly eligible batch on its own.
  const plan2 = await planCollapse([...base, ...turn("u4", "completed")], countingJudge, cache, {
    keepTail: 1,
    batchSize: 2,
  })
  assert.equal(calls, 1, "the [u1,u2] batch must not be re-judged")
  assert.equal(plan2.messages[0]!.info.role, "user", "cached collapse for [u1,u2] still applied")
})

test("planCollapse: at most maxJudgeCallsPerRequest fresh judge calls per call, rest left untouched for a later request", async () => {
  let calls = 0
  const countingJudge: Judge = async () => {
    calls++
    return { collapse: true, note: `batch ${calls}` }
  }
  const messages = [
    ...turn("u1", "completed"),
    ...turn("u2", "completed"),
    ...turn("u3", "completed"),
    ...turn("u4", "completed"),
    ...turn("u5", "completed"), // kept tail
  ]
  // Two full batches are eligible ([u1,u2] and [u3,u4]), budget is 1.
  const plan = await planCollapse(messages, countingJudge, new Map(), {
    keepTail: 1,
    batchSize: 2,
    maxJudgeCallsPerRequest: 1,
  })
  assert.equal(calls, 1, "only the first batch may be freshly judged this request")
  assert.equal(plan.judgeCallsUsed, 1)
  assert.equal(plan.messages[0]!.info.role, "user", "first batch collapsed")
  // Second batch [u3,u4] was never reached — passes through as original entries.
  assert.equal(plan.messages[1]!.info.id, "u3")
})

test("planCollapse: a batch may never straddle into the kept tail, even when batchSize doesn't evenly divide the eligible count", async () => {
  let calls = 0
  const countingJudge: Judge = async () => {
    calls++
    return { collapse: true, note: "x" }
  }
  // 4 turns, keepTail=1 -> eligibleCount=3, batchSize=2. A naive `i < eligibleCount`
  // loop would let the second batch be turns.slice(2,4) = [u3, u4] — but u4 (index 3)
  // is the kept tail and must never be included in any batch, judged or not.
  //
  // maxJudgeCallsPerRequest is deliberately set well above what a second
  // (illegal) batch would need — a prior version of this test used the
  // default budget of 1, which independently blocked the second batch and
  // made the assertions pass whether or not the boundary check was actually
  // correct. Isolating the boundary logic means removing every other reason
  // the loop could stop early.
  const messages = [
    ...turn("u1", "completed"),
    ...turn("u2", "completed"),
    ...turn("u3", "completed"),
    ...turn("u4", "completed"), // kept tail — must never appear in a batch
  ]
  const plan = await planCollapse(messages, countingJudge, new Map(), {
    keepTail: 1,
    batchSize: 2,
    maxJudgeCallsPerRequest: 5,
  })
  assert.equal(calls, 1, "only the [u1,u2] batch fits entirely within the eligible region — not a budget effect")
  assert.equal(plan.messages.length, 1 + 2 + 2, "synthetic(u1,u2) + untouched u3 + untouched (kept-tail) u4")
  const tailIds = plan.messages.slice(1).map((e) => e.info.id)
  assert.deepEqual(tailIds, ["u3", "u3-a", "u4", "u4-a"])
})

test("createCollapseHook: mutates output.messages in place per the hook contract", async () => {
  const hook = createCollapseHook(alwaysCollapse, { keepTail: 1, batchSize: 2 })
  const messages = [...turn("u1", "completed"), ...turn("u2", "completed"), ...turn("u3", "completed")]
  const output = { messages }
  await hook({}, output)
  assert.equal(output.messages.length, 1 + 2, "u1+u2 collapsed, u3's 2 entries pass through")
  assert.equal(output.messages[0]!.info.role, "user")
})
