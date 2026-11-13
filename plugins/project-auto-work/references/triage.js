export const meta = {
  name: 'auto-work-triage',
  description: 'Act on a planned project-auto-work audit: fix settled survivors as PRs, match the items no key matched to earlier items, write the taskmgr bodies for the rest',
  phases: [
    { title: 'Fix', detail: 'one agent per planned fix: worktree, test, proving check, PR' },
    { title: 'Match', detail: 'one agent: match the items no key matched to earlier items by meaning' },
    { title: 'Bodies', detail: 'one agent per item to file, plus each failed fix of an item no earlier run filed' },
  ],
}

// args: { repoRoot, scratchDir, planDir, tool, serial, fixes: [n], filed: [n], bodies: [n], match: [n], design: [n], earlier: {id: design} } — printed by
// bin/triage-plan.py. Each n names <planDir>/item-<n>.json.

// ---------------------------------------------------------------------------
// Pure helpers — unit-tested via tests/project-auto-work/script-tests/test-triage.js.
// ---------------------------------------------------------------------------

// The runtime may hand `args` over as a JSON string rather than a parsed object.
function normalizeArgs(rawArgs) {
  let parsed = rawArgs
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed) } catch { parsed = {} }
  }
  parsed = parsed || {}
  const repoRoot = String(parsed.repoRoot || '')
  const scratchDir = String(parsed.scratchDir || '')
  const planDir = String(parsed.planDir || '')
  const tool = String(parsed.tool || '')
  const numbers = v => (Array.isArray(v) ? v : []).map(Number).filter(n => Number.isInteger(n) && n > 0)
  const fixes = numbers(parsed.fixes)
  const bodies = numbers(parsed.bodies)
  const filed = numbers(parsed.filed)
  const match = numbers(parsed.match)
  const design = numbers(parsed.design)
  // id -> whether the earlier item is a design doc
  const earlier = parsed.earlier && typeof parsed.earlier === 'object' && !Array.isArray(parsed.earlier) ? parsed.earlier : {}
  // Each fix runs the whole suite twice. Run fixes side by side only where the audit proved
  // two suite runs do not interfere.
  const serial = parsed.serial !== false

  // Each path is interpolated into git and shell commands: an unsubstituted "<…>"
  // placeholder or a relative path would put worktrees and bodies inside the audited repo.
  let error = null
  const relative = Object.entries({ repoRoot, scratchDir, planDir }).find(([, v]) => !v.startsWith('/'))
  if (relative) error = `${relative[0]} must be an absolute path (got ${JSON.stringify(relative[1])})`
  else if (!['test-tests', 'test-app'].includes(tool)) error = `tool must be test-tests or test-app (got ${JSON.stringify(tool)})`
  else if (tool === 'test-app' && fixes.length) error = 'test-app items are never fixed unattended, but fixes is not empty'

  return { repoRoot, scratchDir, planDir, tool, serial, fixes, filed, bodies, match, design, earlier, receivedKeys: Object.keys(parsed), error }
}

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['pr', 'failed'] },
    url: { type: 'string' },
    branch: { type: 'string' },
    reason: { type: 'string' },
  },
  required: ['status'],
}

const BODY_SCHEMA = {
  type: 'object',
  properties: { title: { type: 'string' } },
  required: ['title'],
}

const MATCH_SCHEMA = {
  type: 'object',
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: { n: { type: 'integer' }, id: { type: 'string' } },
        required: ['n', 'id'],
      },
    },
  },
  required: ['matches'],
}

// An audit names a finding in new words on each run, so a key built from those words
// misses an item an earlier run filed. One agent compares meaning instead.
function matchPrompt(cfg) {
  return (
    `You stop a ${cfg.tool} audit from filing a second copy of an issue an earlier run filed. You change nothing.\n\n` +
    `New items: ${cfg.match.map(n => `${cfg.planDir}/item-${n}.json`).join(', ')}. Each holds its finding or question, its proposals, ` +
    `its kind and its tier.\n` +
    `Earlier items: ${cfg.planDir}/earlier.json (id, title, type, design), all filed by earlier runs of this tool on this path. ` +
    `Read an earlier item's body with taskmgr show <id> -C ${cfg.repoRoot} where its title alone does not settle it.\n\n` +
    `A new item matches an earlier item only where both hold:\n` +
    `- both are design items (new kind "design" or tier 3, earlier design true), or neither is: a design question and the fix of the finding it names are two items;\n` +
    `- both are the same problem: the same wrong behaviour at the same place, or the same open decision. ` +
    `Two symptoms in one area are two problems. Words, order of words and severity may differ.\n` +
    `Where you are not sure, it is not a match: a wrong match hides a new problem, a missed one only files a copy. ` +
    `Two new items never match one earlier item.\n\n` +
    `Return matches: one {n, id} for each new item that matches, with n the item's number; leave out the rest.`
  )
}

