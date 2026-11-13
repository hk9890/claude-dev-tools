import type { Register } from 'claude-code'

// The owner that the werft skill gives every lease of a session.
const ownerOf = (sessionId: string) => `claude-${sessionId}`

// A release takes longer than the session end allows, so each one runs in a session of its own
// with its output closed, and `sh` returns at once.
const DETACHED_RELEASE = 'exec setsid -f werft --json release "$1" </dev/null >/dev/null 2>&1'

// The time the release starts need after the list, out of the session end's one short bound.
const START_RELEASES_MS = 300

type Lease = { id: string; owner: string }

function leasesOf(stdout: string, owner: string) {
  const leases: unknown = JSON.parse(stdout)

  return Array.isArray(leases) ? (leases as Lease[]).filter(lease => lease.owner === owner).map(lease => lease.id) : []
}

export const register: Register = on => {
  on('session.end', async ($, e, next) => {
    try {
      const timeoutMs = Math.max(1, next.budget.remainingMs - START_RELEASES_MS)
      const listed = await $.process.run(['werft', '--json', 'leases'], { timeoutMs })
      const ids = listed.exitCode === 0 ? leasesOf(listed.stdout, ownerOf(e.sessionId)) : []

      await Promise.all(ids.map(id => $.process.run(['sh', '-c', DETACHED_RELEASE, 'sh', id])))
    } catch (error) {
      $.ui.log(`werft: no lease released at the session end: ${String(error)}`, { to: 'debug' })
    }

    return next(e)
  })
}
