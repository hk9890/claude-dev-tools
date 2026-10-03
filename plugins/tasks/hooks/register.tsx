import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register } from 'claude-code'

import type { TasksBoard, TasksIssue } from '../types'

const BOARD = 'tasks-board'
const SECTIONS = [
  ['In progress', 'inProgress'],
  ['Ready', 'ready'],
  ['Blocked', 'blocked'],
] as const

const board = atom({ plugin: 'tasks', key: 'board' } as const, null)

// taskmgr's --json rows; `blocked_by` is present on the blocked view alone.
type Row = { id: string; type: string; priority: number; title: string; blocked_by?: string[] }

function issues(json: string): TasksIssue[] {
  const rows: Row[] = JSON.parse(json)

  return rows.map(({ id, type, priority, title, blocked_by: blockedBy = [] }) => ({
    id,
    type,
    priority,
    title,
    blockedBy,
  }))
}

// Resolves the board, or the line that says why there is none.
async function loadBoard($: EngineInterface): Promise<TasksBoard | string> {
  try {
    const inProgress = await $.process.run(['taskmgr', 'list', '-q', 'status == "in_progress"', '--json'])
    const ready = await $.process.run(['taskmgr', 'ready', '--json'])
    const blocked = await $.process.run(['taskmgr', 'blocked', '--json'])
    const failed = [inProgress, ready, blocked].find(view => view.exitCode !== 0)

    if (failed !== undefined) {
      return failed.stderr.trim()
    }

    return {
      inProgress: issues(inProgress.stdout),
      ready: issues(ready.stdout),
      blocked: issues(blocked.stdout),
    }
  } catch (error) {
    return `taskmgr did not run (${String(error)}). The tasks-core skill has the install steps.`
  }
}

function issueLine({ id, type, priority, title, blockedBy }: TasksIssue) {
  const blockers = blockedBy.length === 0 ? '' : ` (blocked by ${blockedBy.join(', ')})`

  return `${id} P${priority} ${type} ${title}${blockers}`
}

function boardText(shown: TasksBoard) {
  return SECTIONS.flatMap(([heading, key]) => [
    `${heading} (${shown[key].length})`,
    ...shown[key].map(issue => `  ${issueLine(issue)}`),
  ]).join('\n')
}

function countsLine(shown: TasksBoard) {
  return SECTIONS.map(([heading, key]) => `${shown[key].length} ${heading.toLowerCase()}`).join(', ')
}

function section({ Box, Text }: Elements['terminal' | 'desktop'], heading: string, list: TasksIssue[]) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>
        {heading} ({list.length})
      </Text>
      {list.length === 0 && <Text dimColor>none</Text>}
      {list.map(issue => (
        <Text wrap="truncate-end">{issueLine(issue)}</Text>
      ))}
    </Box>
  )
}

export const register: Register = on => {
  let canDraw = false

  on('session.start', async ($, e, next) => {
    canDraw = e.isInteractive && (e.surface === 'terminal' || e.surface === 'desktop')
    await $.command.register({
      name: BOARD,
      description: 'Show the taskmgr tracker in a pane: in progress, ready, blocked',
    })

    return next(e)
  })

  on('command.run', { command: BOARD }, async $ => {
    const loaded = await loadBoard($)

    if (typeof loaded === 'string') {
      return { text: loaded }
    }

    if (!canDraw) {
      return { text: boardText(loaded) }
    }

    await update($, board, () => loaded)
    await $.ui.open({ id: BOARD, title: 'Tasks' })

    return { text: countsLine(loaded) }
  })

  on('ui.render', { component: 'Pane', requestId: BOARD }, async ($, e, next) => {
    const shown = await read($, board)

    if (shown === null || (e.surface !== 'terminal' && e.surface !== 'desktop')) {
      return next(e)
    }

    const elements = $.ui.resolve(e)
    const { Box } = elements

    return (
      <Box flexDirection="column">
        {SECTIONS.map(([heading, key]) => section(elements, heading, shown[key]))}
      </Box>
    )
  })
}
