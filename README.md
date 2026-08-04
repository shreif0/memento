# Memento

*"I have to believe in a world outside my own mind. I have to believe that my
actions still have meaning, even if I can't remember them."*

An opencode plugin that automatically prunes dead context — resolved tool
output and completed sub-goals — before it bloats your context window.
Named after the movie: it can't hold onto everything, so it writes down what
matters and lets the rest go.

Status: early, v1 in progress. See [`done.md`](./done.md) for the exact scope
and safety invariants this build is held to.

## What it does (v1)

1. **Truncates oversized tool output** at the source, before it's added to
   session history.
2. **Collapses achieved sub-goals** into a single synthetic message before
   each request goes out — automating the manual "scroll back, edit an old
   message to say what's done, continue" workflow.
3. **Turns on Anthropic's native context-clearing beta** by default when
   you're running an Anthropic model, instead of reimplementing what
   Anthropic already ships server-side.

## What it explicitly does not do (v1)

- No standalone proxy. No support for Claude Code, Codex, or Cursor — none
  of them expose a hook to attach to safely. Not "coming soon" — a structural
  gap, documented, not hidden.
- No reasoning-token stripping outside opencode's own request pipeline.
- No wire-protocol parsing of any kind — opencode hands plugins already-typed
  messages, and that's the only interface Memento uses.

## Install

```jsonc
// opencode.json
{
  "plugin": ["memento"]
}
```

(Package not yet published — install steps will be finalized once v1 lands.)

## License

[PolyForm Noncommercial 1.0.0](./LICENSE). Free to use, modify, and share for
any noncommercial purpose. Nobody may sell this or build a paid product on
top of it.
