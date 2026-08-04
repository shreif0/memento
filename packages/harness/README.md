# @memento/harness

The control-plane for spawning and managing a fleet of agent sessions.

It embeds [opencode](https://github.com/sst/opencode)'s own server via
`@opencode-ai/sdk` (`createOpencode`) as the execution engine — tool calls,
sandboxing, and multi-provider model support all come from opencode. Every
spawned server has the Memento plugin (`../plugin`) wired into its config
automatically, so context pruning applies to every session without
per-agent setup.

`AgentEngine` (`src/engine.ts`) is the whole surface:

```ts
const engine = await AgentEngine.start()
const agent = await engine.spawn({ title: "fix the flaky test" })
const agents = await engine.list()
const messages = await engine.messages(agent.id)
await engine.promptAsync(agent.id, "start with the flaky test in checkout.spec.ts")
for await (const event of engine.events()) {
  // session.updated, message.updated, message.part.updated, session.error, ...
}
await engine.stop()
```

Run `npm run dev -w @memento/harness` for a walking-skeleton script that
starts an engine, spawns a few agents, and lists them back.

Requires the `opencode` CLI on `PATH` (`npm install -g opencode-ai`), since
the SDK shells out to it to run the server.

`packages/dashboard` is the UI built on top of this — see its README.
