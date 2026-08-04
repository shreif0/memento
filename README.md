# Memento

*"I have to believe in a world outside my own mind. I have to believe that my
actions still have meaning, even if I can't remember them."*

Memento is a plugin for opencode that prunes context which has stopped
earning its keep: tool output that has already resolved, and sub-goals that
have already been achieved. The name is borrowed from the film, whose
protagonist cannot form new long-term memories and so is forced to decide,
moment to moment, what is worth writing down and what can safely be
forgotten. The plugin tries to make that same judgment on behalf of an agent
that would otherwise remember everything indiscriminately, at real cost in
context and money.

Status: v1 is feature-complete. All three tiers described below are built,
tested (35 tests, run with `npm test`), and each passed an independent
review before being considered finished. The package has not yet been
published to npm; in the meantime it can be installed locally by pointing
`opencode.json` at this repository's `src/index.ts` (see Install). The exact
scope and the safety invariants this build is held to are laid out in
[`done.md`](./done.md).

## What it does

There are three tiers, and they differ in how much trust they ask for.

**Truncation.** Oversized tool output is cut down to a placeholder at the
moment it is created, before it ever enters session history. This is
mechanical and deterministic: no model is consulted, and nothing is left to
judgment.

**Goal collapse.** Before each outgoing request, a batch of turns that
appears to represent an achieved sub-goal is replaced with a single
synthetic message describing what was accomplished. This automates
something a person might otherwise do by hand in an editor: scrolling back
to an earlier point in the conversation, rewriting it to say what has been
settled, and continuing from there. Of the three tiers, this is the one that
asks a model to make a judgment call, and it is the one this build trusts
least. It stays off unless turned on explicitly:
`{ "plugin": [["memento", { "collapse": true }]] }`.

**Anthropic context management.** When the active model runs through
Anthropic, this tier turns on Anthropic's own context-clearing beta rather
than reimplementing the same idea from scratch. The mapping from opencode's
plugin hooks to Anthropic's provider options has been traced through both
codebases and confirmed, though the path has not yet been exercised against
a live paid call. It is on by default; set `{"contextManagement": false}` to
turn it off.

## Safety invariants

The goal-collapse tier sees the full state of the conversation, and so is
held to invariants that the truncation tier, which only ever sees output
that has already resolved, does not need:

- A batch is never collapsed if it contains one half of an unresolved
  tool_use/tool_result pair. opencode exposes typed `Part` objects, so
  whether something has resolved is a fact the code can check rather than
  infer.
- When the judge is uncertain whether a batch is safe to collapse, it
  declines. Declining is always an acceptable outcome; a wrong collapse is
  not.
- The transform only ever changes what is sent in the outgoing request. It
  does not touch the session as stored on disk. Your own record of the
  conversation continues to reflect what actually happened, which is a
  limitation worth knowing about, since nothing downstream is guaranteed to
  agree with what the model itself saw.

Truncation is simpler to reason about, since it only ever operates on output
that has already resolved and carries no notion of an open turn to violate.
It never fires at or below its threshold, configurable through
`opencode.json`: `{ "plugin": [["memento", { "maxChars": 4000 }]] }`, with a
default of 4000.

The full acceptance criteria this build is held to live in
[`done.md`](./done.md).

## What this does not do, at least not yet

There is no standalone proxy, and no support for Claude Code, Codex, or
Cursor. These are structural gaps: none of those tools currently expose a
hook that a plugin could attach to safely, so there was nothing to build
against. It seemed better to write that down plainly than to let it be
discovered the hard way.

There is also no stripping of reasoning tokens outside opencode's own
request pipeline, and no hand-rolled parsing of any provider's wire format.
opencode hands its plugins messages that are already typed, and that typed
interface is the only thing Memento speaks to.

## Does it actually save tokens?

`npm run bench` runs a session that is synthetic but structurally realistic
through the actual tier A and tier B code, not a stand-in for it. The most
recent run, measured in characters rather than tokens because no funded API
key was available in the environment this was built in (set
`ANTHROPIC_API_KEY` to get a real token count instead):

```
Original content:              12463 chars
After tier A (truncation):      4565 chars   -63.4%
After tier B (goal-collapse):    273 chars   -97.8% total
```

The tier B figure describes what happens when the judge agrees to collapse
every time it is asked, which shows what the mechanism does once it fires.
How often a real judge would choose to fire it on an actual session is a
separate question this benchmark does not answer. The full caveat is in
[`done.md`](./done.md), under Benchmark.

## Install

Before the package is published, opencode can be pointed at this
repository's plugin entry directly. A `"plugin"` entry beginning with `.` or
`/` is resolved by opencode as a local path rather than an npm package; this
has been verified against a real opencode instance, and the details are in
`done.md`.

```jsonc
// opencode.json
{
  "plugin": ["/absolute/path/to/memento/src/index.ts"]
}
```

Once it is published, the same configuration will read:

```jsonc
// opencode.json (bare install: tiers A and C on, tier B goal-collapse off)
{
  "plugin": ["memento"]
}

// or with the options made explicit:
{
  "plugin": [["memento", {
    "maxChars": 4000,          // tier A: truncation threshold
    "collapse": true,          // tier B: goal-collapse, off by default
    "contextManagement": true  // tier C: Anthropic native clearing, on by default
  }]]
}
```

## License

[PolyForm Noncommercial 1.0.0](./LICENSE). The software may be used,
modified, and shared for any noncommercial purpose. Selling it, or building
a paid product on top of it, is not permitted.
