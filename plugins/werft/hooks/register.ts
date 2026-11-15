import type { Register, ToolCheckResult } from 'claude-code'

import { agentCommand } from './agent-commands'

// A release takes longer than the session end allows, so it runs in a session of its own with its
// output closed, and `sh` returns at once: only a missing werft can still answer. A failed release
// runs once more, as the werft guide says. `release --owner` needs werft v0.5.0 or later.
const WERFT_MISSING = 3
const RELEASE = `werft --json release --owner "$1"`
const DETACHED_RELEASE = `command -v werft >/dev/null || exit ${WERFT_MISSING}; exec setsid -f sh -c '${RELEASE} || ${RELEASE}' sh "$1" </dev/null >/dev/null 2>&1`

type Lease = { id: string; ssh_config: string }

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
      const listed = await $.process.run(['werft', '--json', 'leases'], { cwd: '/', timeoutMs: 10_000 })
      const leases = listed.exitCode === 0 ? (JSON.parse(listed.stdout) as Lease[]) : []

      if (!leases.some(lease => lease.id === id && lease.ssh_config === config)) {
        return verdict
      }
    }

    if (found.owner !== undefined && found.owner !== `claude-${await $.session.id()}`) {
      return verdict
    }

    return { decision: 'allow' }
  })

  on('session.end', async ($, e, next) => {
    try {
      // The owner that the werft skill gives every lease of this session. `/` outlives every
      // directory the session worked in, a removed worktree included.
      const started = await $.process.run(['sh', '-c', DETACHED_RELEASE, 'sh', `claude-${e.sessionId}`], { cwd: '/' })

      if (started.exitCode === WERFT_MISSING) {
        throw new Error('werft is not on PATH')
      }

      if (started.exitCode !== 0) {
        throw new Error(`the release did not start (exit ${started.exitCode}): is setsid -f on PATH?`)
      }
    } catch (error) {
      $.ui.log(`werft: no lease released at the session end: ${String(error)}`, { to: 'debug' })
    }

    return next(e)
  })
}
