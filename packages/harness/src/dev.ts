import { AgentEngine } from "./engine.ts"

// Walking skeleton: start one embedded opencode server with the Memento
// plugin wired in, spawn a small fleet of agent sessions on it, and list
// them back — proving the core "manage multiple agents" mechanic works
// before any dashboard UI is built on top of it.

const engine = await AgentEngine.start()
console.log(`engine listening at ${engine.url}`)

try {
  const agents = await Promise.all([
    engine.spawn({ title: "agent one" }),
    engine.spawn({ title: "agent two" }),
    engine.spawn({ title: "agent three" }),
  ])
  console.log(`spawned ${agents.length} agents:`)
  for (const agent of agents) {
    console.log(`  ${agent.id}  ${agent.title}`)
  }

  const listed = await engine.list()
  console.log(`engine reports ${listed.length} session(s) total`)
} finally {
  await engine.stop()
}
