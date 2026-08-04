import { test } from "node:test"
import assert from "node:assert/strict"
import type { PluginInput } from "@opencode-ai/plugin"
import { Memento } from "../src/index.ts"

const fakeInput = {} as unknown as PluginInput

test("reads maxChars from plugin options (opencode.json config path)", async () => {
  const hooks = await Memento(fakeInput, { maxChars: 5 })
  const hook = hooks["tool.execute.after"]!
  const output = { title: "read", output: "0123456789", metadata: {} }
  await hook({ tool: "read", sessionID: "s", callID: "c", args: {} }, output)
  assert.match(output.output, /memento: truncated read output — 10 chars, kept first 5/)
})

test("falls back to the default when options is missing or invalid", async () => {
  const hooksNoOptions = await Memento(fakeInput, undefined)
  const hooksBadOption = await Memento(fakeInput, { maxChars: "not a number" })
  for (const hooks of [hooksNoOptions, hooksBadOption]) {
    const hook = hooks["tool.execute.after"]!
    const output = { title: "read", output: "a".repeat(4000), metadata: {} }
    await hook({ tool: "read", sessionID: "s", callID: "c", args: {} }, output)
    assert.equal(output.output, "a".repeat(4000), "default threshold (4000) must not truncate an exactly-4000-char output")
  }
})
