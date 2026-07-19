export const meta = {
  name: 'project-review-codebase',
  description: 'Read-only codebase review: consistency + structure + architecture dimension agents → cross-dimension synthesis',
  whenToUse: 'Launched by the /project-review-codebase skill. Reviews a codebase for internal consistency, physical layout, and module architecture; dedupes findings across dimensions.',
  phases: [
    { title: 'Review', detail: 'one adversarial agent per dimension' },
    { title: 'Verify', detail: 'adversarially refute each finding (ultra only)' },
    { title: 'Synthesis', detail: 'dedupe + cross-dimension reconciliation + report' },
  ],
}

// args: { repoRoot, scope?, vocabFile?, ultra? }
// Robust to args arriving as either a parsed object or a JSON-encoded string.
let A = args
if (typeof A === 'string') { try { A = JSON.parse(A) } catch (e) { A = {} } }
A = A || {}
const repoRoot = A.repoRoot
const scope = A.scope || ''
const vocabFile = A.vocabFile || ''
const ultra = !!A.ultra

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const VERDICTS = ['clean', 'minor issues', 'significant issues', 'broken']

const DIMENSION_SCHEMA = {
  type: 'object',
  properties: {
    dimension: { type: 'string' },
    verdict: { type: 'string', enum: VERDICTS },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          location: { type: 'string' },
          observation: { type: 'string' },
          evidence: { type: 'string' },
          why_it_matters: { type: 'string' },
          recommended_action: { type: 'string' },
        },
        required: ['severity', 'location', 'observation', 'evidence', 'recommended_action'],
      },
    },
  },
  required: ['dimension', 'verdict', 'findings'],
}

// Same shape and refutation prompt as review-docs.js — kept in lockstep by hand;
// workflow scripts are self-contained and cannot import shared modules.
const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    refuted: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['refuted'],
}

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: VERDICTS },
    dimension_verdicts: {
      type: 'object',
      properties: {
        consistency: { type: 'string', enum: VERDICTS },
        structure: { type: 'string', enum: VERDICTS },
        architecture: { type: 'string', enum: VERDICTS },
      },
      required: ['consistency', 'structure', 'architecture'],
    },
    headline: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          dimension: { type: 'string', enum: ['consistency', 'structure', 'architecture'] },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          location: { type: 'string' },
          observation: { type: 'string' },
          why_it_matters: { type: 'string' },
          recommended_action: { type: 'string' },
        },
        required: ['dimension', 'severity', 'location', 'observation', 'why_it_matters', 'recommended_action'],
      },
    },
    recommended_actions: { type: 'array', items: { type: 'string' } },
    cross_dimension_notes: { type: 'string' },
  },
  required: ['verdict', 'dimension_verdicts', 'headline', 'findings', 'recommended_actions'],
}

// ---------------------------------------------------------------------------
// Shared persona — the adversarial attitude every dimension agent carries
// (distilled from the project-reviewer agent; that agent's markdown output
// skeleton is replaced here by the structured schemas).
// ---------------------------------------------------------------------------

const PERSONA =
  `You are an adversarial code reviewer. Default posture: skepticism — find what is wrong first; ` +
  `"clean" must be earned by a genuine attempt to break the thing.\n` +
  // The read-only contract sentence is kept verbatim-identical to project-reviewer.md's and on ONE
  // line so tests/project-review/script-tests/test-readonly-contract.sh can pin it against drift.
  // Edit both copies together or that test fails.
  `HARD READ-ONLY CONTRACT: you are in the user's live repository. Never create, edit, move, rename, or delete anything, and never change git state (no commit, branch, tag, stash, checkout, push); read-only inspection — reading, grep, git log/diff, running the test suite, walking the tree — is fine, but mutating the project is not.\n` +
  `SCOPE YOUR WALK TO WHAT GIT TRACKS: discover files with \`git ls-files\` rather than a raw \`find\`/\`ls -R\`, and ` +
  `ignore the .git directory, untracked build output (dist/, node_modules/), and any nested git worktree ` +
  `(commonly under .git/ or .claude/worktrees/ — check \`git worktree list\`). A nested second checkout otherwise ` +
  `surfaces phantom duplicate hits in recursive grep and makes "which copy is authoritative" ambiguous; a file's ` +
  `absence from \`git ls-files\` is itself evidence (untracked/orphaned), not a reason to walk the untracked tree.\n` +
  `Explore before you judge: read AGENTS.md and the docs it routes to before forming any view. If docs/REVIEWING.md ` +
  `exists or AGENTS.md routes to project-specific review guidance, its rules are authoritative local constraints — ` +
  `where they conflict with your generic lens, the local rule wins; review against it and say so.\n` +
  `Commit to a recommended answer on every question the procedure raises; "it depends" is not allowed.\n` +
  `Evidence bar: cite exact paths and line numbers; report only what the evidence supports; mark a finding you could ` +
  `not fully prove as plausible inside its observation. Return an empty findings array if the dimension is genuinely ` +
  `clean — do not invent problems.`

