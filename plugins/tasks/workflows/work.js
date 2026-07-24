export const meta = {
  name: 'tasks-work',
  description: 'Run ready taskmgr tasks end to end — implement → verify → record, then verify (never auto-close) the parent epic',
  phases: [
    { title: 'Implement', detail: 'one implementer per task' },
    { title: 'Verify', detail: 'review ∥ test per implemented task' },
    { title: 'Record', detail: 'close on pass, comment otherwise' },
    { title: 'Close', detail: 'verify the epic, post a ready-to-close comment (no auto-close)' },
  ],
}

// args, supplied by the tasks-work skill (which ran taskmgr ready in the main loop):
//   { taskIds: string[], epicId?: string }
// The script owns sequencing and null-handling; every taskmgr read/write happens inside an agent.

// ── Pure helpers ──────────────────────────────────────────────────────────────
// No runtime globals — unit-tested via tests/tasks/script-tests/test-work.js.

// Normalize the incoming `args` value into { taskIds, epicId }.
// Defensive: the runtime may hand `args` over as a JSON *string* rather than a parsed
// object (observed in practice). A string has no `.taskIds`, so reading it directly would
// yield undefined and the whole workflow would no-op while reporting success — so parse a
// string first. This is the regression the test suite pins.
function normalizeArgs(rawArgs) {
  let parsed = rawArgs
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed) } catch { parsed = {} }
  }
  return {
    taskIds: (parsed && parsed.taskIds) || [],
    epicId: (parsed && parsed.epicId) || null,
  }
}

// Bucket the per-task results by the tracker action each one recorded.
function summarizeActions(perTask) {
  const byAction = (a) => perTask.filter((r) => r && r.record && r.record.action === a).map((r) => r.taskId)
  return {
    closed: byAction('closed'),
    left_open: byAction('left-open'),
    inconclusive: byAction('inconclusive'),
    skipped: byAction('skipped'),
  }
}

const IMPL_SCHEMA = {
  type: 'object',
  required: ['taskId', 'status'],
  properties: {
    taskId: { type: 'string' },
    status: { type: 'string', enum: ['implemented', 'blocked', 'unready'] },
    summary: { type: 'string' },
    changedFiles: { type: 'array', items: { type: 'string' } },
    bugsFiled: { type: 'array', items: { type: 'string' } },
  },
}
const REVIEW_SCHEMA = {
  type: 'object',
  required: ['verdict'],
  properties: {
    verdict: { type: 'string', enum: ['ok', 'concerns', 'reject'] },
    summary: { type: 'string' },
    findings: { type: 'array', items: { type: 'string' } },
  },
}
const TEST_SCHEMA = {
  type: 'object',
  required: ['pass'],
  properties: {
    pass: { type: 'boolean' },
    evidence: { type: 'string' },
    bugsFiled: { type: 'array', items: { type: 'string' } },
  },
}
const RECORD_SCHEMA = {
  type: 'object',
  required: ['taskId', 'action'],
  properties: {
    taskId: { type: 'string' },
    action: { type: 'string', enum: ['closed', 'left-open', 'inconclusive'] },
    reason: { type: 'string' },
  },
}
const EPIC_SCHEMA = {
  type: 'object',
  required: ['epicId', 'allChildrenClosed', 'action'],
  properties: {
    epicId: { type: 'string' },
    allChildrenClosed: { type: 'boolean' },
    action: { type: 'string', enum: ['verified-ready-to-close', 'blocked', 'criteria-failed'] },
    comment: { type: 'string' },
  },
}

const implementPrompt = (id) =>
  `Implement taskmgr task ${id} as one unit of an execution run. Follow your implementer instructions: run the readiness gate first; if the ticket is not executable, comment the gaps and report status "unready" (do NOT claim or write code). If ready, claim it (\`taskmgr update ${id} --status in_progress\`), implement the simplest change that satisfies the acceptance criteria, run the project's relevant tests, and file a bug directly for any unrelated defect you find. Do NOT close the task. Report status "implemented" (ready to verify) or "blocked" (with the reason in summary), a short summary of what changed, the list of files you touched in changedFiles, and any bug ids filed.`

