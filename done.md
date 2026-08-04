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

**Unverified runtime caveat**: opencode's plugin runtime is Bun, not Node —
this repo's tests run under `node --experimental-strip-types` because Bun
isn't available in the dev environment this was built in. Source imports use
explicit `.ts` extensions (verified to resolve correctly under Node's
type-stripping loader); Bun is expected to resolve the same way, but that has
not been confirmed by actually loading the plugin inside opencode/Bun. Flag
this if it's ever load-bearing.

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
History is walked in fixed-size batches of turns from the start. A batch
already judged in a prior request (cached by its last message id) is
reapplied for free — this is what makes it cheap on a stable history, since
the transform never mutates the persisted session and the harness resends
the same original history every request, so the same batch boundary recurs.
The first not-yet-cached, fully-resolved batch is judged fresh: if the judge
says a sub-goal was achieved, that batch collapses into one synthetic
message, mirroring "scroll back, edit an old message to say what was
achieved, continue." **At most one fresh judge call per outgoing request**
(configurable) — bounds judge cost/latency to a fixed ceiling regardless of
how much history has accumulated; later eligible batches are left untouched
and picked up on a subsequent request. Never touches the most recent
`keepTail` turns (default 1) — the model's active working context.
Opt-in: `{ "plugin": [["memento", { "collapse": true }]] }`, off by default.
Implementation: `src/hooks/collapse.ts` (fully unit-tested, no live API
needed) + `src/hooks/judge.ts` (the actual LLM call — see unverified note
below).

## Non-negotiable safety invariants

**Tier B (goal-collapse) only** — `tool.execute.after` (tier A) only ever
sees already-resolved tool calls; it has no visibility into turn/message
state, so "open turn" is not a concept it can observe or violate. These
invariants apply to `experimental.chat.messages.transform`:

- [ ] Never let a collapsed/transformed span include one half of an
      unresolved tool_use/tool_result pair. opencode's own `Part` typing makes
      "resolved" checkable directly — no heuristic parsing.
- [ ] Fail closed: if the judge is uncertain whether a span is safe to
      collapse, skip it. "No collapse this turn" is always a legal outcome.
- [ ] The transform hook never mutates the persisted session store — only the
      outgoing request. State-divergence is a known, documented limitation in
      the README, not a hidden landmine.

**Tier A (truncation) invariant:**

- [x] Truncation never fires at or below the threshold. Threshold is
      user-configurable via `opencode.json`:
      `{ "plugin": [["memento", { "maxChars": N }]] }`, defaulting to 4000
      chars. Verified: `test/truncate.test.ts`.

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
