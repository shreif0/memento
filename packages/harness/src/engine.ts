import { createOpencode, type OpencodeClient } from "@opencode-ai/sdk"
import { fileURLToPath } from "node:url"
import path from "node:path"

const HERE = path.dirname(fileURLToPath(import.meta.url))

const MEMENTO_PLUGIN_PATH = path.resolve(HERE, "../../plugin/src/index.ts")

export type EngineOptions = {
  hostname?: string
  port?: number
}

export type Agent = {
  id: string
  title: string
}

/**
 * Owns one embedded opencode server and the fleet of agent sessions running
 * on it. The Memento plugin is wired into every spawned server so context
 * pruning applies to every session without per-agent configuration.
 */
export class AgentEngine {
  private readonly client: OpencodeClient
  private readonly server: { url: string; close(): void }

  private constructor(client: OpencodeClient, server: { url: string; close(): void }) {
    this.client = client
    this.server = server
  }

  static async start(options: EngineOptions = {}): Promise<AgentEngine> {
    // createOpencodeServer merges its option-defaults with Object.assign, which
    // does not skip `undefined` values -- an explicit `hostname: undefined` key
    // here would clobber the SDK's own default and produce `--hostname=undefined`
    // on the CLI invocation. Only forward keys the caller actually set.
    const { client, server } = await createOpencode({
      ...(options.hostname !== undefined ? { hostname: options.hostname } : {}),
      ...(options.port !== undefined ? { port: options.port } : {}),
      config: {
        plugin: [MEMENTO_PLUGIN_PATH],
      },
    })
    return new AgentEngine(client, server)
  }

  get url(): string {
    return this.server.url
  }

  /** Spawn a new agent session, optionally scoped to a project directory. */
  async spawn(options: { directory?: string; title?: string } = {}): Promise<Agent> {
    const response = await this.client.session.create({
      query: options.directory ? { directory: options.directory } : undefined,
      body: options.title ? { title: options.title } : undefined,
    })
    if (!response.data) {
      throw new Error(`Failed to create session: ${JSON.stringify(response.error)}`)
    }
    return { id: response.data.id, title: response.data.title ?? "" }
  }

  async list(): Promise<Agent[]> {
    const response = await this.client.session.list()
    if (!response.data) {
      throw new Error(`Failed to list sessions: ${JSON.stringify(response.error)}`)
    }
    return response.data.map((session) => ({ id: session.id, title: session.title ?? "" }))
  }

  async stop(): Promise<void> {
    this.server.close()
  }
}