const scopeLine = scope
  ? `Scope of this review (from the user): ${scope}. Confine findings to it.`
  : `Scope: the whole codebase — walk the tree.`

// ---------------------------------------------------------------------------
// Dimension procedures
// ---------------------------------------------------------------------------

const CONSISTENCY_PROCEDURE =
  `Dimension: CONSISTENCY — does the codebase agree with itself?\n\n` +
  `Work through these checks in sequence:\n` +
  `1. COMPETING IMPLEMENTATIONS for one concern — two or more libraries, classes, or modules doing the same job ` +
  `(two HTTP clients, two config loaders, two error-handling chains, two logging setups, two auth strategies). ` +
  `Name both and where each is used; state which should win (documented convention, dominant usage, or better test ` +
  `coverage) and what eliminating the minority one would take.\n` +
  `2. NAMING CONVENTION DIVERGENCE — the same category of thing named differently (getUser / fetch_account / ` +
  `loadProfile), mixed constant styles. List the variants and their files; state the dominant pattern; check whether ` +
  `a documented convention exists.\n` +
  `3. INCONSISTENT API/FUNCTION SHAPES ACROSS SIBLINGS — analogous functions, methods, or handlers with different ` +
  `signatures, parameter orders, return shapes, or error contracts. Show the divergent shapes side by side; the most ` +
  `common or most documented shape is the template; say whether the difference is essential or historical accident.\n` +
  `4. IMPORT AND MODULE CONVENTION DRIFT — default vs named exports, barrel re-exports vs direct imports, absolute ` +
  `vs relative paths, import ordering. Identify files that break the dominant pattern and whether the deviation is intentional.\n` +
  `5. FILE-NAMING AND CASING DRIFT — kebab-case vs PascalCase vs snake_case, especially within one directory. ` +
  `List deviations from the dominant casing.\n` +
  `6. DOCUMENTED-BUT-IGNORED STANDARD — read AGENTS.md, CODING.md, and any RULES.md for explicit standards; find code ` +
  `that demonstrably ignores them. Cite the documented rule and the code that ignores it. Whether to fix the code or ` +
  `change the standard is the user's policy decision — surface the conflict, do not presume either. If the standard ` +
  `itself looks stale (describes a convention the project clearly moved past), say the finding belongs to the docs review.\n\n` +
  `BASELINE RULE: a documented convention (AGENTS.md, CODING.md, RULES.md) is authoritative — deviations from it are ` +
  `violations regardless of how many files deviate. With no documented convention, the dominant pattern is the de facto ` +
  `standard; flag minority deviations. Never recommend "fixing" the majority to match a documented-but-ignored standard ` +
  `without surfacing the conflict as a policy decision.\n\n` +
  `NOT THIS DIMENSION: pure formatting (whitespace, brackets — linter territory); whether the shared pattern is the ` +
  `right design (architecture dimension); where files live (structure dimension).`

const STRUCTURE_PROCEDURE =
  `Dimension: STRUCTURE — is the physical layout sane?\n\n` +
  `Work through these checks in sequence:\n` +
  `1. TREE VS SELF-DESCRIPTION — read AGENTS.md, README, and docs/, then walk the tree. Does every directory and ` +
  `file correspond to something the project's own documentation claims should exist, and is every documented component ` +
  `present at its documented path? Flag undocumented directories, phantom documented components, and paths that exist ` +
  `at the wrong location.\n` +
  `2. FILES IN THE RIGHT DIRECTORIES — source files in test directories, test files alongside production code, ` +
  `configuration buried inside implementation modules, scripts mixed with library code, documentation scattered ` +
  `outside docs/. A reader must be able to predict any artifact's location from directory names alone.\n` +
  `3. DEAD OR ORPHANED FILES — files nothing imports, executes, or references; tests covering modules that no longer ` +
  `exist; configuration for build steps that were deleted; documentation for removed features; backup or experimental ` +
  `leftovers (foo.bak, foo_old.py).\n\n` +
  `Recommended action per finding: exactly one of move, delete, rename, or document.\n\n` +
  `NOT THIS DIMENSION: module granularity and layering (architecture dimension); naming and casing conventions ` +
  `(consistency dimension).`

