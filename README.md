# Memento

*"I have to believe in a world outside my own mind. I have to believe that my
actions still have meaning, even if I can't remember them."*

An opencode plugin that automatically prunes dead context — resolved tool
output and completed sub-goals — before it bloats your context window.
Named after the movie: it can't hold onto everything, so it writes down what
matters and lets the rest go.

Status: v1 feature-complete — all three tiers built, tested (35 tests,
`npm test`), and gate-checked. Not yet published to npm; install locally by
pointing `opencode.json` at this repo's `src/index.ts` (see Install below).
See [`done.md`](./done.md) for the exact scope and safety invariants this
build is held to.

## What it does (v1)

1. **Truncates oversized tool output** at the source, before it's added to
   session history.
2. **Collapses achieved sub-goals** into a single synthetic message before
   each request goes out — automating the manual "scroll back, edit an old
   message to say what's done, continue" workflow. **Opt-in, off by
   default** — it's the highest-risk tier (an LLM judge call, no live
   end-to-end test yet) and isn't enabled unless you ask for it:
   `{ "plugin": [["memento", { "collapse": true }]] }`.
3. **Turns on Anthropic's native context-clearing beta** by default when
   you're running an Anthropic model, instead of reimplementing what
   Anthropic already ships server-side. Source-verified against opencode's
   and `@ai-sdk/anthropic`'s own request-building code — not a live
   end-to-end test, but a real, traced field mapping, not a guess. Disable
   with `{"contextManagement": false}` if you don't want it.

## Safety invariants

Goal-collapse (tier B — sees full message state):
- Never collapses one half of an unresolved tool_use/tool_result pair —
  opencode's own typed `Part` objects make "resolved" checkable directly, so
  this isn't a heuristic.
- Fails closed: if it's unsure whether a span is safe to collapse, it skips
  it. No collapse this turn is always a legal outcome.
- Never mutates your persisted session — only the outgoing request. Your
  session file always reflects what you actually did; state divergence from
  that is a known, documented limitation, not a hidden one.

Truncation (tier A — only ever sees already-resolved tool output, no turn
state to violate):
- Never fires at or below the threshold. Configurable via `opencode.json`:
  `{ "plugin": [["memento", { "maxChars": 4000 }]] }` — defaults to 4000.

Full detail and the exact acceptance criteria this build is held to: see
[`done.md`](./done.md).

## What it explicitly does not do (v1)

- No standalone proxy. No support for Claude Code, Codex, or Cursor — none
  of them expose a hook to attach to safely. Not "coming soon" — a structural
  gap, documented, not hidden.
- No reasoning-token stripping outside opencode's own request pipeline.
- No wire-protocol parsing of any kind — opencode hands plugins already-typed
  messages, and that's the only interface Memento uses.

## Does it actually save tokens?

`npm run bench` runs a synthetic-but-realistic session through the real tier
A/B code (not a mock). Last run, char-count based (no funded API key in the
build environment — set `ANTHROPIC_API_KEY` to get real token counts instead
of the chars/4 estimate the script clearly labels otherwise):

```
Original content:              12463 chars
After tier A (truncation):      4565 chars   -63.4%
After tier B (goal-collapse):    273 chars   -97.8% total
```

Tier B's number is the **maximum-savings case** — the benchmark's judge
always agrees to collapse, by design, to show what the mechanism does when
it fires. It is not a claim about how often a real judge would agree on a
real session. See [`done.md`](./done.md) → Benchmark for the full caveat.

## Install

**Now, before npm publish** — point opencode at this repo's plugin entry
directly (a local file-source plugin spec: opencode resolves any `"plugin"`
entry starting with `.` or `/` as a path, not an npm package — this is
live-verified against a real opencode instance, see `done.md`):

```jsonc
// opencode.json
{
  "plugin": ["/absolute/path/to/memento/src/index.ts"]
}
```

**Once published to npm**, the same config becomes:

```jsonc
// opencode.json — bare install, tiers A + C on, tier B (goal-collapse) off
{
  "plugin": ["memento"]
}

// or with explicit options:
{
  "plugin": [["memento", {
    "maxChars": 4000,          // tier A: truncation threshold
    "collapse": true,          // tier B: goal-collapse — opt-in, off by default
    "contextManagement": true  // tier C: Anthropic native clearing — on by default
  }]]
}
```

## License

[PolyForm Noncommercial 1.0.0](./LICENSE). Free to use, modify, and share for
any noncommercial purpose. Nobody may sell this or build a paid product on
top of it.
