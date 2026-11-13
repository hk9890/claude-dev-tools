import type { Register } from 'claude-code'

import { isAgentCommand } from './agent-commands'

// A release takes longer than the session end allows, so one shell runs all of them, in a session
// of its own with its output closed, and the outer `sh` returns at once.
const DETACHED_RELEASES = `exec setsid -f sh -c 'for id do werft --json release "$id"; done' sh "$@" </dev/null >/dev/null 2>&1`

// The names the model calls the werft skill by.
const WERFT_SKILL = ['werft:werft', 'werft']

type Lease = { id: string; owner: string }

export const register: Register = on => {
  // The skill's allowed-tools make the engine ask before it loads the skill, and in the default
  // mode of a headless run nobody can answer, so the skill never loads. Its own call is allowed
  // here; every other verdict, a deny rule included, stands.
  on('tool.check', { tool: 'Skill' }, async ($, e, next) => {
    const verdict = await next(e)
    const { skill } = e.input as { skill?: string }

    return verdict.decision === 'ask' && WERFT_SKILL.includes(skill ?? '') ? { decision: 'allow' } : verdict
  }).catch(($, e, next) => next(e))

  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    const verdict = await next(e)
    const { command } = e.input as { command?: string }

    return verdict.decision === 'ask' && isAgentCommand(command ?? '') ? { decision: 'allow' } : verdict
  }).catch(($, e, next) => next(e))

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
