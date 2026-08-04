import { test } from "node:test"
import assert from "node:assert/strict"
import type { Model } from "@opencode-ai/sdk"
import { createAnthropicContextHook } from "../src/hooks/anthropic-context.ts"

function fakeInput(npm: string) {
  return { model: { api: { npm } } as unknown as Model } as any
}

function fakeOutput() {
  return {
    temperature: 1,
    topP: 1,
    topK: 1,
    maxOutputTokens: undefined,
    options: {} as Record<string, any>,
  }
}

test("does nothing when the model isn't served through @ai-sdk/anthropic", async () => {
  const hook = createAnthropicContextHook()
  const output = fakeOutput()
  await hook(fakeInput("@ai-sdk/openai"), output)
  assert.deepEqual(output.options, {}, "must never touch options for a non-Anthropic model")
})

test("sets providerOptions.anthropic.contextManagement.edits for an Anthropic model, both edits by default", async () => {
  const hook = createAnthropicContextHook()
  const output = fakeOutput()
  await hook(fakeInput("@ai-sdk/anthropic"), output)
  assert.deepEqual(output.options.anthropic.contextManagement.edits, [
    { type: "clear_tool_uses_20250919" },
    { type: "clear_thinking_20251015" },
  ])
})

test("clearToolInputs is only included when explicitly set", async () => {
  const hook = createAnthropicContextHook({ clearToolInputs: true })
  const output = fakeOutput()
  await hook(fakeInput("@ai-sdk/anthropic"), output)
  assert.deepEqual(output.options.anthropic.contextManagement.edits[0], {
    type: "clear_tool_uses_20250919",
    clearToolInputs: true,
  })
})

test("each edit type can be disabled independently", async () => {
  const hook = createAnthropicContextHook({ clearThinking: false })
  const output = fakeOutput()
  await hook(fakeInput("@ai-sdk/anthropic"), output)
  assert.deepEqual(output.options.anthropic.contextManagement.edits, [{ type: "clear_tool_uses_20250919" }])
})

test("disabling both edits leaves options untouched entirely (no empty contextManagement object)", async () => {
  const hook = createAnthropicContextHook({ clearToolUses: false, clearThinking: false })
  const output = fakeOutput()
  await hook(fakeInput("@ai-sdk/anthropic"), output)
  assert.deepEqual(output.options, {})
})

test("preserves any pre-existing providerOptions.anthropic fields set by another hook", async () => {
  const hook = createAnthropicContextHook()
  const output = fakeOutput()
  output.options.anthropic = { sendReasoning: true }
  await hook(fakeInput("@ai-sdk/anthropic"), output)
  assert.equal(output.options.anthropic.sendReasoning, true)
  assert.ok(output.options.anthropic.contextManagement)
})
