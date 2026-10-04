export type KeepAwakeInhibitor = {
  session: string
  pid: number
  ageSeconds: number
  status: 'active' | 'orphan' | 'duplicate'
  isThisSession: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'keep-awake-linux': { inhibitors: KeepAwakeInhibitor[] | null }
  }
}