// The match agent's answer is checked, not trusted: a pair counts only where the item was
// sent to it, the id is an earlier item of the same design side, and no other item claims
// that id. An item left unpaired is filed.
function acceptMatches(cfg, found) {
  const pairs = ((found && found.matches) || []).map(m => ({ n: Number(m.n), id: String(m.id) }))
    .filter(m => cfg.match.includes(m.n) && Object.hasOwn(cfg.earlier, m.id) &&cfg.earlier[m.id] === cfg.design.includes(m.n))
  const claims = id => new Set(pairs.filter(m => m.id === id).map(m => m.n)).size
  const byN = new Map()
  for (const m of pairs) if (claims(m.id) === 1 && !byN.has(m.n)) byN.set(m.n, m)
  return [...byN.values()]
}

function fixPrompt(cfg, n) {
  const item = `${cfg.planDir}/item-${n}.json`
  const wt = `${cfg.scratchDir}/fix-${n}`
  return (
    `You fix one weakness a test-suite audit proved, and open a pull request for it. Nobody watches this run.\n\n` +
    `Read ${item}. It holds the finding, its one settled proposal, the surviving mutant (mutant.diff, mutant.file, mutant.line), ` +
    `the dedup key and label, and context: repoRoot, test_cmd, worktree_setup, audited_head, pr_base.\n` +
    `The mutant SURVIVED: the suite stayed green with it applied. Your test must make the suite fail on it.\n\n` +
    `STEPS — stop at the first that fails, and go to CLEANUP:\n` +
    `1. Branch name: auto-work/<the dedup label without "dedup:">-<the first 7 characters of audited_head>. It exists on origin only: ` +
    `git -C ${cfg.repoRoot} worktree add --detach ${wt} <audited_head>\n` +
    `2. cd ${wt}; replay worktree_setup verbatim where it is not empty, adjusting only the worktree path.\n` +
    `3. Write the test the proposal names, following the conventions of the tests next to it. Rules: change test code only, never production code; ` +
    `never skip, disable, quarantine, delete or exclude a test. Stage only your test file (git add <file>), then check ` +
    `git diff --cached --numstat <audited_head>: exactly 1 file, at most 50 added lines.\n` +
    `4. Proving check, each run wrapped in timeout 590:\n` +
    `   a. Apply the mutant to mutant.file: git apply mutant.diff where it applies as a patch, else make the same edit by hand at ` +
    `mutant.line, as mutant.diff and mutant.stated_behavior_change describe. Run test_cmd: it MUST fail, and fail in your new test.\n` +
    `   b. Undo the mutant (git checkout -- <mutant.file>; you changed no production file). Run test_cmd: it MUST pass.\n` +
    `   Remove what worktree_setup added (links, copied files). git status must then show only your test file.\n` +
    `5. Commit only your test file, in the project's commit style (read its contributing or change-workflow doc if it has one). ` +
    `git push origin HEAD:refs/heads/<branch>. Never force it: a rejected push is a failure, and the branch on origin is not yours.\n` +
    `6. gh label create source:project-auto-work --force; then gh pr create --base <pr_base> --head <branch> --label source:project-auto-work, ` +
    `with a title and a body that states the finding, the mutant diff, and both proving-check results, and ends with the exact line\n` +
    `   dedup-key: <the item's key>\n` +
    `   Where the item has "related" ids, name them in the body as earlier closed tasks this one regresses.\n` +
    `   Never merge the PR, never push to <pr_base>, never request or run a review.\n\n` +
    `CLEANUP, always: git -C ${cfg.repoRoot} worktree remove --force ${wt}, then git -C ${cfg.repoRoot} worktree prune. ` +
    `Where your step-5 push succeeded and step 6 opened no PR, also delete the branch on origin (git push origin --delete <branch>).\n\n` +
    `Return status "pr" with url and branch, or status "failed" with reason: the step that failed and what it printed.`
  )
}

