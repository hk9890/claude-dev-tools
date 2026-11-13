import type { EngineInterface, FsStat, Register, ToolCheckResult } from 'claude-code'

import { type AgentCommand, agentCommand } from './agent-commands'

// A release takes longer than the session end allows, so one shell runs all of them, in a session
// of its own with its output closed, and the outer `sh` returns at once.
const DETACHED_RELEASES = `exec setsid -f sh -c 'for id do werft --json release "$id"; done' sh "$@" </dev/null >/dev/null 2>&1`

type Lease = { id: string; owner: string; ssh_config: string }

// The mode's own question, which the mod may answer; one from a rule, a hook or a setting of the
// user stays theirs.
const isModeAsk = (verdict: ToolCheckResult) => verdict.decision === 'ask' && !verdict.rule && !verdict.hook && !verdict.setting

// More entries than a tree an agent copies into a lease holds; past it the copy keeps its question.
const TREE_LIMIT = 10_000

// What a path leads to and where it lands, every link resolved; undefined where it leads nowhere.
const resolved = ($: EngineInterface, path: string): Promise<FsStat | undefined> =>
  $.fs.stat(path, { resolve: true }).then(
    (stat: FsStat) => (stat.realPath === undefined ? undefined : stat),
    () => undefined,
  )

// Whether each path the command reads on this host lands in the project, and, under a tree it copies
// whole, each link too: a link in the working tree may lead to a file anywhere on this host.
async function readsOnlyTheProject($: EngineInterface, command: AgentCommand): Promise<boolean> {
  if (!command.reads) {
    return true
  }

  const root = (await resolved($, await $.session.root()))?.realPath
  // The shell resolves the command's relative paths against the directory the session runs in.
  const cwd = await $.session.cwd()

  if (root === undefined) {
    return false
  }

  const isInside = (stat: FsStat | undefined) => stat?.realPath === root || Boolean(stat?.realPath?.startsWith(`${root}/`))

  for (const path of command.reads) {
    if (!isInside(await resolved($, `${cwd}/${path}`))) {
      return false
    }
  }

  if (command.copiesTree === undefined) {
    return true
  }

  const top = await resolved($, `${cwd}/${command.copiesTree}`)
  const pending = top?.kind === 'dir' && top.realPath ? [top.realPath] : []
  const walked = new Set<string>()
  let entries = 0

  for (let dir = pending.pop(); dir !== undefined; dir = pending.pop()) {
    if (walked.has(dir)) {
      continue
    }

    walked.add(dir)

    for (const entry of await $.fs.list(dir)) {
      entries += 1

      if (entries > TREE_LIMIT) {
        return false
      }

      const path = `${dir}/${entry.name}`

      if (entry.isLink) {
        const target = await resolved($, path)

        if (!isInside(target)) {
          return false
        }

        if (target?.kind === 'dir' && target.realPath) {
          pending.push(target.realPath)
        }
      } else if (entry.kind === 'dir') {
        pending.push(path)
      }
    }
  }

  return true
}

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

    if (!(await readsOnlyTheProject($, found))) {
      return verdict
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
