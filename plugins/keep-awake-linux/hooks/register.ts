import type {
  EngineInterface,
  HookStream,
  ProcessSpawnChunk,
  ProcessSpawnResult,
  Register,
  Timer,
} from 'claude-code'

// An inhibitor orphaned by a killed Claude Code process lapses after one lease.
const LEASE_SECONDS = 1800

// systemd-inhibit gives no sign that it holds the lock: a child that lives this long has started.
const STARTUP_MS = 1000

// The hold in force. A release drops it, so a loop that outlives its hold sees another's, or none.
let hold: object | undefined
let inhibitor: HookStream<ProcessSpawnChunk, ProcessSpawnResult> | undefined
let idleTimer: Timer | undefined
let cannotInhibit = false

// The status text outlives the hold that showed it when the next hold takes over before it ended.
let isStatusShown = false

async function keepAwake($: EngineInterface) {
  if (hold !== undefined) {
    return
  }

  const mine = {}
  hold = mine
  const why = `Claude session ${await $.session.id()}`
  let hasStarted = false
  const startup = $.clock.after(STARTUP_MS, () => {
    if (hold === mine) {
      hasStarted = true
      isStatusShown = true
      $.ui.status('sleep blocked')
    }
  })

  while (hold === mine) {
    const child = $.process.spawn({
      argv: [
        'systemd-inhibit',
        '--what=idle:sleep',
        '--who=claude-keep-awake',
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

  if (isStatusShown && hold === undefined) {
    isStatusShown = false
    $.ui.status(undefined)
  }
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

export const register: Register = (on, options) => {
  const idleMs = Number(options.idleMinutes) * 60_000

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

    return next(e)
  })
}
