import type { Message, Part } from "@opencode-ai/sdk"
import type { MessageEntry } from "../src/hooks/collapse.ts"

let counter = 0
const nextId = (prefix: string) => `${prefix}_${++counter}`

function userMsg(id: string, sessionID: string): Message {
  return {
    id,
    sessionID,
    role: "user",
    time: { created: Date.now() },
    agent: "build",
    model: { providerID: "anthropic", modelID: "claude-opus-5" },
  }
}

function assistantMsg(id: string, sessionID: string): Message {
  return {
    id,
    sessionID,
    role: "assistant",
    time: { created: Date.now() },
    parentID: id,
    modelID: "claude-opus-5",
    providerID: "anthropic",
    mode: "build",
    path: { cwd: "/repo", root: "/repo" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  }
}

function textPart(sessionID: string, messageID: string, text: string): Part {
  return { id: nextId("part"), sessionID, messageID, type: "text", text }
}

function completedTool(sessionID: string, messageID: string, tool: string, output: string): Part {
  return {
    id: nextId("part"),
    sessionID,
    messageID,
    type: "tool",
    callID: nextId("call"),
    tool,
    state: { status: "completed", input: {}, output, title: tool, metadata: {}, time: { start: 0, end: 1 } },
  }
}

/** Realistic-shaped synthetic session: a build-fixing task (resolvable, collapsible)
 * followed by the start of unrelated new work (the active tail — must never be touched). */
export function buildSyntheticSession(sessionID = "ses_bench"): MessageEntry[] {
  const entries: MessageEntry[] = []

  const buildErrorLog = Array.from(
    { length: 60 },
    (_, i) => `webpack.config.js:${i + 10}: Module not found: Error: Can't resolve './missing-${i}'`,
  ).join("\n")

  const u1 = nextId("msg")
  entries.push({ info: userMsg(u1, sessionID), parts: [textPart(sessionID, u1, "Investigate why the build is failing")] })
  const a1 = nextId("msg")
  entries.push({
    info: assistantMsg(a1, sessionID),
    parts: [
      textPart(sessionID, a1, "Running the build to see the error."),
      completedTool(sessionID, a1, "bash", `$ npm run build\n${buildErrorLog}\n\nBuild failed with 60 errors.`),
    ],
  })

  const webpackConfig = Array.from(
    { length: 150 },
    (_, i) => `  rule${i}: { test: /\\.${i}$/, use: ['loader-${i}'] },`,
  ).join("\n")

  const u2 = nextId("msg")
  entries.push({ info: userMsg(u2, sessionID), parts: [textPart(sessionID, u2, "Check the webpack config")] })
  const a2 = nextId("msg")
  entries.push({
    info: assistantMsg(a2, sessionID),
    parts: [
      textPart(sessionID, a2, "Reading the config file."),
      completedTool(sessionID, a2, "read", `module.exports = {\n${webpackConfig}\n};`),
      completedTool(sessionID, a2, "grep", "webpack.config.js:3:  entry: './src/missing-entry.js',"),
    ],
  })

  const u3 = nextId("msg")
  entries.push({ info: userMsg(u3, sessionID), parts: [textPart(sessionID, u3, "Fix the entry path")] })
  const a3 = nextId("msg")
  entries.push({
    info: assistantMsg(a3, sessionID),
    parts: [completedTool(sessionID, a3, "edit", "Updated webpack.config.js: entry changed to './src/index.js'")],
  })

  const u4 = nextId("msg")
  entries.push({ info: userMsg(u4, sessionID), parts: [textPart(sessionID, u4, "Run the build again")] })
  const a4 = nextId("msg")
  entries.push({
    info: assistantMsg(a4, sessionID),
    parts: [
      completedTool(sessionID, a4, "bash", "$ npm run build\nCompiled successfully in 4.2s"),
      textPart(sessionID, a4, "Build is fixed."),
    ],
  })

  // Active tail: unrelated new work, must never be touched by truncation-of-history
  // or collapse — this is what keepTail protects.
  const u5 = nextId("msg")
  entries.push({
    info: userMsg(u5, sessionID),
    parts: [textPart(sessionID, u5, "Now add a dark mode toggle to the settings page")],
  })

  return entries
}