const reviewPrompt = (id, impl) => {
  const files = (impl && impl.changedFiles && impl.changedFiles.length) ? impl.changedFiles.join(' ') : ''
  const diffCmd = files ? `git diff -- ${files}` : 'git diff'
  return `Review the implementation just made for taskmgr task ${id}. Run \`taskmgr show ${id}\` for intent and inspect ONLY this task's change with \`${diffCmd}\`${files ? ' (tasks run sequentially against a shared tree that may also hold earlier uncommitted edits — judge only the files this task changed)' : ''}. You are READ-ONLY: do not edit code and do not write the tracker. Return a verdict: "ok" (no blocking concern), "concerns" (real but non-blocking issues), or "reject" (a blocking correctness or design flaw that should stop closure), with a one-line summary and any findings. Implementation summary: ${JSON.stringify(impl && impl.summary)}.`
}

const testPrompt = (id, impl) =>
  `Verify taskmgr task ${id} against its acceptance criteria by EXECUTING — run the project's tests/commands and trigger the behavior; do not infer from reading code. REPORT ONLY in this run: do NOT close the task (the workflow records the decision). File a bug directly for any failing criterion or unrelated breakage. Return pass=true only if every acceptance criterion was executed and passed; otherwise pass=false with evidence and any bug ids filed. Implementation summary: ${JSON.stringify(impl && impl.summary)}.`

const recordPrompt = (id, review, test) =>
  `Record the outcome for taskmgr task ${id}. You are RECORDING a decision, NOT verifying: do not run tests, re-read code, or file bugs — decide solely from the TEST and REVIEW JSON below. Apply exactly one tracker action, evaluating these rules IN ORDER (first match wins):\n` +
  `1. If EITHER leg is null/missing (an agent did not complete) → leave OPEN, \`taskmgr comment add ${id} "verification incomplete: <which stage did not complete>"\`, report action "inconclusive". Do NOT close.\n` +
  `2. Otherwise if TEST.pass is not true, OR REVIEW.verdict === "reject" → leave OPEN, \`taskmgr comment add ${id} "<why: failing criterion or blocking finding; any bug ids the test leg already filed>"\`, report action "left-open".\n` +
  `3. Otherwise (TEST.pass === true AND REVIEW.verdict !== "reject") → close it: \`taskmgr close ${id} --reason "verified: <how>; review: <verdict>"\`, report action "closed".\n` +
  `TEST result: ${JSON.stringify(test)}\nREVIEW result: ${JSON.stringify(review)}`

const epicClosePrompt = (id) =>
  `Epic-closure verification for taskmgr epic ${id}. taskmgr does NOT gate closure, so verify ordering yourself and NEVER close the epic — a human closes it.\n` +
  `1. Run \`taskmgr show ${id}\` to confirm ${id} resolves to a real epic. If it does not exist or is not an epic, report allChildrenClosed=false, action "blocked", and STOP — an empty child list from a wrong/typo'd id is NOT "all children closed".\n` +
  `2. Run \`taskmgr list -q 'parent == "${id}" && status != "closed"' --json\`. If it errors or returns a non-empty list, \`taskmgr comment add ${id}\` naming the still-open children, and STOP: report allChildrenClosed=false, action "blocked".\n` +
  `3. Only if the query succeeded AND returned empty: independently confirm the epic's own success criteria are met (not merely that children closed) and run project verification (build/tests/lint as the project defines).\n` +
  `4. Write the per-criterion verdict and evidence as a comment: \`taskmgr comment add ${id} "Acceptance review: <criterion> PASS — <evidence>; … Children all closed. Ready to close."\`\n` +
  `5. Do NOT close the epic. Report allChildrenClosed=true and action "verified-ready-to-close", or "criteria-failed" (comment the gaps and file bugs) if the success criteria are not met.`

// The review leg prefers project-review's adversarial reviewer persona, but `tasks` does not declare
// `project-review` as a dependency, so that agent type is not guaranteed to exist. When it is absent,
// agent() THROWS on the unknown agentType; without this fallback that throw becomes a null review and
// record rule 1 ("either leg null → inconclusive") strands every passing task as unclosed. The review
// procedure lives in reviewPrompt, not the persona, so a built-in agent runs it fine. The fallback is
// surfaced to the caller via summary.reviewer_fallback so the user knows a weaker reviewer judged
// closure.
let reviewerFallback = false
async function runReview(id, impl) {
  const base = { phase: 'Verify', label: `review:${id}`, schema: REVIEW_SCHEMA }
  try {
    // Fall back ONLY on the throw. agent() throws on an unknown agentType (verified: it does not
    // return null), so the catch fires only when project-review is absent. A null returned here
    // means a present-but-incomplete reviewer (skipped/died) — let it propagate so record rule 1
    // leaves the task open (fail-safe), instead of silently re-running on a weaker built-in reviewer
    // whose verdict could drive closure via rule 3.
    return await agent(reviewPrompt(id, impl), { ...base, agentType: 'project-review:project-reviewer' })
  } catch {
    // project-review:project-reviewer not installed (unknown agentType) — fall back to a built-in.
    reviewerFallback = true
    return agent(reviewPrompt(id, impl), { ...base, agentType: 'general-purpose' })
  }
}

