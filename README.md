# Memento

This is a monorepo with two packages:

- **[`packages/plugin`](./packages/plugin)** — the Memento opencode plugin
  itself: judged context pruning (truncation, goal-collapse, Anthropic
  native context management). See its README for what it does and how it
  works.
- **[`packages/harness`](./packages/harness)** — a control-plane for
  spawning and managing multiple agent sessions on top of opencode's own
  server, with the Memento plugin wired in automatically. Early days: see
  its README for what's built and what isn't yet.

## Development

```
npm install
npm run typecheck
npm run test
```
