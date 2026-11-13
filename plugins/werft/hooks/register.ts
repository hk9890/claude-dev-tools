import type { Register } from 'claude-code'

// A release takes longer than the session end allows, so one shell runs all of them, in a session
// of its own with its output closed, and the outer `sh` returns at once.
const DETACHED_RELEASES = `exec setsid -f sh -c 'for id do werft --json release "$id"; done' sh "$@" </dev/null >/dev/null 2>&1`

type Lease = { id: string; owner: string }

export const register: Register = on => {
  on('session.end', async ($, e, next) => {
    try {
      // `/` outlives every directory the session worked in, a removed worktree included.
      const listed = await $.process.run(['werft', '--json', 'leases'], {
        cwd: '/',
        timeoutMs: Math.max(1, Math.floor(next.budget.remainingMs / 2)),
      })

      if (listed.exitCode !== 0) {
        throw new Error(`werft --json leases exited ${listed.exitCode}: ${listed.stderr || listed.stdout}`)
      }

      // The owner that the werft skill gives every lease of this session.
      const owner = `claude-${e.sessionId}`
      const ids = (JSON.parse(listed.stdout) as Lease[]).filter(lease => lease.owner === owner).map(lease => lease.id)

      if (ids.length > 0) {
        await $.process.run(['sh', '-c', DETACHED_RELEASES, 'sh', ...ids], { cwd: '/' })
      }
    } catch (error) {
      $.ui.log(`werft: no lease released at the session end: ${String(error)}`, { to: 'debug' })
    }

    return next(e)
  })
}
