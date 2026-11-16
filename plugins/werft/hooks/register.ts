import type { ProcessRunResult, Register, ToolCheckResult } from 'claude-code'

import { agentCommand } from './agent-commands'

// A release takes longer than the session end allows, so it runs in a session of its own with its
// output closed, and `sh` returns at once: only a missing werft can still answer. It releases
// each owner it is given, and a failed release runs once more, as the werft guide says.
// `release --owner` needs werft v0.5.0 or later.
// Outside the exit codes of werft itself.
const WERFT_MISSING = 99
const RELEASE = `werft --json release --owner "$o"`
const DETACHED_RELEASE = `command -v werft >/dev/null || exit ${WERFT_MISSING}; exec setsid -f sh -c 'for o; do ${RELEASE} || ${RELEASE}; done' sh "$@" </dev/null >/dev/null 2>&1`

type Lease = { id: string; owner: string; ssh_config: string }

// The owner that the werft skill gives every lease of a session. The mod gives a lease of a
// subagent the owner of that agent, so a subagent cannot release the leases of another agent by
// id; the main agent can release them all, the leases its subagents hand back included.
const ownerOf = (sessionId: string, agentId?: string) => (agentId ? `claude-${sessionId}-${agentId}` : `claude-${sessionId}`)

// The subagents of each session that leased, whose owners the session end releases. A hot reload
// of the mod forgets them; their leases then live until they expire.
const leasingAgents = new Map<string, Set<string>>()

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
    const [leases, sessionId] = await Promise.all([
      lease || ownedId ? $.process.run(['werft', '--json', 'leases'], { cwd: '/', timeoutMs: 10_000 }).then(leasesIn) : [],
      owner !== undefined || ownedId ? $.session.id() : undefined,
    ])
    const agentOwner = sessionId === undefined ? undefined : ownerOf(sessionId, e.agentId)
    const isLive = !lease || leases.some(live => live.id === lease.id && live.ssh_config === lease.config)
    const isOwned = !ownedId || leases.some(live => live.id === ownedId && (live.owner === agentOwner || (!e.agentId && live.owner.startsWith(`${agentOwner}-`))))
    // The agent writes the owner of the session, which the lease call below makes its own.
    const isThisOwner = owner === undefined || (sessionId !== undefined && [ownerOf(sessionId), agentOwner].includes(owner))

    return isLive && isOwned && isThisOwner ? { decision: 'allow' } : verdict
  }).catch(($, e, next) => {
    $.ui.log(`werft: a permission check failed, the engine's verdict stands: ${next.error.message ?? next.error.kind}`, { to: 'debug' })

    return next(e)
  })

  // A lease of a subagent with the owner of the session takes the owner of that agent, in each
  // word that names it, whichever flag werft reads it for. The session end releases that owner. A
  // lease in a form the mod reads that cannot take it does not run: under the owner of the
  // session, any agent could release it. Any other form keeps the engine's question.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const { command, agentId } = e
    const owner = agentId ? agentCommand(command)?.owner : undefined
    const sessionId = owner === undefined ? undefined : await $.session.id()

    if (!agentId || sessionId === undefined || ![ownerOf(sessionId), ownerOf(sessionId, agentId)].includes(owner ?? '')) {
      return next(e)
    }

    if (!/^[A-Za-z0-9_-]+$/.test(agentId)) {
      return { deny: `werft: the agent id ${JSON.stringify(agentId)} cannot be part of a lease owner` }
    }

    leasingAgents.set(sessionId, (leasingAgents.get(sessionId) ?? new Set()).add(agentId))
    const sessionOwner = ownerOf(sessionId).replace(/[^A-Za-z0-9_-]/g, '\\$&')
    const sessionOwnerWord = new RegExp(`(?<=[\\s=])${sessionOwner}(?=\\s|$)`, 'g')

    return next({ ...e, command: command.replace(sessionOwnerWord, () => ownerOf(sessionId, agentId)) })
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `werft: the lease could not take the owner of this agent: ${next.error.message ?? next.error.kind}` }))

  on('session.end', async ($, e, next) => {
    const agents = [...(leasingAgents.get(e.sessionId) ?? [])]
    leasingAgents.delete(e.sessionId)

    try {
      // `/` outlives every directory the session worked in, a removed worktree included.
      const owners = [ownerOf(e.sessionId), ...agents.map(agent => ownerOf(e.sessionId, agent))]
      const started = await $.process.run(['sh', '-c', DETACHED_RELEASE, 'sh', ...owners], { cwd: '/' })

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