function bodyPrompt(cfg, n, failedFix) {
  const item = `${cfg.planDir}/item-${n}.json`
  const body = `${cfg.planDir}/body-${n}.md`
  return (
    `You write one taskmgr issue body from a ${cfg.tool} audit item. A script files it; you run no taskmgr command.\n\n` +
    `Read ${item}: its finding or question (and more_findings, where findings share the item), its proposals (decision, action, rationale, and for open ones question, options, recommendation), ` +
    `its type, tier, reason, key and context. Read the code it names where that makes the body concrete.\n` +
    (failedFix ? `An unattended fix was attempted and failed: ${failedFix}. Say so in the body, so the next person does not repeat it.\n` : '') +
    `\nWrite the body to ${body}. Write for a reader with no access to the audit: name paths, symbols and commands, and paste the evidence verbatim.\n` +
    `- type "doc" (a design question): headings ## Context, ## Options (each option with its cost), ## Recommendation ` +
    `(the report's recommendation, or "No recommendation in the report.").\n` +
    `- any other type: exactly the headings ## Context, ## Problem, ## Recommended action, ## Acceptance criteria. ` +
    `Acceptance criteria are a "- [ ]" list, each item runnable by someone who was not there — for a surviving mutant: ` +
    `"with this diff applied, <test_cmd> fails". For an open proposal, the Recommended action is the decision to make and its options.\n` +
    `End ## Context with the exact line\n  dedup-key: <the item's key>\n` +
    `\nReturn the issue title: under 80 characters, naming the place and the weakness.`
  )
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeArgs, fixPrompt, bodyPrompt, matchPrompt, acceptMatches, FIX_SCHEMA, BODY_SCHEMA, MATCH_SCHEMA }
}

// ---------------------------------------------------------------------------
// Orchestration — runs only under the Workflow runtime, which injects `agent`.
// ---------------------------------------------------------------------------

if (typeof agent === 'function') {
  const cfg = normalizeArgs(args)
  if (cfg.error) {
    log(`auto-work-triage: ${cfg.error} (keys: ${cfg.receivedKeys.join(', ') || 'none'})`)
    return { error: cfg.error, got: { type: typeof args, keys: cfg.receivedKeys } }
  }

  const writeBody = (n, failedFix) =>
    agent(bodyPrompt(cfg, n, failedFix), { label: `body:${n}`, phase: 'Bodies', schema: BODY_SCHEMA })
      .then(r => (r ? { n, title: r.title } : null))

  // A failed fix is filed instead, so its body is written as soon as the fix returns — unless
  // an earlier run filed the item, which then gets a comment from triage-file.py.
  const fixOne = n => agent(fixPrompt(cfg, n), { label: `fix:${n}`, phase: 'Fix', schema: FIX_SCHEMA })
  const afterFix = async (fix, n) => {
    const outcome = { n, ...(fix || { status: 'failed', reason: 'the fix agent returned nothing' }) }
    const body = outcome.status === 'pr' || cfg.filed.includes(n) ? null : await writeBody(n, outcome.reason)
    return { fix: outcome, body }
  }
  const fixInTurn = async () => {
    const out = []
    for (const n of cfg.fixes) out.push(await afterFix(await fixOne(n), n))
    return out
  }
  const fixRuns = cfg.serial ? fixInTurn() : pipeline(cfg.fixes, fixOne, afterFix)

  // A matched item gets a comment from triage-file.py, not a body. A match agent that dies
  // or throws matches nothing, so every item is still filed.
  const matchThenBodies = async () => {
    const found = cfg.match.length
      ? await agent(matchPrompt(cfg), { label: 'match', phase: 'Match', schema: MATCH_SCHEMA }).catch(() => null)
      : null
    const matches = acceptMatches(cfg, found)
    const matched = new Set(matches.map(m => m.n))
    const bodies = await parallel(cfg.bodies.filter(n => !matched.has(n)).map(n => () => writeBody(n)))
    return { matches, bodies }
  }
  const [fixed, filing] = await Promise.all([fixRuns, matchThenBodies()])

  const done = fixed.filter(Boolean)
  return {
    fixes: done.map(r => r.fix),
    bodies: [...filing.bodies, ...done.map(r => r.body)].filter(Boolean),
    matches: filing.matches,
  }
} else {
  throw new Error('auto-work-triage: the Workflow runtime did not inject the `agent` hook')
}