const ARCHITECTURE_PROCEDURE =
  `Dimension: ARCHITECTURE — are the module boundaries earning their keep?\n\n` +
  (vocabFile
    ? `First read the design vocabulary at ${vocabFile} and use its terms (module, interface, depth, seam, adapter, ` +
      `leverage, locality) precisely in findings.\n\n`
    : '') +
  `Work through these checks in sequence:\n` +
  `1. SHALLOW / PASS-THROUGH MODULES — interfaces as large as their implementation: wrappers that forward calls, ` +
  `layers that add no behaviour. Apply the deletion test: if the module were removed, would its complexity scatter ` +
  `across N callers (it earns its place) or simply vanish (it was forwarding — flag it)?\n` +
  `2. UNJUSTIFIED SEAMS — interfaces, abstract bases, or adapter layers with exactly one implementation and no ` +
  `concrete second one in sight. One adapter signals hypothetical variation; recommend collapsing the seam unless ` +
  `there is evidence of real variation (a test double counts only when it genuinely substitutes at that seam).\n` +
  `3. MISSING SEAMS / TESTABILITY — modules that instantiate their dependencies internally instead of receiving ` +
  `them, apply side effects instead of returning results, or can only be tested by reaching past their interface. ` +
  `The interface is the test boundary; tests importing a module's internals are evidence of a missing or misplaced seam.\n` +
  `4. LAYERING VIOLATIONS — imports reaching into a sibling module's internals rather than its public interface; ` +
  `cross-layer imports in the wrong direction. Map the intended layers from the docs and tree first, then find violations.\n` +
  `5. MODULE GRANULARITY — god-files owning far more responsibility than their directory implies ("utils" ` +
  `accumulators, entry points that do everything), or one logical unit fragmented across many tiny files that are ` +
  `always imported together and have no assembly point. Recommended action: split or merge.\n\n` +
  `NOT THIS DIMENSION: naming (consistency dimension); physical placement (structure dimension). This is an audit — ` +
  `the user challenges an individual design decision interactively with challenge:kiss, not here.`

const DIMENSIONS = [
  { key: 'consistency', procedure: CONSISTENCY_PROCEDURE },
  { key: 'structure', procedure: STRUCTURE_PROCEDURE },
  { key: 'architecture', procedure: ARCHITECTURE_PROCEDURE },
]

function dimensionPrompt(d) {
  return (
    `${PERSONA}\n\n` +
    `Repo root: ${repoRoot}\n${scopeLine}\n\n` +
    `${d.procedure}\n\n` +
    `Deliverable: verdict for THIS dimension (clean / minor issues / significant issues / broken — clean requires a ` +
    `genuine attempt to find problems, not just absence of findings) plus the findings. Each finding: severity ` +
    `(blocker/major/minor), location (exact paths, line numbers where possible), observation (what is wrong, ` +
    `concretely), evidence (the file facts that prove it — quotes, counts, import lists), why_it_matters (the cost, ` +
    `risk, or trap this creates — not a restatement), recommended_action (one concrete change). Set dimension to "${d.key}".`
  )
}

// ---------------------------------------------------------------------------
// Review → (ultra) per-finding refutation. pipeline: each dimension's findings
// go to verification as soon as that dimension's review completes.
// ---------------------------------------------------------------------------

phase('Review')

