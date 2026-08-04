import { test } from "node:test"
import assert from "node:assert/strict"
import { createTruncateHook, DEFAULT_MAX_CHARS } from "../src/hooks/truncate.ts"

function makeInput(overrides: Partial<{ tool: string; sessionID: string; callID: string; args: any }> = {}) {
  return { tool: "read", sessionID: "ses_1", callID: "call_1", args: {}, ...overrides }
}

test("leaves output untouched when at or below the threshold", async () => {
  const hook = createTruncateHook(10)
  const output = { title: "read", output: "0123456789", metadata: {} }
  await hook(makeInput(), output)
  assert.equal(output.output, "0123456789")
})

test("truncates output that exceeds the threshold and adds a placeholder pointer", async () => {
  const hook = createTruncateHook(10)
  const original = "0123456789abcdef"
  const output = { title: "read", output: original, metadata: {} }
  await hook(makeInput({ tool: "read" }), output)
  assert.ok(output.output.startsWith("0123456789"))
  assert.match(output.output, /memento: truncated read output/)
  assert.match(output.output, new RegExp(`${original.length} chars`))
})

test("bounds a pathologically long tool name in the placeholder instead of letting it dominate", async () => {
  const hook = createTruncateHook(10)
  const longName = "mcp_" + "x".repeat(200)
  const output = { title: longName, output: "0123456789abcdef", metadata: {} }
  await hook(makeInput({ tool: longName }), output)
  assert.ok(
    output.output.length < 300,
    `placeholder must not grow unbounded with tool name length, got ${output.output.length} chars`,
  )
  assert.ok(output.output.includes("…"), "long tool name should be truncated with an ellipsis marker")
})

test("default threshold matches DEFAULT_MAX_CHARS", async () => {
  const hook = createTruncateHook()
  const justUnder = "a".repeat(DEFAULT_MAX_CHARS)
  const output = { title: "bash", output: justUnder, metadata: {} }
  await hook(makeInput({ tool: "bash" }), output)
  assert.equal(output.output, justUnder, "exactly at threshold must not be touched")

  const over = "a".repeat(DEFAULT_MAX_CHARS + 1)
  const output2 = { title: "bash", output: over, metadata: {} }
  await hook(makeInput({ tool: "bash" }), output2)
  assert.notEqual(output2.output, over)
  assert.match(output2.output, /memento: truncated bash output/)
})
