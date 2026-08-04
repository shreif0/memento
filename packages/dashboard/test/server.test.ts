import { test } from "node:test"
import assert from "node:assert/strict"
import { startDashboard } from "../src/server.ts"

type Agent = { id: string; title: string }

test("spawns an agent, lists it, and reads its (empty) transcript", async (t) => {
  const dashboard = await startDashboard({ port: 0 })
  t.after(() => dashboard.close())

  const created = await fetch(`${dashboard.url}/api/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "test agent" }),
  })
  assert.equal(created.status, 201)
  const agent = (await created.json()) as Agent
  assert.equal(agent.title, "test agent")
  assert.equal(typeof agent.id, "string")

  const listed = await fetch(`${dashboard.url}/api/agents`)
  assert.equal(listed.status, 200)
  const agents = (await listed.json()) as Agent[]
  assert.ok(agents.some((a) => a.id === agent.id))

  const messages = await fetch(`${dashboard.url}/api/agents/${agent.id}/messages`)
  assert.equal(messages.status, 200)
  assert.deepEqual(await messages.json(), [])
})

test("rejects an empty prompt body and serves the static frontend", async (t) => {
  const dashboard = await startDashboard({ port: 0 })
  t.after(() => dashboard.close())

  const created = await fetch(`${dashboard.url}/api/agents`, { method: "POST" })
  const agent = (await created.json()) as Agent

  const badPrompt = await fetch(`${dashboard.url}/api/agents/${agent.id}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "" }),
  })
  assert.equal(badPrompt.status, 400)

  const index = await fetch(`${dashboard.url}/`)
  assert.equal(index.status, 200)
  assert.match(await index.text(), /<title>Memento<\/title>/)
})
