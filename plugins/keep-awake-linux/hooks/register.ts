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

// The hold in force. A release drops it, so a loop that outlives its hold sees another's, or none.
let hold: object | undefined
let inhibitor: HookStream<ProcessSpawnChunk, ProcessSpawnResult> | undefined
let idleTimer: Timer | undefined
let hasWorkedSinceTimer = false

async function keepAwake($: EngineInterface) {
  if (hold !== undefined) {
    return
  }

  const mine = {}
  hold = mine
  const why = `Claude session ${await $.session.id()}`
  $.ui.status('keep-awake: on')

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
      }
    }
  }

  if (hold === undefined) {
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

export const register: Register = (on, options) => {
  const idleMs = Number(options.idleMinutes) * 60_000

  on('turn.start', async ($, e, next) => {
    idleTimer?.cancel()
    idleTimer = undefined
    const started = await next(e)
    void keepAwake($)

    return started
  })

  on('tool.call', ($, e, next) => {
    hasWorkedSinceTimer = true

    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    if (e.agentId === undefined) {
      const releaseWhenIdle = () => {
        if (hasWorkedSinceTimer) {
          hasWorkedSinceTimer = false
          idleTimer = $.clock.after(idleMs, releaseWhenIdle)
        } else {
          release()
        }
      }

      hasWorkedSinceTimer = false
      idleTimer?.cancel()
      idleTimer = $.clock.after(idleMs, releaseWhenIdle)
    }

    return next(e)
  })

  on('session.end', ($, e, next) => {
    release()

    return next(e)
  })
}
