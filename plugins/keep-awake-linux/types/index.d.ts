export type KeepAwakeInhibitor = {
  session: string
  pid: number
  parent: string
  ageSeconds: number
  verdict: 'healthy' | 'orphan' | 'duplicate'
  isThisSession: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'keep-awake-linux': { inhibitors: KeepAwakeInhibitor[] | null }
  }
}
