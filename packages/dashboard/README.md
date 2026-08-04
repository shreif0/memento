# @memento/dashboard

A thin control-plane UI for browsing and managing agent sessions — the
Cursor-Agents-panel shape, not a code editor. Built on
[`@memento/harness`](../harness).

```
npm run start -w @memento/dashboard
```

Opens an HTTP server on `:3111` (override with `PORT`) that:

- boots one `AgentEngine` (an embedded opencode server with the Memento
  plugin wired in)
- serves a static single-page frontend (`public/`, vanilla JS, no build
  step)
- exposes a small JSON API the frontend talks to:
  - `GET /api/agents` — list agent sessions
  - `POST /api/agents` — spawn one (`{ title? }`)
  - `GET /api/agents/:id/messages` — full transcript
  - `POST /api/agents/:id/prompt` — send a message (`{ text }`), returns
    immediately; the reply streams in via events
  - `GET /api/events` — Server-Sent Events, one JSON payload per opencode
    event (session/message/part updates, errors, etc). The frontend
    doesn't parse individual event types — it just refetches the agent
    list and the selected transcript whenever *anything* arrives. Simple
    and correct; revisit for granular part-level streaming if polling the
    full transcript on every event becomes a real cost.

By default agents are spawned scoped to the directory the dashboard server
itself was started in (`MEMENTO_PROJECT_DIR` env var to override).

Sending a prompt works with no further setup, but getting an actual reply
requires opencode to have a model provider configured (e.g.
`ANTHROPIC_API_KEY` in the environment). Without one, the prompt still
sends and the resulting provider error surfaces directly in the transcript
as a red error bubble rather than failing silently — verified by hand in a
real browser.
