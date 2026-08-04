import { test } from "node:test"
import assert from "node:assert/strict"
import type { OpencodeClient } from "@opencode-ai/sdk"
import type { MessageEntry } from "../src/hooks/collapse.ts"
import { createOpencodeSessionJudge } from "../src/hooks/judge.ts"

function textEntry(id: string, role: "user" | "assistant", text: string): MessageEntry {
  return {
    info: { id, sessionID: "ses_1", role } as any,
    parts: [{ id: `${id}-t`, sessionID: "ses_1", messageID: id, type: "text", text }],
  }
}

const sampleSpan: MessageEntry[] = [
  textEntry("u1", "user", "read the config file"),
  textEntry("a1", "assistant", "done, it uses JSON"),
]

interface FakeClientOptions {
  createId?: string | null
  createThrows?: boolean
  promptReplyText?: string
  promptThrows?: boolean
  promptReturnsNoData?: boolean
  deleteThrows?: boolean
}

function makeFakeClient(opts: FakeClientOptions = {}) {
  const calls = { create: 0, prompt: 0, delete: 0, deletedIds: [] as string[] }
  const client = {
    session: {
      async create(_args: any) {
        calls.create++
        if (opts.createThrows) throw new Error("create failed")
        if (opts.createId === null) return { data: undefined }
        return { data: { id: opts.createId ?? "ses_judge_1" } }
      },
      async prompt(_args: any) {
        calls.prompt++
        if (opts.promptThrows) throw new Error("prompt failed")
        if (opts.promptReturnsNoData) return { data: undefined }
        return {
          data: {
            parts: [{ type: "text", text: opts.promptReplyText ?? "NO_COLLAPSE" }],
          },
        }
      },
      async delete(args: any) {
        calls.delete++
        calls.deletedIds.push(args.path.id)
        if (opts.deleteThrows) throw new Error("delete failed")
      },
    },
  } as unknown as OpencodeClient
  return { client, calls }
}

test("returns collapse:true with the parsed note on a well-formed COLLAPSE reply", async () => {
  const { client, calls } = makeFakeClient({ promptReplyText: "COLLAPSE: read config, decided on JSON" })
  const judge = createOpencodeSessionJudge(client)
  const result = await judge(sampleSpan)
  assert.deepEqual(result, { collapse: true, note: "read config, decided on JSON" })
  assert.equal(calls.create, 1)
  assert.equal(calls.prompt, 1)
  assert.equal(calls.delete, 1, "the ephemeral judge session must be cleaned up")
  assert.deepEqual(calls.deletedIds, ["ses_judge_1"])
})

test("returns collapse:false on an explicit NO_COLLAPSE reply", async () => {
  const { client } = makeFakeClient({ promptReplyText: "NO_COLLAPSE" })
  const judge = createOpencodeSessionJudge(client)
  assert.deepEqual(await judge(sampleSpan), { collapse: false })
})

test("returns collapse:false on a garbage reply that isn't NO_COLLAPSE and doesn't start with COLLAPSE:", async () => {
  const { client } = makeFakeClient({ promptReplyText: "I cannot collapse this, sorry." })
  const judge = createOpencodeSessionJudge(client)
  assert.deepEqual(await judge(sampleSpan), { collapse: false })
})

test("returns collapse:false when COLLAPSE: is followed by only whitespace", async () => {
  const { client } = makeFakeClient({ promptReplyText: "COLLAPSE:    " })
  const judge = createOpencodeSessionJudge(client)
  assert.deepEqual(await judge(sampleSpan), { collapse: false })
})

test("returns collapse:false without ever prompting when session.create yields no id", async () => {
  const { client, calls } = makeFakeClient({ createId: null })
  const judge = createOpencodeSessionJudge(client)
  assert.deepEqual(await judge(sampleSpan), { collapse: false })
  assert.equal(calls.prompt, 0, "must not prompt into a session that doesn't exist")
  assert.equal(calls.delete, 0, "nothing to delete if nothing was created")
})

test("returns collapse:false when session.prompt yields no data", async () => {
  const { client, calls } = makeFakeClient({ promptReturnsNoData: true })
  const judge = createOpencodeSessionJudge(client)
  assert.deepEqual(await judge(sampleSpan), { collapse: false })
  assert.equal(calls.delete, 1, "the ephemeral session is still cleaned up even on an empty reply")
})

test("if session.create throws, the rejection propagates (planCollapse is the fail-closed boundary, not this function)", async () => {
  const { client, calls } = makeFakeClient({ createThrows: true })
  const judge = createOpencodeSessionJudge(client)
  await assert.rejects(judge(sampleSpan), /create failed/)
  assert.equal(calls.delete, 0, "no session was created, nothing to delete")
})

test("if session.prompt throws, the rejection propagates but the ephemeral session is still deleted first", async () => {
  const { client, calls } = makeFakeClient({ promptThrows: true })
  const judge = createOpencodeSessionJudge(client)
  await assert.rejects(judge(sampleSpan), /prompt failed/)
  assert.equal(calls.delete, 1, "cleanup must happen via finally even when prompt throws")
})

test("a failing session.delete does not crash the judge call or hide its result", async () => {
  const { client, calls } = makeFakeClient({ promptReplyText: "COLLAPSE: fine", deleteThrows: true })
  const judge = createOpencodeSessionJudge(client)
  const result = await judge(sampleSpan)
  assert.deepEqual(result, { collapse: true, note: "fine" })
  assert.equal(calls.delete, 1, "delete was attempted even though it fails")
})
