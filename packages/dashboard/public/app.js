const agentListEl = document.getElementById("agent-list")
const newAgentButton = document.getElementById("new-agent")
const emptyStateEl = document.getElementById("empty-state")
const transcriptViewEl = document.getElementById("transcript-view")
const transcriptEl = document.getElementById("transcript")
const agentTitleEl = document.getElementById("agent-title")
const agentIdEl = document.getElementById("agent-id")
const promptForm = document.getElementById("prompt-form")
const promptInput = document.getElementById("prompt-input")

/** @type {{id: string, title: string}[]} */
let agents = []
let selectedAgentId = null

async function api(path, options) {
  const res = await fetch(path, options)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `${res.status} ${res.statusText}`)
  }
  return res.status === 204 ? null : res.json()
}

function renderAgentList() {
  agentListEl.innerHTML = ""
  for (const agent of agents) {
    const li = document.createElement("li")
    li.textContent = agent.title || agent.id
    li.dataset.id = agent.id
    if (agent.id === selectedAgentId) li.classList.add("active")
    li.addEventListener("click", () => selectAgent(agent.id))
    agentListEl.appendChild(li)
  }
}

async function refreshAgents() {
  agents = await api("/api/agents")
  renderAgentList()
}

function partToNode(part) {
  const div = document.createElement("div")
  if (part.type === "text" && part.text) {
    div.textContent = part.text
  } else if (part.type === "tool") {
    div.className = "part-tool"
    const status = part.state && part.state.status ? part.state.status : "pending"
    div.textContent = `→ ${part.tool} (${status})`
  } else {
    return null
  }
  return div
}

function renderMessages(messages) {
  transcriptEl.innerHTML = ""
  for (const { info, parts } of messages) {
    const bubble = document.createElement("div")
    bubble.className = `message ${info.role}`
    let hasContent = false
    for (const part of parts) {
      const node = partToNode(part)
      if (node) {
        bubble.appendChild(node)
        hasContent = true
      }
    }
    if (info.error) {
      const errorNode = document.createElement("div")
      errorNode.className = "part-error"
      errorNode.textContent = `⚠ ${info.error.data?.message ?? info.error.name ?? "request failed"}`
      bubble.appendChild(errorNode)
      hasContent = true
    }
    if (hasContent) transcriptEl.appendChild(bubble)
  }
  transcriptEl.scrollTop = transcriptEl.scrollHeight
}

async function refreshTranscript() {
  if (!selectedAgentId) return
  const messages = await api(`/api/agents/${encodeURIComponent(selectedAgentId)}/messages`)
  renderMessages(messages)
}

function selectAgent(id) {
  selectedAgentId = id
  const agent = agents.find((a) => a.id === id)
  agentTitleEl.textContent = agent ? agent.title || "(untitled)" : ""
  agentIdEl.textContent = id
  emptyStateEl.hidden = true
  transcriptViewEl.hidden = false
  renderAgentList()
  refreshTranscript().catch(console.error)
}

newAgentButton.addEventListener("click", async () => {
  const title = window.prompt("Agent title (optional):") ?? ""
  const agent = await api("/api/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  })
  await refreshAgents()
  selectAgent(agent.id)
})

promptForm.addEventListener("submit", async (event) => {
  event.preventDefault()
  const text = promptInput.value.trim()
  if (!text || !selectedAgentId) return
  promptInput.value = ""
  try {
    await api(`/api/agents/${encodeURIComponent(selectedAgentId)}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
  } catch (error) {
    console.error(error)
    window.alert(`Failed to send prompt: ${error.message}`)
  }
  refreshTranscript().catch(console.error)
})

function connectEventStream() {
  const source = new EventSource("/api/events")
  let pending = null
  source.onmessage = () => {
    // Coalesce bursts of events into a single refresh per animation frame.
    if (pending) return
    pending = requestAnimationFrame(() => {
      pending = null
      refreshAgents().catch(console.error)
      refreshTranscript().catch(console.error)
    })
  }
  source.onerror = () => {
    source.close()
    setTimeout(connectEventStream, 2000)
  }
}

refreshAgents().catch(console.error)
connectEventStream()
