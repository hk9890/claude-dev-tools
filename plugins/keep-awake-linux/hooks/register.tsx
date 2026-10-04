import { atom, read, update } from 'claude-code'
import type {
  EngineInterface,
  HookStream,
  ProcessSpawnChunk,
  ProcessSpawnResult,
  Register,
  Timer,
} from 'claude-code'

import type { KeepAwakeInhibitor } from '../types'

// An inhibitor orphaned by a killed Claude Code process lapses after one lease.
const LEASE_SECONDS = 1800

// systemd-inhibit gives no sign that it holds the lock: a child that lives this long has started.
const STARTUP_MS = 1000

// The hold in force. A release drops it, so a loop that outlives its hold sees another's, or none.
let hold: object | undefined
let inhibitor: HookStream<ProcessSpawnChunk, ProcessSpawnResult> | undefined
let idleTimer: Timer | undefined
let cannotInhibit = false

const PANEL = 'keep-awake-info'
const REFRESH_MS = 5000
const WHO = '--who=claude-keep-awake'

const STATUS_NOTES = {
  active: 'active: the session works, or worked a short time ago.',
  orphan: 'orphan: its Claude process is gone. The block ends by itself.',
  duplicate: 'duplicate: one session holds two blocks. This is a defect of the plugin.',
} as const

const inhibitors = atom({ plugin: 'keep-awake-linux', key: 'inhibitors' } as const, null)
let panelRefresh: Timer | undefined

