# Memento

This is a monorepo with three packages:

- **[`packages/plugin`](./packages/plugin)** — the Memento opencode plugin
  itself: judged context pruning (truncation, goal-collapse, Anthropic
  native context management). See its README for what it does and how it
  works.
- **[`packages/harness`](./packages/harness)** — `AgentEngine`, a
  control-plane that embeds opencode's own server via `@opencode-ai/sdk`
  and wires the Memento plugin into it automatically. Spawns/lists agent
  sessions, fetches transcripts, sends prompts, and streams live events.
- **[`packages/dashboard`](./packages/dashboard)** — a thin, Cursor-Agents-
  panel-style web UI on top of the harness: a sidebar of agent sessions, a
  transcript view that live-updates over SSE, and a box to prompt whichever
  agent is selected. No code editor, no IDE chrome — just a control surface
  for a fleet of agents.

## Development

```
npm install
npm run typecheck
npm run test
```

To run the dashboard itself (requires the `opencode` CLI on `PATH` —
`npm install -g opencode-ai`):

```
npm run start -w @memento/dashboard
```

Then open http://localhost:3111. Spawning agents and viewing their
transcripts works with no further setup; actually getting a reply out of
an agent requires opencode to have a model provider configured (e.g. an
`ANTHROPIC_API_KEY`) — without one, prompts still send and the resulting
error surfaces in the transcript rather than failing silently.
