import type { Register, ToolCheckResult } from 'claude-code'

import { agentCommand } from './agent-commands'

// A release takes longer than the session end allows, so one shell runs all of them, in a session
// of its own with its output closed, and the outer `sh` returns at once.
const DETACHED_RELEASES = `exec setsid -f sh -c 'for id do werft --json release "$id"; done' sh "$@" </dev/null >/dev/null 2>&1`

type Lease = { id: string; owner: string; ssh_config: string }

// The mode's own question, which the mod may answer; one from a rule, a hook or a setting of the
// user stays theirs.
const isModeAsk = (verdict: ToolCheckResult) => verdict.decision === 'ask' && !verdict.rule && !verdict.hook && !verdict.setting

export const register: Register = on => {
  // The skill's allowed-tools make the engine ask before it loads the skill, and in the default
  // mode of a headless run nobody can answer, so the skill never loads.
  on('tool.check', { tool: 'Skill' }, async ($, e, next) => {
    const verdict = await next(e)
    const { skill } = e.input as { skill?: string }

    return isModeAsk(verdict) && skill === 'werft:werft' ? { decision: 'allow' } : verdict
  })

  // A command that fails here, a werft that cannot list included, keeps the engine's verdict.
  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    const verdict = await next(e)
    const { command, dangerouslyDisableSandbox } = e.input as { command?: string; dangerouslyDisableSandbox?: boolean }
    const found = isModeAsk(verdict) && !dangerouslyDisableSandbox ? agentCommand(command ?? '') : undefined

    if (!found) {
      return verdict
    }

    if (found.lease) {
      const { id, config } = found.lease
      const listed = await $.process.run(['werft', '--json', 'leases'], { cwd: '/' })
      const leases = listed.exitCode === 0 ? (JSON.parse(listed.stdout) as Lease[]) : []

      if (!leases.some(lease => lease.id === id && lease.ssh_config === config)) {
        return verdict
      }
    }

    return { decision: 'allow' }
  })

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
        const started = await $.process.run(['sh', '-c', DETACHED_RELEASES, 'sh', ...ids], { cwd: '/' })

        if (started.exitCode !== 0) {
          throw new Error(`the releases did not start (exit ${started.exitCode}): is setsid -f on PATH?`)
        }
      }
    } catch (error) {
      $.ui.log(`werft: no lease released at the session end: ${String(error)}`, { to: 'debug' })
    }

    return next(e)
  })
}