async function keepAwake($: EngineInterface) {
  if (hold !== undefined) {
    return
  }

  const mine = {}
  hold = mine
  const why = `Claude session ${await $.session.id()}`
  let hasStarted = false
  const startup = $.clock.after(STARTUP_MS, () => {
    hasStarted = true
  })

  while (hold === mine) {
    const child = $.process.spawn({
      argv: [
        'systemd-inhibit',
        '--what=idle:sleep',
        WHO,
        `--why=${why}`,
        '--mode=block',
        'sleep',
        String(LEASE_SECONDS),
      ],
    })
    inhibitor = child

    try {
      for await (const _ of child) {
        // systemd-inhibit writes nothing; the loop is the child's life
      }

      const { code } = await child.result

      if (code !== 0) {
        throw new Error(`systemd-inhibit exited with ${code}`)
      }
    } catch (error) {
      if (hold === mine) {
        hold = undefined
        $.ui.log(`inhibitor lost: ${String(error)}`, { to: 'debug' })

        if (!hasStarted) {
          cannotInhibit = true
          $.ui.toast(`sleep is not blocked: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }
  }

  startup.cancel()
}

function release() {
  hold = undefined
  idleTimer?.cancel()
  idleTimer = undefined
  void inhibitor?.return({ code: null, signal: 'SIGTERM' })
  inhibitor = undefined
}

// Every event of a working session is activity: it blocks sleep now and for the idle time after it.
function blockSleep($: EngineInterface, idleMs: number) {
  if (cannotInhibit) {
    return
  }

  idleTimer?.cancel()
  idleTimer = $.clock.after(idleMs, release)
  void keepAwake($)
}

// Resolves every session's inhibitor, or the line that says why there is no list. A live
// systemd-inhibit child holds its lock: logind refuses one at once, and the child ends.
async function loadInhibitors($: EngineInterface): Promise<KeepAwakeInhibitor[] | string> {
  try {
    const thisSession = await $.session.id()
    const children = await $.process.run(['ps', '-C', 'systemd-inhibit', '-o', 'pid=,ppid=,etimes=,args='])
    const held = [...children.stdout.matchAll(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/gm)]
      .filter(([, , , , args = '']) => args.includes(WHO))
      .map(([, pid, parentPid, ageSeconds, args = '']) => ({
        session: /--why=Claude session (\S+)/.exec(args)?.[1] ?? 'unknown',
        pid: Number(pid),
        parentPid: Number(parentPid),
        ageSeconds: Number(ageSeconds),
      }))

    if (held.length === 0) {
      return []
    }

    const parents = await $.process.run(['ps', '-o', 'pid=,comm=', '-p', held.map(one => one.parentPid).join(',')])
    const parentNames = new Map(
      [...parents.stdout.matchAll(/^\s*(\d+)\s+(.*)$/gm)].map(([, pid, name = '']) => [Number(pid), name] as const),
    )
    const owned = held.map(({ parentPid, ...one }) => ({ ...one, parent: parentNames.get(parentPid) ?? 'gone' }))

    return owned.map(one => ({
      ...one,
      isThisSession: one.session === thisSession,
      status:
        one.parent !== 'claude'
          ? 'orphan'
          : owned.some(other => other !== one && other.session === one.session && other.parent === 'claude')
            ? 'duplicate'
            : 'active',
    }))
  } catch (error) {
    return `ps did not run (${String(error)}).`
  }
}

function clock(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

// A docked pane is about 50 columns wide: a row is 48.
function tableLine(session: string, status: string, pid: string, lease: string) {
  return `${session.padEnd(9)}  ${status.padEnd(9)}  ${pid.padEnd(7)}  ${lease}`
}

// What the pane shows and the text answer prints: the state in one sentence, the blocks, and what
// each word in the table means.
function info(list: KeepAwakeInhibitor[]) {
  if (list.length === 0) {
    return { summary: 'No Claude session blocks sleep. The computer can suspend.', table: [], notes: [] }
  }

  return {
    summary: `Sleep is blocked: Claude holds ${list.length} ${list.length === 1 ? 'block' : 'blocks'}. The computer does not suspend while a row is listed.`,
    table: [
      tableLine('SESSION', 'STATUS', 'PID', 'LEASE'),
      ...list.map(({ session, status, pid, ageSeconds, isThisSession }) =>
        tableLine(
          `${session.slice(0, 8)}${isThisSession ? '*' : ''}`,
          status,
          String(pid),
          status === 'orphan'
            ? `ends in ${clock(Math.max(0, LEASE_SECONDS - ageSeconds))}`
            : `renewed ${clock(ageSeconds)} ago`,
        ),
      ),
    ],
    notes: [
      ...(list.some(one => one.isThisSession) ? ['*: this session.'] : []),
      ...(['active', 'orphan', 'duplicate'] as const)
        .filter(status => list.some(one => one.status === status))
        .map(status => STATUS_NOTES[status]),
      `LEASE: a block lasts ${LEASE_SECONDS / 60} minutes. An active session renews it.`,
    ],
  }
}

function infoText(list: KeepAwakeInhibitor[]) {
  const { summary, table, notes } = info(list)

  return [summary, ...(table.length === 0 ? [] : ['', ...table, '', ...notes])].join('\n')
}

function stopPanelRefresh() {
  panelRefresh?.cancel()
  panelRefresh = undefined
}

async function refreshPanel($: EngineInterface) {
  if (!(await $.ui.panes()).some(pane => pane.id === PANEL)) {
    stopPanelRefresh()

    return
  }

  const loaded = await loadInhibitors($)

  if (typeof loaded !== 'string') {
    await update($, inhibitors, () => loaded)
  }
}

// Asked at each run: the desktop app joins a session after it started, and can leave it.
async function hasPaneSurface($: EngineInterface) {
  return (await $.session.surfaces()).some(surface => surface === 'terminal' || surface === 'desktop')
}

export const register: Register = (on, options) => {
  const idleMs = Number(options.idleMinutes) * 60_000

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: PANEL,
      description: 'Show in a pane which Claude sessions block system sleep',
    })

    return next(e)
  })

  on('command.run', { command: PANEL }, async $ => {
    const loaded = await loadInhibitors($)

    if (typeof loaded === 'string') {
      return { text: loaded }
    }

    if (!(await hasPaneSurface($))) {
      return { text: infoText(loaded) }
    }

    await update($, inhibitors, () => loaded)
    const { isPlaced } = await $.ui.open({ id: PANEL, title: 'Keep awake' })

    if (!isPlaced) {
      return { text: infoText(loaded) }
    }

    panelRefresh ??= $.clock.every(REFRESH_MS, () => void refreshPanel($))

    return { text: info(loaded).summary }
  })

  on('ui.render', { component: 'Pane', requestId: PANEL }, async ($, e, next) => {
    const shown = await read($, inhibitors)

    if (shown === null || (e.surface !== 'terminal' && e.surface !== 'desktop')) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const { summary, table, notes } = info(shown)

    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text>{summary}</Text>
        </Box>
        {table.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            {table.map((line, index) => (
              <Text bold={index === 0} wrap="truncate-end">
                {line}
              </Text>
            ))}
          </Box>
        )}
        {notes.map(note => (
          <Text dimColor>{note}</Text>
        ))}
      </Box>
    )
  })

  on('turn.start', ($, e, next) => {
    blockSleep($, idleMs)

    return next(e)
  })

  on('tool.call', ($, e, next) => {
    blockSleep($, idleMs)

    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    blockSleep($, idleMs)

    return next(e)
  })

  on('session.end', ($, e, next) => {
    release()
    stopPanelRefresh()

    return next(e)
  })
}
