import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { AgentEngine } from "@memento/harness"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.resolve(HERE, "../public")

const PORT = Number(process.env.PORT ?? 3111)
const PROJECT_DIRECTORY = process.env.MEMENTO_PROJECT_DIR ?? process.cwd()

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" })
  res.end(payload)
}

async function readJsonBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

function serveStatic(res: http.ServerResponse, pathname: string): boolean {
  const relative = pathname === "/" ? "/index.html" : pathname
  const filePath = path.join(PUBLIC_DIR, relative)
  if (!filePath.startsWith(PUBLIC_DIR)) return false
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false
  const ext = path.extname(filePath)
  res.writeHead(200, { "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream" })
  fs.createReadStream(filePath).pipe(res)
  return true
}

export async function startDashboard(options: { port?: number } = {}): Promise<{
  url: string
  close(): Promise<void>
}> {
  // port: 0 asks the OS for a free port -- avoids clashing with any other
  // opencode server (a manually-run dashboard, another test run) on 4096.
  const engine = await AgentEngine.start({ port: 0 })
  console.log(`[dashboard] opencode engine listening at ${engine.url}`)

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost")
    const pathname = url.pathname

    try {
      if (pathname === "/api/agents" && req.method === "GET") {
        return sendJson(res, 200, await engine.list())
      }

      if (pathname === "/api/agents" && req.method === "POST") {
        const body = await readJsonBody(req)
        const agent = await engine.spawn({
          title: typeof body.title === "string" ? body.title : undefined,
          directory: PROJECT_DIRECTORY,
        })
        return sendJson(res, 201, agent)
      }

      const messagesMatch = pathname.match(/^\/api\/agents\/([^/]+)\/messages$/)
      if (messagesMatch && req.method === "GET") {
        const agentId = decodeURIComponent(messagesMatch[1]!)
        return sendJson(res, 200, await engine.messages(agentId))
      }

      const promptMatch = pathname.match(/^\/api\/agents\/([^/]+)\/prompt$/)
      if (promptMatch && req.method === "POST") {
        const agentId = decodeURIComponent(promptMatch[1]!)
        const body = await readJsonBody(req)
        if (typeof body.text !== "string" || body.text.length === 0) {
          return sendJson(res, 400, { error: "body.text must be a non-empty string" })
        }
        await engine.promptAsync(agentId, body.text)
        return sendJson(res, 202, { ok: true })
      }

      if (pathname === "/api/events" && req.method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        })
        const controller = new AbortController()
        req.on("close", () => controller.abort())
        try {
          // Deliberately sent as the default "message" SSE event (no custom
          // `event:` field) -- the dashboard client listens generically via
          // EventSource#onmessage and filters on the parsed payload's `type`
          // itself, rather than juggling per-type listeners.
          for await (const event of engine.events(controller.signal)) {
            res.write(`data: ${JSON.stringify(event)}\n\n`)
          }
        } catch (error) {
          if (!controller.signal.aborted) console.error("[dashboard] event stream error", error)
        }
        return res.end()
      }

      if (req.method === "GET" && serveStatic(res, pathname)) return

      return sendJson(res, 404, { error: "not found" })
    } catch (error) {
      console.error("[dashboard] request failed", error)
      return sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  })

  const boundPort = options.port ?? PORT
  await new Promise<void>((resolve) => server.listen(boundPort, resolve))
  const address = server.address()
  const url = `http://localhost:${typeof address === "object" && address ? address.port : boundPort}`
  console.log(`[dashboard] serving at ${url}`)

  return {
    url,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await engine.stop()
    },
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  startDashboard().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
