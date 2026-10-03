export type TasksIssue = {
  id: string
  type: string
  priority: number
  title: string
  blockedBy: string[]
}

export type TasksBoard = {
  inProgress: TasksIssue[]
  ready: TasksIssue[]
  blocked: TasksIssue[]
}

declare module 'claude-code' {
  interface PluginState {
    tasks: { board: TasksBoard | null }
  }
}
