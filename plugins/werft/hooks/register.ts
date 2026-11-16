import type { ProcessRunResult, Register, ToolCheckResult } from 'claude-code'

import { agentCommand } from './agent-commands'

// A release takes longer than the session end allows, so it runs in a session of its own with its
// output closed, and `sh` returns at once: only a missing werft can still answer. A failed release
// runs once more, as the werft guide says. `release --owner` needs werft v0.5.0 or later.
// Outside the exit codes of werft itself.
const WERFT_MISSING = 99
const RELEASE = `werft --json release --owner "$1"`
const DETACHED_RELEASE = `command -v werft >/dev/null || exit ${WERFT_MISSING}; exec setsid -f sh -c '${RELEASE} || ${RELEASE}' sh "$1" </dev/null >/dev/null 2>&1`

type Lease = { id: string; owner: string; ssh_config: string }

// The owner that the werft skill gives every lease of a session.
const ownerOf = (sessionId: string) => `claude-${sessionId}`

// A werft that cannot list, or lists what is not a JSON list, lists no lease.
function leasesIn(listed: ProcessRunResult): Lease[] {
  try {
    const leases: unknown = listed.exitCode === 0 ? JSON.parse(listed.stdout) : []
    return Array.isArray(leases) ? (leases as Lease[]) : []
  } catch {
    return []
  }
}

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
  }).catch(($, e, next) => next(e))

  // A command that fails here keeps the engine's verdict, and so does a check that throws: a werft
  // that cannot start, or a session id that cannot be read; the debug log says why.
  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    const verdict = await next(e)
    const { command, dangerouslyDisableSandbox } = e.input as { command?: string; dangerouslyDisableSandbox?: boolean }
    const found = isModeAsk(verdict) && !dangerouslyDisableSandbox ? agentCommand(command ?? '') : undefined

    if (!found) {
      return verdict
    }

    const { lease, owner, ownedId } = found
    const [leases, thisOwner] = await Promise.all([
      lease || ownedId ? $.process.run(['werft', '--json', 'leases'], { cwd: '/', timeoutMs: 10_000 }).then(leasesIn) : [],
      owner !== undefined || ownedId ? $.session.id().then(ownerOf) : undefined,
    ])
    const isLive = !lease || leases.some(live => live.id === lease.id && live.ssh_config === lease.config)
    const isOwned = !ownedId || leases.some(live => live.id === ownedId && live.owner === thisOwner)
    const isThisOwner = owner === undefined || owner === thisOwner

    return isLive && isOwned && isThisOwner ? { decision: 'allow' } : verdict
  }).catch(($, e, next) => {
    $.ui.log(`werft: a permission check failed, the engine's verdict stands: ${next.error.message ?? next.error.kind}`, { to: 'debug' })

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    try {
      // `/` outlives every directory the session worked in, a removed worktree included.
      const started = await $.process.run(['sh', '-c', DETACHED_RELEASE, 'sh', ownerOf(e.sessionId)], { cwd: '/' })

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
