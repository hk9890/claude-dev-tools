import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// Stands for the host: a session in the repository at `root` (none where null), with the given
// environment. Records the toasts and the tool calls that reach the engine.
function host(on: On, root: string | null = '/home/me/repo', env: Record<string, string> = { HOME: '/home/me' }) {
  const seen = { toasts: [] as string[], ran: [] as string[] }

  on('session.repo', () => ({ value: root === null ? null : { root, remote: null, internal: false, name: null } }))
  mock.env(on, env)

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

// An add the guard finds, with no directory named outside the session's repository.
const DENIED = [
  'git worktree add ../feature -b feature',
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
  'W=../x && git worktree add $W',
  'W=/tmp/probe; W=../x; git worktree add --detach $W HEAD',
  '(W=/tmp/probe)\ngit worktree add --detach $W HEAD',
  'git worktree add --detach $W HEAD; W=/tmp/probe',
  'git worktree add --detach $W HEAD\nW=/tmp/probe',
  "cat > x <<'EOF' && /bin/sh x\ngit worktree add ../x\nEOF",
  "ssh host bash <<'EOF'\ngit worktree add ../x\nEOF",
  "bash <<'EOF'\nW=/tmp/probe\nEOF\ngit worktree add --detach $W HEAD",
  "W=/tmp/probe\nbash <<'EOF'\ngit worktree add --detach $W HEAD\nEOF",
  'echo start \\\nW=/tmp/probe\ngit worktree add --detach $W HEAD',
  'echo W=/tmp/probe && git worktree add --detach $W HEAD',
  'W=/tmp/probe true && git worktree add --detach $W HEAD',
  '(W=/tmp/probe); git worktree add --detach $W HEAD',
  'git commit -m "note W=/tmp/probe" && git worktree add --detach $W HEAD',
  'git worktree add .claude/worktrees/feat -b feat > /tmp/wt.log 2>&1',
  'S=/home/me/scratchpad/logs; git worktree add ../repo-feat -b feat > $S/wt.log 2>&1',
  'git worktree add ../x -b b --lock --reason "cache /tmp/ files"',
  'git worktree add ../x -b b # /tmp/',
  'git worktree add ../x -b mktemp-fix',
  'git worktree add ../x -b b < /tmp/in',
]

// An add that names a directory, by `cd` or `-C`, that is in the session's repository at
// /home/me/repo, or that the guard cannot place outside it.
const OWN_REPOSITORY = {
  'an absolute -C': 'git -C /home/me/repo worktree add .claude/worktrees/x',
  'a trailing slash': 'git -C /home/me/repo/ worktree add ../x',
  'a doubled slash': 'git -C /home/me//repo worktree add ../x',
  'a subdirectory': 'cd /home/me/repo/sub && git worktree add ../x',
  '~': 'cd ~/repo && git worktree add ../x',
  'a quoted $HOME': 'git -C "$HOME"/repo worktree add ../x -b b',
  '${HOME}': 'git -C ${HOME}/repo worktree add ../x',
  'a .. part': 'git -C /home/me/other/../repo worktree add ../x -b b',
  'a relative cd': 'cd ../other && git worktree add ../x',
  'a cd to a variable': 'cd $d && git worktree add ../x',
  'a relative -C after an absolute cd': 'cd /home/me/other && git -C sub worktree add ../x',
  'a relative -C after an absolute -C': 'git -C /home/me/other -C ../repo worktree add ../x -b b',
  'an absolute -C after a cd elsewhere': 'cd /home/me/other && git -C /home/me/repo worktree add ../x',
  'a later cd back': 'cd /home/me/other\ncd /home/me/repo && git worktree add ../x',
  'a cd after the add': 'git worktree add ../x; cd /home/me/other',
  'one of two adds': 'cd /home/me/other && git worktree add ../y && git -C /home/me/repo worktree add ../x',
  'a cd inside $(...)': 'X=$(cd /home/me/other && pwd); git worktree add ../x -b b',
  'a cd inside a subshell': '(cd /home/me/other); git worktree add ../x',
  '--git-dir': 'cd /tmp && git --git-dir=/home/me/repo/.git worktree add /home/me/x -b b',
  'a cd in a subshell after another command': '(git fetch -q; cd /home/me/other); git worktree add ../x -b b',
  'a cd in $(...) after another command': 'X=$(git fetch; cd /home/me/other && pwd); git worktree add ../x -b b',
  'a cd in backticks': 'X=`cd /home/me/other && pwd`; git worktree add ../x -b b',
  'a cd in a multi-line subshell': '(\n  cd /home/me/other\n)\ngit worktree add ../x -b b',
  'a cd in a background job': 'cd /home/me/other & git worktree add ../x -b b',
  'a cd in a pipeline': 'cd /home/me/other | true; git worktree add ../x -b b',
  'a cd in quoted text': 'git commit -m "x; cd /home/me/other" && git worktree add ../x -b b',
  'a pushd after the cd': 'cd /home/me/other && pushd /home/me/repo && git worktree add ../x',
  'a cd back between two adds': 'cd /home/me/other && git worktree add ../y -b y; cd /home/me/repo; git worktree add ../x -b x',
  'a cd to a variable that names it': 'R=/home/me/repo; cd $R && git worktree add ../x',
  'a quoted -C with a space': 'git -C "/home/me/repo/my dir" worktree add ../x',
  'a -C of command output': 'git -C "$(git rev-parse --show-toplevel)" worktree add ../x',
  'a -C of an unset variable': 'git -C "$R" worktree add ../x',
  'a -C with a variable inside the path': 'git -C /home/me/$R worktree add ../x -b x',
  'a cd with a variable inside the path': 'cd /home/me/$R && git worktree add ../x -b x',
  'a cd to a variable after $HOME': 'cd "$HOME/$R" && git worktree add ../x -b x',
  'a -C with $(...) inside the path': 'git -C /home/me/$(echo repo) worktree add ../x -b x',
  'a -C with backticks inside the path': 'git -C /home/me/`echo repo` worktree add ../x -b x',
  'a cd with a variable default': 'cd /home/me/${R:-repo} && git worktree add ../x -b x',
}

const ALLOWED = [
  'git worktree list',
  'git worktree remove .claude/worktrees/x',
  'git worktree prune',
  'git worktree add --detach /tmp/probe HEAD',
  'git worktree add --detach "$(mktemp -d)" HEAD',
  'W=/home/me/scratchpad/release && git fetch -q origin && git worktree add -q --detach $W origin/main',
  'W="/tmp/probe dir" && git worktree add --detach "${W}" HEAD',
  'git worktree add --detach $TMPDIR/probe HEAD',
  'git worktree add --detach /tmp/x HEAD > /dev/null 2>&1',
  'echo git; worktree add',
  'grep -n "worktree add" docs/CHANGE-WORKFLOW.md',
  'ls .git/worktrees',
  'git commit -m "use git worktree add here"',
  'gh pr create --body "blocks git worktree add now"',
  PR_BODY_WITH_THE_COMMAND,
  'cat > notes.md <<-"END"\n\tgit worktree add ../x\n\tEND',
  "cat > $S/run.sh <<'EOF'\ngit worktree add -q --detach .claude/worktrees/wt1\nEOF",
  'W=/tmp/probe\ngit worktree add --detach $W HEAD',
  "bash <<'EOF'\nW=/tmp/probe\ngit worktree add --detach $W HEAD\nEOF",
  'S=/home/me/scratchpad/repro; mkdir -p $S\nsetup(){ d=$1; git worktree add --detach $S/$d/wt HEAD; }\nsetup a',
  `D=$(mktemp -d); printf '%s' "Run exactly this: echo 'note: W=/tmp/p && git worktree add ../y'" > $D/p2.txt`,
]

// An add into another repository, which EnterWorktree cannot make.
const OTHER_REPOSITORY = {
  'an absolute -C': 'git -C /home/me/other worktree add /home/me/other/.claude/worktrees/x -b b',
  'a name that shares the prefix': 'git -C /home/me/repo2 worktree add ../x -b b',
  '-C ~': 'git -C ~/dev/werft fetch -q && git -C ~/dev/werft worktree add ~/dev/werft-wt/a -b feat/a origin/main',
  '-C "$HOME/..."': 'git -C "$HOME/other" worktree add ../x',
  '-C through a variable': 'R=/home/me/other; git -C $R worktree add ../x -b b',
  'an absolute cd': 'cd /home/me/other && git fetch -q origin && git worktree add -q -b feat/x .claude/worktrees/x origin/main',
  'cd ~ and ;': 'cd ~/dev/werft; git worktree add ~/dev/werft-wt/b -b feat/b origin/main && cd ~/dev/werft-wt/b',
  'a line continuation': 'cd /home/me/other && \\\n  git worktree add ../x -b b',
  'a quoted -C with a space': 'git -C "/home/me/my repo" worktree add ../x -b b',
  'a cd through a variable': 'R=/home/me/other; cd $R && git worktree add ../x -b b',
}

for (const command of DENIED) {
  test(`denies: ${command}`, async ($, on) => {
    const seen = host(on)

    const answer = await $.tool.call({ tool: 'Bash', command })

    expect(answer.deny).toContain('EnterWorktree')
    expect(seen.ran).toEqual([])
    expect(seen.toasts).toEqual(['use EnterWorktree, not git worktree add'])
  })
}

for (const [shape, command] of Object.entries(OWN_REPOSITORY)) {
  test(`denies an add into the session's repository through ${shape}: ${command}`, async ($, on) => {
    const seen = host(on)

    const answer = await $.tool.call({ tool: 'Bash', command })

    expect(answer.deny).toContain('EnterWorktree')
    expect(seen.ran).toEqual([])
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

for (const [shape, command] of Object.entries(OTHER_REPOSITORY)) {
  test(`allows an add into another repository through ${shape}: ${command}`, async ($, on) => {
    const seen = host(on)

    const answer = await $.tool.call({ tool: 'Bash', command })

    expect(answer.deny).toBeUndefined()
    expect(seen.ran).toEqual(['Bash'])
    expect(seen.toasts).toEqual([])
  })
}

test('denies an add that names no directory where the session has no repository', async ($, on) => {
  const seen = host(on, null)

  const answer = await $.tool.call({ tool: 'Bash', command: 'git worktree add ../x' })

  expect(answer.deny).toContain('EnterWorktree')
  expect(seen.ran).toEqual([])
})

test('allows an add into a named repository where the session has none', async ($, on) => {
  const seen = host(on, null)

  const answer = await $.tool.call({ tool: 'Bash', command: 'git -C /home/me/other worktree add ../x' })

  expect(answer.deny).toBeUndefined()
  expect(seen.ran).toEqual(['Bash'])
})

test('denies an add under ~ where HOME is not set', async ($, on) => {
  const seen = host(on, '/home/me/repo', {})

  const answer = await $.tool.call({ tool: 'Bash', command: 'git -C ~/other worktree add ../x' })

  expect(answer.deny).toContain('EnterWorktree')
  expect(seen.ran).toEqual([])
})

test('denies an add where the session repository cannot be read', async ($, on) => {
  const seen = { ran: [] as string[] }

  on('session.repo', () => {
    throw new Error('no repository service')
  })
  mock.env(on, { HOME: '/home/me' })
  on('ui.toast', () => ({ value: undefined }))
  on('tool.call', ($, e) => {
    seen.ran.push(String(e.tool))

    return { result: 'ok' }
  })

  const answer = await $.tool.call({ tool: 'Bash', command: 'git -C /home/me/other worktree add ../x' })

  expect(answer.deny).toContain('EnterWorktree')
  expect(seen.ran).toEqual([])
})

test('denies an add where the guard fails', async ($, on) => {
  const seen = { ran: [] as string[] }

  on('ui.toast', () => ({ value: undefined }))
  on('tool.call', ($, e) => {
    seen.ran.push(String(e.tool))

    return { result: 'ok' }
  })

  const answer = await $.tool.call({ tool: 'Bash', command: 'git -C /home/me/other worktree add ../x' })

  expect(answer.deny).toContain('EnterWorktree')
  expect(seen.ran).toEqual([])
})

test('names the way out for another repository and for text', async ($, on) => {
  host(on)

  const answer = await $.tool.call({ tool: 'Bash', command: 'git worktree add ../x' })

  expect(answer.deny).toContain('`git -C <repo> worktree add <dir> -b <branch>` is allowed')
  expect(answer.deny).toContain('with the Write tool')
})

// Claude Code's refusals in a worktree-isolated session or agent, one per lead and reason shape.
const WT = '/repo/.claude/worktrees/x'
const REFUSALS = {
  'git in a complex form': `This session is isolated in the worktree ${WT}, but this command names git in a form too complex to verify that it stays inside the worktree. Refusing to run it — a worktree-isolated session's git operations must target its own worktree. Split it into plain, separate commands and run them from ${WT}.`,
  'a heredoc in a chain': `This session is isolated in the worktree ${WT}, but this command is too complex to verify that it stays inside the worktree. Refusing to run it — a worktree-isolated session's git operations must target its own worktree. Split it into plain, separate commands and run them from ${WT}.`,
  'a value computed at runtime': `This session is isolated in the worktree ${WT}, but this command runs sed with a value computed at runtime (the variable F) where an option may stand. Refusing to run it — a worktree-isolated session's git operations must target its own worktree. Run the plain command from ${WT}.`,
  'an isolated agent': `This agent is isolated in the worktree ${WT}, but this command names git in a form too complex to verify that it stays inside the worktree. Refusing to run it — a worktree-isolated agent's git operations must target its own worktree. Split it into plain, separate commands and run them from ${WT}.`,
}

const SHARED_CHECKOUT_REFUSAL = `This session is isolated in the worktree ${WT}, but this command's working directory resolved to the shared checkout (/repo). Refusing to run it there — a worktree-isolated session's commands must run inside its worktree. Re-run the command from ${WT}.`

// Stands for the host in a worktree-isolated session: the engine answers the call with `error`.
function isolatedHost(on: On, error: string, context?: string[]) {
  on('tool.call', () => ({ isError: true, result: error, text: error, context }))
}

for (const [reason, refusal] of Object.entries(REFUSALS)) {
  test(`adds the accepted forms to the refusal for ${reason}`, async ($, on) => {
    isolatedHost(on, refusal, ['earlier note'])

    const answer = await $.tool.call({ tool: 'Bash', command: 'ref=$(git rev-parse HEAD)' })

    expect(answer.text).toBe(refusal)
    expect(answer.context).toHaveLength(2)
    expect(answer.context?.[0]).toBe('earlier note')
    expect(answer.context?.[1]).toContain('`$(...)`')
    expect(answer.context?.[1]).toContain('Write tool')
    expect(answer.context?.[1]).toContain('${PIPESTATUS[...]}')
    expect(answer.context?.[1]).toContain('Bash starts in the worktree')
  })
}

// Here Bash runs in the shared checkout, not the worktree, so no form of the command runs.
test('adds nothing to the refusal for the shared checkout', async ($, on) => {
  isolatedHost(on, SHARED_CHECKOUT_REFUSAL, ['earlier note'])

  const answer = await $.tool.call({ tool: 'Bash', command: 'pwd' })

  expect(answer.context).toEqual(['earlier note'])
})

test('adds nothing to another failed call', async ($, on) => {
  isolatedHost(on, 'Exit code 3\nline1')

  const answer = await $.tool.call({ tool: 'Bash', command: 'bash run.sh' })

  expect(answer.context).toBeUndefined()
})

test('adds nothing to a failed call whose output quotes the refusal after its start', async ($, on) => {
  isolatedHost(on, `Exit code 1\n${REFUSALS['git in a complex form']}`)

  const answer = await $.tool.call({ tool: 'Bash', command: 'grep -r isolated logs' })

  expect(answer.context).toBeUndefined()
})

test('adds nothing to output that only quotes the refusal', async ($, on) => {
  on('tool.call', () => ({ result: REFUSALS['git in a complex form'], text: REFUSALS['git in a complex form'] }))

  const answer = await $.tool.call({ tool: 'Bash', command: 'cat refusal.txt' })

  expect(answer.context).toBeUndefined()
})
