# Memento — Definition of Done (v1)

This file is the acceptance bar for every milestone. A critic subagent checks
work against this file, not against vibes. If something claimed "done" isn't
verifiable from what's actually in the repo, it isn't done.

## Scope

Memento v1 is a single **opencode plugin**. Not a network proxy, not a
standalone harness, not multi-CLI. No support for Claude Code (the CLI
product), Codex, or Cursor in v1 — none of them expose a hook into their own
outgoing request construction, so there is nothing safe to attach to. This is
a structural decision, not a "coming soon."

Non-commercial only: PolyForm Noncommercial License 1.0.0. Nobody may make
money off this software.

## Real mechanism (verified against opencode 1.17.13 / `@opencode-ai/plugin`,
not guessed)

opencode plugins receive already-parsed `Message` / `Part[]` objects.
tool_use/tool_result pairing and thinking-block bookkeeping are resolved by
opencode itself before a plugin ever sees them — Memento does not parse wire
JSON and does not need its own protocol state machine. This is a meaningfully
safer position than the network-proxy shape considered and rejected earlier.

Hooks used:

- **`experimental.chat.messages.transform`** — rewrites the outgoing message
  array immediately before each request is sent to the provider. Does **not**
  mutate the persisted session — this is where judged goal-collapse happens,
  per request. (Experimental hook name — confirm it still exists on the
  opencode version in use; if opencode renames/removes it, that's a blocking
  finding for a critic pass, not something to route around silently.)
- **`tool.execute.after`** — fires when a tool call resolves, before its
  output is added to the session. Mechanical truncation happens here, once,
  at the source.
- **`chat.params`** / **`chat.headers`** — escape hatch for provider-specific
  request options/headers. Used to inject Anthropic's
  `context-management-2025-06-27` beta (`clear_tool_uses_20250919`,
  `clear_thinking_20251015`) when the active provider is Anthropic.
  **Unverified**: whether opencode's Anthropic provider actually forwards
  `options`/headers into the underlying SDK call in a way that reaches these
  fields has not been confirmed against opencode source. Ships flagged
  `experimental`; the associated test must fail loudly (not silently) if the
  params aren't actually being forwarded, until this is confirmed some other
  way (reading opencode's provider source, or a live integration check).

## Two capabilities

**A. Mechanical tier — tool-output truncation (`tool.execute.after`)**
Oversized tool results get truncated to a placeholder + pointer at creation
time, before they're ever added to history. No judgment call, no LLM call,
deterministic, configurable size threshold.

**B. Judged tier — goal-collapse (`experimental.chat.messages.transform`)**
An LLM-judge call inspects the message history for a span that represents an
achieved sub-goal and, if found, replaces that whole span with one synthetic
message before the request goes out — automating "scroll back, edit an old
message to say what was achieved, continue."

## Non-negotiable safety invariants

- [ ] Never let a collapsed/transformed span include one half of an
      unresolved tool_use/tool_result pair. opencode's own `Part` typing makes
      "resolved" checkable directly — no heuristic parsing.
- [ ] Fail closed: if the judge is uncertain whether a span is safe to
      collapse, skip it. "No collapse this turn" is always a legal outcome.
- [ ] The transform hook never mutates the persisted session store — only the
      outgoing request. State-divergence is a known, documented limitation in
      the README, not a hidden landmine.
- [ ] Truncation (tier A) never fires below a configurable size threshold, and
      never truncates a tool result that's still part of an open turn.

## Explicit non-goals (v1)

- No network proxy.
- No Claude Code (the CLI) support.
- No Codex support.
- No Cursor support.
- No reasoning/thinking-block stripping outside opencode's own pipeline.
- No hand-rolled multi-provider wire-format parsing — opencode's already-typed
  objects are the only interface Memento talks to.

## Deliverables checklist

- [ ] `LICENSE` — PolyForm Noncommercial 1.0.0, verbatim.
- [ ] `README.md` — what it does, install steps, the two capabilities,
      explicit non-goals, safety invariants, the known-unverified Anthropic
      passthrough item.
- [ ] `src/index.ts` + hook modules implementing A and B.
- [ ] Tests: fail-closed invariant (a synthetic transcript with an open
      tool_use never collapses across it); truncation threshold behavior;
      context_management param injection, or a test that explicitly and
      loudly marks this unverified if it can't be checked in this
      environment.
- [ ] Git history: one commit per milestone, not a single dump commit.
- [ ] Repo installs into a real opencode config
      (`opencode.json` → `"plugin": ["memento"]`, or a local
      `.opencode/plugins/` symlink) without throwing on load.

## How critic passes are graded

At each milestone, a critic subagent is given this file plus the current repo
diff and asked: does this satisfy the relevant checklist items, does it
violate any safety invariant, and is anything claimed "done" that isn't
actually verifiable from what's in the repo. A critic pass that finds a real
gap blocks moving to the next task — it doesn't get silently waved through.