const results = await pipeline(
  DIMENSIONS,
  d => agent(dimensionPrompt(d), { label: `review:${d.key}`, phase: 'Review', model: 'opus', schema: DIMENSION_SCHEMA }),
  (review, d) => {
    if (!review) return null
    if (!ultra || !review.findings.length) return review
    return parallel(review.findings.map(f => () =>
      agent(
        `Adversarially verify this ${d.key} finding against the repository at ${repoRoot} (read-only) and try to ` +
        `REFUTE it. Default refuted=true if the cited evidence does not clearly hold up on inspection.\n\n` +
        `Severity: ${f.severity}\nLocation: ${f.location}\nClaim: ${f.observation}\nEvidence cited: ${f.evidence}\n\n` +
        `Return {refuted, reason}.`,
        { label: `verify:${d.key}`, phase: 'Verify', model: 'opus', schema: VERIFY_SCHEMA }
      ).then(v => ({ f, refuted: !!(v && v.refuted), reason: v ? (v.reason || '') : 'no verdict' }))
    )).then(verdicts => {
      const vs = verdicts.filter(Boolean)
      const kept = vs.filter(v => !v.refuted).map(v => v.f)
      const refuted = vs.filter(v => v.refuted).map(v => ({ observation: v.f.observation, reason: v.reason }))
      log(`verify:${d.key} — ${kept.length}/${review.findings.length} findings survived refutation`)
      return { ...review, findings: kept, refuted }
    })
  }
)

const reviews = results.filter(Boolean)
if (!reviews.length) {
  return { error: 'no dimension review completed' }
}
const missing = DIMENSIONS.filter(d => !reviews.some(r => r.dimension === d.key)).map(d => d.key)
if (missing.length) log(`WARNING: dimension(s) did not complete: ${missing.join(', ')} — report covers the rest`)

// ---------------------------------------------------------------------------
// Synthesis
// ---------------------------------------------------------------------------

phase('Synthesis')

const report = await agent(
  `You are assembling the final codebase-review report for ${repoRoot}. ${scopeLine}\n` +
  `Be adversarial and honest; a clean verdict must be earned.\n\n` +
  `PER-DIMENSION RESULTS${ultra ? ' (findings already survived adversarial refutation)' : ''}:\n` +
  `${JSON.stringify(reviews, null, 2)}\n\n` +
  `Do all of the following:\n` +
  `1. SPOT-VERIFY the load-bearing findings before you report them: for EVERY blocker and major finding, independently ` +
  `re-check its cited evidence against the repo yourself (read-only — \`wc -l\`, \`grep\`, read the cited lines). Drop ` +
  `a finding whose evidence does not hold up, or downgrade its severity to match what you can actually confirm, and ` +
  `record what you dropped or downgraded in cross_dimension_notes. Do this first so a hallucinated or overstated ` +
  `major cannot anchor the report${ultra ? ' (findings already passed a per-finding refutation pass, so treat this as a fast final confirmation, not a re-litigation)' : ''}.\n` +
  `2. Merge and DEDUPE findings across dimensions — the same defect surfaced by two dimensions is ONE finding: keep ` +
  `the strongest evidence and tag it with the dimension whose recommended action is most actionable.\n` +
  `3. Reconcile conflicts the dimension agents could not see: where two dimensions recommend incompatible actions on ` +
  `the same files (e.g. consistency says rename, structure says delete), resolve to one coherent recommendation and ` +
  `note the conflict in cross_dimension_notes.\n` +
  `4. Assign final per-dimension verdicts (clean / minor issues / significant issues / broken) — start from each ` +
  `dimension agent's verdict, adjusting where dedupe, refutation, or your step-1 spot-verify changed the picture` +
  `${missing.length ? `; a dimension that did not complete (${missing.join(', ')}) gets no verdict better than "minor issues" and a note that it did not run` : ''} — ` +
  `and ONE overall verdict, never cleaner than the worst dimension.\n` +
  `5. Produce recommended_actions: a prioritised list ordered by what the developer should tackle first, each entry ` +
  `referencing its finding(s). Mandatory even when there is only one action — the ordering is itself the deliverable.\n\n` +
  `Each finding's why_it_matters states the concrete cost, risk, or trap — not a restatement of the observation. ` +
  `cross_dimension_notes is a PLAIN-TEXT prose field. ` +
  `Headline must not claim "clean/all good" unless there are zero blocker and major findings.`,
  { label: 'synthesis', phase: 'Synthesis', model: 'opus', effort: 'high', schema: REPORT_SCHEMA }
)

return {
  repoRoot,
  scope: scope || '(whole codebase)',
  ultra,
  report,
  raw: { dimensions: reviews },
}
