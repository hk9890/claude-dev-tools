import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// Stands for the host: records the toasts and the tool calls that reach the engine.
function host(on: On) {
  const seen = { toasts: [] as string[], ran: [] as string[] }

  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)

    return { value: undefined }
  })
  on('tool.call', ($, e) => {
    seen.ran.push(String(e.tool))

    return { result: 'ok' }
  })

  return seen
}

const PR_BODY_WITH_THE_COMMAND = [
  'gh pr create --title "Guard notes" --body-file - <<\'EOF\'',
  'The guard refuses this line:',
  'git worktree add ../feature feat/x',
  'EOF',
].join('\n')

const DENIED = [
  'git worktree add ../feature -b feature',
  'git -C /home/me/repo worktree add .claude/worktrees/x',
  'cd repo && git worktree add ../x',
  'git worktree add',
  'git worktree add ../x && ls /tmp/',
  'git worktree add ../x\nls /tmp/',
  'git worktree add ../x-scratchpad-feature',
  'echo start\ngit worktree add ../x',
  'result=$(git worktree add ../x)',
  'git -c core.x=y --no-pager worktree add ../x',
  'git worktree add --detach /tmp/probe HEAD; git worktree add ../x',
  "bash <<'EOF'\ngit worktree add ../x\nEOF",
  'cat <<EOF | sh\ngit worktree add ../x\nEOF',
  "cat <<'EOF'\nsome text\nEOF\ngit worktree add ../x",
  'echo $((1 << n))\ngit worktree add ../x',
  'cat <<< EOF\ngit worktree add ../x\nEOF',
]

const ALLOWED = [
  'git worktree list',
  'git worktree remove .claude/worktrees/x',
  'git worktree prune',
  'git worktree add --detach /tmp/probe HEAD',
  'git worktree add --detach "$(mktemp -d)" HEAD',
  'echo git; worktree add',
  'grep -n "worktree add" docs/CHANGE-WORKFLOW.md',
  'ls .git/worktrees',
  'git commit -m "use git worktree add here"',
  'gh pr create --body "blocks git worktree add now"',
  PR_BODY_WITH_THE_COMMAND,
  'cat > notes.md <<-"END"\n\tgit worktree add ../x\n\tEND',
]

for (const command of DENIED) {
  test(`denies: ${command}`, async ($, on) => {
    const seen = host(on)

    const answer = await $.tool.call({ tool: 'Bash', command })

    expect(answer.deny).toContain('EnterWorktree')
    expect(seen.ran).toEqual([])
    expect(seen.toasts).toEqual(['use EnterWorktree, not git worktree add'])
  })
}

for (const command of ALLOWED) {
  test(`allows: ${command}`, async ($, on) => {
    const seen = host(on)

    const answer = await $.tool.call({ tool: 'Bash', command })

    expect(answer.deny).toBeUndefined()
    expect(seen.ran).toEqual(['Bash'])
    expect(seen.toasts).toEqual([])
  })
}