async function runTask(id) {
  const impl = await agent(implementPrompt(id), { agentType: 'tasks:implementer', phase: 'Implement', label: `impl:${id}`, schema: IMPL_SCHEMA })
  if (!impl) {
    // dead/timed-out implementer — nothing ran, decision never recorded.
    return { taskId: id, impl: null, record: { taskId: id, action: 'inconclusive', reason: 'implementer did not complete' } }
  }
  if (impl.status !== 'implemented') {
    // unready (readiness gate refused — nothing ran) or blocked (claimed but could not finish;
    // partial edits and filed bugs are possible) — either way there is no completed change to verify.
    return { taskId: id, impl, record: { taskId: id, action: 'skipped', reason: impl.status } }
  }
  const [review, test] = await parallel([
    () => runReview(id, impl),
    () => agent(testPrompt(id, impl), { agentType: 'tasks:verifier', phase: 'Verify', label: `test:${id}`, schema: TEST_SCHEMA }),
  ])
  let record = await agent(recordPrompt(id, review, test), { agentType: 'tasks:verifier', phase: 'Record', label: `record:${id}`, schema: RECORD_SCHEMA })
  if (!record) record = { taskId: id, action: 'inconclusive', reason: 'record agent did not complete' }
  return { taskId: id, impl, review, test, record }
}

// Expose the pure helpers to any module loader (the Node unit tests in
// tests/tasks/script-tests use this). Assigned before the orchestration below so it is
// reached whichever path that takes.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeArgs, summarizeActions }
}

// ── Orchestration ─────────────────────────────────────────────────────────────
// Runs only under the Workflow runtime, which injects the `agent` hook (plus args/log/
// parallel/phase). Without that hook the runtime contract is broken, so we throw rather
// than silently no-op (see the else).
if (typeof agent === 'function') {
  const { taskIds, epicId } = normalizeArgs(args)

  if (!taskIds.length) {
    // A bail-out return surfaces to the harness as status:completed, so a total no-op otherwise
    // looks like success — log and echo what we received so it is diagnosable instead of silently
    // passing.
    log(`tasks-work: no taskIds resolved from args (received type "${typeof args}") — nothing to run`)
    return {
      error: 'No taskIds provided. The tasks-work skill must resolve the scope and pass taskIds.',
      received: { type: typeof args },
    }
  }

  phase('Implement')
  log(`Running ${taskIds.length} task(s) sequentially${epicId ? ` under epic ${epicId}` : ''}`)
  // Sequential by design: implementers share ONE working tree, and taskmgr's lock protects only the
  // tracker (.tasks/), not project source files. Running them in parallel would let two implementers
  // clobber each other's edits and make the verify legs observe a commingled tree. So one task's
  // implement → verify → record completes before the next starts. (review ∥ test still run in parallel
  // WITHIN a task, after that task's implementer has finished — see runTask.)
  const perTask = []
  for (const id of taskIds) {
    perTask.push(await runTask(id))
  }

  let epic = null
  if (epicId) {
    phase('Close')
    epic = await agent(epicClosePrompt(epicId), { agentType: 'tasks:verifier', phase: 'Close', label: `epic:${epicId}`, schema: EPIC_SCHEMA })
  }

  const { closed, left_open, inconclusive, skipped } = summarizeActions(perTask)

  return {
    summary: { total: taskIds.length, closed: closed.length, left_open: left_open.length, inconclusive: inconclusive.length, skipped: skipped.length, reviewer_fallback: reviewerFallback, epic: epic ? epic.action : 'n/a' },
    closed,
    left_open,
    inconclusive,
    skipped,
    epic,
    perTask,
  }
} else {
  // No `agent` hook: the Workflow runtime failed to inject it. Fail LOUD — returning
  // undefined here would be recorded by the harness as status:completed, i.e. a silent
  // no-op.
  throw new Error('tasks-work: the Workflow runtime did not inject the `agent` hook')
}
