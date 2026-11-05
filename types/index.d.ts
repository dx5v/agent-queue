export type QueueJob = {
  id: number
  title: string
  type: string
  status: string
  owner: string | null
  pr: number | null
  linear: string | null
  needs_vento: string | null
  updated_at: string
}

export type QueueBoard = {
  generatedAt: string
  jobs: QueueJob[]
  needsVento: QueueJob[]
  stale: number[]
  error: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'agent-queue': { board: Shaped<QueueBoard | null> }
  }
}
