export const meta = {
  name: 'project-review-codebase',
  description: 'Read-only codebase review: consistency + structure + architecture + rules dimension agents → cross-dimension synthesis → Markdown artifact',
  whenToUse: 'Launched by the /project-review-codebase skill. Reviews a codebase — production and test code alike — for internal consistency, physical layout, module architecture, and conformance to the rules the project wrote down, including whether failure modes are tested; dedupes findings across dimensions and returns a standalone Markdown report with Mermaid diagrams.',
  phases: [
    { title: 'Review', detail: 'one adversarial agent per dimension' },
    // `meta` must be a pure literal, so this phase cannot be declared conditionally.
    // At every level below ultra it therefore sits at "not started" for the whole run,
    // which reads as a hang — the title carries the condition so the progress tree
    // explains itself without the detail line.
    { title: 'Verify (ultra only)', detail: 'adversarially refute each finding' },
    { title: 'Synthesis', detail: 'dedupe + reconcile + deepening candidates + Markdown artifact' },
  ],
}

// args: { repoRoot, scope?, vocabFile?, rulesFile?, level? }

// ---------------------------------------------------------------------------
// Pure helpers — no runtime globals, so they are reachable without launching a
// multi-agent run. Unit-tested via tests/project-review/script-tests/test-review-codebase.js.
// ---------------------------------------------------------------------------

// The depth vocabulary is shared with project-review-docs and test-tests: one
// argument name, one token set, so a token learned at one skill means the same
// thing at the next. That promise was only half-kept: `ultra` added the per-finding
// refutation pass while low/medium/high ran identically, so `low` cost the same as
// `high` and the skill had to warn users about its own vocabulary.
//
// `low` now means here what it means in project-review-docs: the reviewing agents drop
// to sonnet. Same dimensions, same coverage, roughly 40% of the cost — a cheap rung
// that is actually cheap.
const LEVELS = ['low', 'medium', 'high', 'ultra']

// The model each rung reviews with. Synthesis stays on opus at every level: it is one
// agent reconciling every dimension's findings, and it is where a downgrade would show.
const LEVEL_REVIEW_MODEL = { low: 'sonnet', medium: 'opus', high: 'opus', ultra: 'opus' }

// Normalize the incoming `args` value into the review's configuration, and reject an
// unusable one here rather than three dimension agents later.
// Defensive: the runtime may hand `args` over as a JSON *string* rather than a parsed
// object (observed in practice). A string has no `.repoRoot`, so reading it directly
// would leave repoRoot undefined, which the dimension prompts would interpolate as the
// literal "undefined" — the agents would then review whatever directory they happened
// to be in and report confidently on the wrong tree, which is worse than a failure.
function normalizeArgs(rawArgs) {
  let parsed = rawArgs
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed) } catch { parsed = {} }
  }
  parsed = parsed || {}
  const raw = String(parsed.level || '').toLowerCase()
  const level = LEVELS.includes(raw) ? raw : 'medium'
  const repoRoot = String(parsed.repoRoot || '')
  // Same trap as repoRoot below: an unsubstituted "<SKILL_DIR>/../../references/…"
  // placeholder is a NON-EMPTY string, so a truthiness check passes it through and
  // buildDimensions builds a rules dimension whose prompt tells an agent to read a file
  // that is not there — the agent then reviews against no procedure and reports anyway.
  // Unlike repoRoot this argument is optional, so a bad one drops the dimension rather
  // than failing the run: three dimensions that ran beat four with one reviewing nothing.
  const rawRulesFile = String(parsed.rulesFile || '')
  const rulesFile = rawRulesFile.startsWith('/') ? rawRulesFile : ''
  // The same trap once more: architectureProcedure() branches on truthiness, so an
  // unsubstituted placeholder would build a prompt telling the agent to "First read the
  // design vocabulary at <SKILL_DIR>/…" against a file that is not there. Reviewing with
  // no vocabulary beats reviewing under a dangling read instruction.
  const rawVocabFile = String(parsed.vocabFile || '')
  const vocabFile = rawVocabFile.startsWith('/') ? rawVocabFile : ''

  let error = null
  if (parsed.ultra !== undefined) {
    // The boolean `ultra` this workflow used to take is gone. Accepting it silently would
    // run a caller who asked for the refutation pass at the default depth instead, and
    // report level:'medium' as though that is what they wanted.
    error = 'the boolean `ultra` argument was replaced by `level` — pass "level": "ultra" instead'
  } else if (!repoRoot) {
    error = 'repoRoot is required — it is the tree every dimension agent walks'
  } else if (!repoRoot.startsWith('/')) {
    // SKILL.md step 3 hands the model a "<repo root, or the step-1 path>" template. An
    // unsubstituted placeholder is a NON-EMPTY string, so a truthiness check passes it
    // through and the dimension prompts ship it verbatim — three opus agents then review
    // whatever directory they happen to land in and return a confident report about the
    // wrong tree. Only an absolute path can be a repo root, so require one.
    error = `repoRoot must be an absolute path (got ${JSON.stringify(repoRoot)}) — an unsubstituted "<…>" placeholder would otherwise reach the dimension agents`
  }

  return {
    repoRoot,
    scope: parsed.scope || '',
    vocabFile,
    vocabFileRejected: rawVocabFile && !vocabFile ? rawVocabFile : '',
    rulesFile,
    // Non-empty only when a rulesFile arrived and was rejected, so the orchestration can
    // say which value it dropped instead of reporting the same line as an absent one.
    rulesFileRejected: rawRulesFile && !rulesFile ? rawRulesFile : '',
    level,
    ultra: level === 'ultra',
    reviewModel: LEVEL_REVIEW_MODEL[level],
    // Echoed on a bail-out: naming the keys that actually arrived is what lets a caller
    // spot a misspelling, which an error naming only the expected keys cannot.
    receivedKeys: Object.keys(parsed),
    error,
  }
}

const VERDICTS = ['clean', 'minor issues', 'significant issues', 'broken']

const FINDING_ITEMS = {
  type: 'object',
  properties: {
    severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
    location: { type: 'string' },
    observation: { type: 'string' },
    evidence: { type: 'string' },
    why_it_matters: { type: 'string' },
    recommended_action: { type: 'string' },
  },
  // why_it_matters is required here as well as in REPORT_SCHEMA: dimensionPrompt() asks
  // for it explicitly, so leaving it optional let an agent legally omit the field and
  // forced the synthesis stage to invent one it had no evidence for.
  required: ['severity', 'location', 'observation', 'evidence', 'why_it_matters', 'recommended_action'],
}

// A deepening candidate is a PROPOSAL, not a defect — it names a refactor that would
// turn a shallow module into a deep one. Only the architecture dimension emits these.
// The before/after Mermaid pair is the whole reason the markdown artifact is worth
// rendering: a list of prose findings does not need a picture, a structural change does.
// Field set follows the deep-module vocabulary in references/design-vocabulary.md.
const CANDIDATE_ITEMS = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    strength: { type: 'string', enum: ['Strong', 'Worth exploring', 'Speculative'] },
    dependency_category: {
      type: 'string',
      enum: ['in-process', 'local-substitutable', 'ports & adapters', 'mock'],
    },
    files: { type: 'array', items: { type: 'string' } },
    problem: { type: 'string' },
    solution: { type: 'string' },
    wins: { type: 'array', items: { type: 'string' } },
    mermaid_before: { type: 'string' },
    mermaid_after: { type: 'string' },
  },
  required: [
    'title', 'strength', 'dependency_category', 'files',
    'problem', 'solution', 'wins', 'mermaid_before', 'mermaid_after',
  ],
}

// Every dimension returns verdict + findings; structure and architecture each add one
// visual payload on top. Kept as one builder so the shared core cannot drift apart.
function dimensionSchema(extra) {
  return {
    type: 'object',
    properties: {
      dimension: { type: 'string' },
      verdict: { type: 'string', enum: VERDICTS },
      findings: { type: 'array', items: FINDING_ITEMS },
      ...(extra || {}),
    },
    required: ['dimension', 'verdict', 'findings'],
  }
}

const DIMENSION_SCHEMA = dimensionSchema()
const STRUCTURE_SCHEMA = dimensionSchema({ tree_mermaid: { type: 'string' } })
const ARCHITECTURE_SCHEMA = dimensionSchema({ candidates: { type: 'array', items: CANDIDATE_ITEMS } })

// Same shape as the verify schema in review-docs.js and test-tests.js — duplicated
// by hand because workflow scripts are self-contained and cannot import shared
// modules. The refutation prompt is per-workflow, not shared.
const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    refuted: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['refuted'],
}

// One recommended action, tagged settled or open — the vocabulary is defined once in
// references/decision-split.md at the plugin root. The split is the point: a developer
// handed 14 undifferentiated actions has to re-derive which ones were ever in question,
// and a form built from the flat list asks about settled bugs.
const ACTION_ITEMS = {
  type: 'object',
  properties: {
    action: { type: 'string' },
    decision: { type: 'string', enum: ['settled', 'open'] },
    // The three below are what an open decision needs to be answerable by someone who
    // did not run the review. Required in practice when decision is 'open' — JSON
    // Schema cannot express that conditional, so the synthesis prompt states it.
    question: { type: 'string' },
    options: { type: 'array', items: { type: 'string' } },
    recommendation: { type: 'string' },
  },
  required: ['action', 'decision'],
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
          // Carried through from the dimension finding. Without it the cited proof —
          // the strongest part of a finding — never reaches the artifact the developer
          // keeps, leaving a bare assertion they cannot check.
          evidence: { type: 'string' },
          why_it_matters: { type: 'string' },
          recommended_action: { type: 'string' },
        },
        required: ['dimension', 'severity', 'location', 'observation', 'evidence', 'why_it_matters', 'recommended_action'],
      },
    },
    recommended_actions: { type: 'array', items: ACTION_ITEMS },
    cross_dimension_notes: { type: 'string' },
    // Surviving deepening candidates, in the order the developer should consider them.
    // Their 1-based position IS the number the user selects by ("implement 2 and 4"),
    // so this ordering must match the numbering in report_markdown exactly.
    architecture_candidates: { type: 'array', items: CANDIDATE_ITEMS },
    // The standalone artifact: the whole review as a Markdown document with Mermaid
    // diagrams. Written to a temp file by the skill; also the input for an HTML render.
    report_markdown: { type: 'string' },
  },
  required: [
    'verdict', 'dimension_verdicts', 'headline', 'findings',
    'recommended_actions', 'report_markdown',
  ],
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

function scopeLine(scope) {
  return scope
    ? `Scope of this review (from the user): ${scope}. Confine findings to it.`
    : `Scope: the whole codebase — walk the tree.`
}

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
  `6. TEST-CODE CONVENTION DRIFT — test code is code, and every check above applies to it. Look for competing setup or fixture idioms doing the same job, ` +
  `assertion styles that differ between sibling test files, and helper functions that duplicate one another because nobody found the existing one. ` +
  `Name the variants with their files and say which is the template. A suite where each file arranges its setup differently charges every future contributor the same re-reading before they can add one test.\n\n` +
  `BASELINE RULE: your standard is the dominant pattern — it is the de facto convention, so flag minority deviations ` +
  `against it. Where the project has WRITTEN the convention down, the finding is the rules dimension's, not yours: ` +
  `note it as "documented in <file>" and let that dimension carry it, so the same violation is not reported twice ` +
  `under two headings. Never recommend "fixing" the majority to match a documented-but-ignored standard — that ` +
  `conflict is a policy decision the rules dimension surfaces.\n\n` +
  `NOT THIS DIMENSION: pure formatting (whitespace, brackets — linter territory); whether the shared pattern is the ` +
  `right design (architecture dimension); where files live (structure dimension); code that ignores a rule the ` +
  `project wrote down (rules dimension).`

// CROSS-PLUGIN CONTRACT: the Mermaid class names below and in architectureProcedure()
// (misplaced, dead, god, leak, deep) are coloured by html-visualization's
// visualize-template.html, which carries a matching `.vis-mermaid-wrap .<name>` rule for
// each. Renaming one here silently drops its colour when the artifact is rendered as HTML.
// Nothing enforces this across plugin boundaries — the artifact just degrades to
// structure-only marks, which is why the label must also name the problem in words.
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
  `leftovers (foo.bak, foo_old.py); fixture data kept long after the test that read it was deleted.\n` +
  `4. TEST SUPPORT THAT OUTGREW ITS PLACE — shared setup a newcomer must read in full before adding one test, helper ` +
  `modules that accumulated responsibilities unrelated to each other, fixture files that grew and were never pruned, ` +
  `and tests whose BEHAVIOUR contradicts where they live: a file under a unit-test directory that starts a server, ` +
  `opens a socket, or reaches a real database. For that last one name the test, the resource it reaches for, and the ` +
  `suite it belongs in — its own directory is making a promise about speed and isolation that it does not keep.\n\n` +
  `Recommended action per finding: exactly one of move, delete, rename, or document — an entangled helper is a move ` +
  `(lift the unrelated responsibility out), stale fixture data is a delete, a mislabelled test is a move.\n\n` +
  `ALSO PRODUCE tree_mermaid: an annotated Mermaid diagram of the layout, because the shape of a tree is the one ` +
  `thing a list of findings cannot show. Use \`graph TD\` with directories as nodes. Include the directories that ` +
  `carry findings plus enough of their surroundings to orient a reader — NOT every file in the repo; past roughly ` +
  `40 nodes it stops being readable, so summarise clean subtrees as a single node — U["src/utils/ (12 files, clean)"]. ` +
  `Mark problems with these exact classDefs:\n` +
  `  classDef misplaced stroke-width:2px;\n` +
  `  classDef dead stroke-dasharray:4 4;\n` +
  `  classDef god stroke-width:4px;\n` +
  `Assign every flagged node to exactly one of misplaced, dead or god, and leave unflagged nodes unstyled. Stroke ` +
  `width alone is a weak signal — nobody reliably tells 2px from 4px — so ALSO name the problem in the node's own ` +
  `label ("src/utils/ — god-file"). The label is what a reader actually reads; the stroke only reinforces it. ` +
  `WRAP EVERY NODE LABEL IN DOUBLE QUOTES — A["src/core/ — god-file"], never A[src/core/ — god-file]. An unquoted ` +
  `"(" is a hard parse error that replaces the WHOLE diagram with an error graphic, and a parenthesised count is ` +
  `exactly the summary form asked for above. Quoting is unconditionally safe, so quote unconditionally rather than ` +
  `judging per label; escape any double quote inside a label as #quot;, which is Mermaid's own entity syntax and ` +
  `survives both renderers — an &quot; is decoded back to a raw quote by the HTML parser before Mermaid ever sees ` +
  `it, which is the same fatal parse error. If the dimension is genuinely clean, still emit the ` +
  `tree — an unannotated layout map is a useful artifact on its own.\n\n` +
  `NOT THIS DIMENSION: module granularity and layering (architecture dimension); naming and casing conventions ` +
  `(consistency dimension).`

function architectureProcedure(vocabFile) {
  return `Dimension: ARCHITECTURE — are the module boundaries earning their keep?\n\n` +
    (vocabFile
      ? `First read the design vocabulary at ${vocabFile} and use its terms (module, interface, depth, seam, adapter, ` +
        `leverage, locality) precisely in findings.\n\n`
      : '') +
    // YAGNI weighting: depth pays off only where the code keeps being edited, so bias the walk
    // toward churn rather than scanning the tree evenly. Findings are exempt — a blocker in
    // dormant code is still a blocker; it is the CANDIDATES that go stale as proposals.
    `WEIGHT YOUR ATTENTION BY CHURN. Deepening a module pays off by making future changes to it cheaper, so put ` +
    `extra weight on where change actually lands. If the scope above names a direction, take it and skip this step. ` +
    `Otherwise rank the hot spots, from the repo root given above — \`git log --name-only --pretty=format: -n 200 ` +
    `| grep -v '^$' | sort | uniq -c | sort -rn | head -40\`. That ranks FILES; roll them up to the modules that ` +
    `own them, and let those modules pull your attention first; ` +
    `where the churn is scattered with no clear hot spot, walk the tree evenly instead. This binds the CANDIDATES ` +
    `hardest: a deepening proposal in code nobody edits is a refactor never cashed in, so order candidates with ` +
    `the hot spots first and let churn break a tie on which to emit at all. FINDINGS are exempt — a blocker in a ` +
    `dormant module is still a blocker.\n\n` +
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
    `always imported together and have no assembly point. Recommended action: split or merge.\n` +
    `6. TESTED FAILURE MODES — for the modules you judged above, name what can actually fail: the error paths, the ` +
    `boundary conditions, the ways an external dependency breaks, concurrent or interleaved access. Then check whether ` +
    `any test reaches them. The evidence is usually a mock: a dependency stubbed to succeed every time, with nothing ` +
    `exercising what the module does when it fails, means the code that runs during an incident is the code nobody has ` +
    `ever run. A coverage percentage does not answer this — a module can be fully covered by tests that only ever walk ` +
    `the happy path. Where check 3 asks whether a module CAN be tested, this asks whether its failure behaviour IS ` +
    `tested; keep the two findings separate.\n` +
    `Two judgments about what tests cost belong here, and both are reading questions no tool answers:\n` +
    `  - an EXPENSIVE test — one that starts a container, seeds a real database, or sleeps — must cover a risk a fast ` +
    `test cannot. Name that risk concretely. Where you cannot name one, the test is paying its runtime for coverage a ` +
    `unit test already provides, and that is the finding.\n` +
    `  - an edge case with NO code footprint — a function with no empty-input guard, a limit never checked — is ` +
    `invisible to coverage and mutation tools alike, because there is no line to measure or mutate. Only reading finds ` +
    `it: name the input that has neither a guard nor a test.\n\n` +
    `ALSO PRODUCE candidates: DEEPENING PROPOSALS, which are a different deliverable from findings. A finding says ` +
    `what is wrong; a candidate says what to build instead. Derive them from the findings above — the strongest ` +
    `findings usually collapse into a smaller number of candidates, and one candidate often subsumes several ` +
    `findings. Do not pad: emit only proposals you would actually defend, and an empty array if the architecture is ` +
    `genuinely sound. Aim for at most 5; ordering is by what you would tackle first.\n` +
    `Each candidate carries:\n` +
    `  - title: names the deepening, imperative and concrete ("Collapse the Order intake pipeline").\n` +
    `  - strength: Strong (evidence is decisive) / Worth exploring (real friction, contested design) / Speculative ` +
    `(a hunch worth a conversation). Be honest — a page of "Strong" is not credible.\n` +
    `  - dependency_category: what the deepened module depends on, which decides how it gets tested. ` +
    `in-process (pure computation, no I/O — merge and test directly, no adapter); local-substitutable (a real local ` +
    `stand-in exists, e.g. an in-memory database — seam stays internal); ports & adapters (your own service across a ` +
    `network — define a port, HTTP adapter in production, in-memory adapter in tests); mock (a third party you do not ` +
    `control — inject the port, mock adapter in tests).\n` +
    `  - files: the modules involved, exact paths.\n` +
    `  - problem / solution: ONE sentence each. Problem is the friction today; solution is what changes.\n` +
    `  - wins: up to 4 bullets, at most 6 words each, stated in leverage and locality terms ("one interface, N call ` +
    `sites", "bugs concentrate in one module"). Never "easier to maintain" or "cleaner code" — those claim nothing.\n` +
    `  - mermaid_before / mermaid_after: a matched pair of \`flowchart LR\` diagrams showing the module structure ` +
    `now and as proposed. Keep BOTH under a dozen nodes and reuse identical node names across the pair so a reader ` +
    `can see what moved. Mark leaking or misplaced edges in the BEFORE diagram with:\n` +
    `      classDef leak stroke-width:2px,stroke-dasharray:4 4;\n` +
    `and the consolidated deep module in the AFTER diagram with:\n` +
    `      classDef deep stroke-width:4px;\n` +
    `Emit raw Mermaid source only — no \`\`\` fences, the renderer adds them. WRAP EVERY NODE LABEL IN DOUBLE QUOTES — ` +
    `A["OrderIntake (3 wrappers)"], never A[OrderIntake (3 wrappers)]: an unquoted "(" is a hard parse error that ` +
    `replaces the whole diagram with an error graphic. Escape any double quote inside a label as #quot; — Mermaid's ` +
    `own entity syntax, which survives both renderers, where an &quot; is decoded back to a raw quote by the HTML ` +
    `parser before Mermaid sees it and is the same fatal parse error.\n` +
    `A candidate whose before and after diagrams are identical is not a candidate; drop it.\n\n` +
    `NOT THIS DIMENSION: naming (consistency dimension); physical placement (structure dimension). Candidates are ` +
    `PROPOSALS the user chooses from, never edits you make — this review never modifies the repository. Walking one ` +
    `decision through its tree interactively is challenge:kiss, not here.`
}

// The rules procedure is deliberately NOT inlined here, unlike the other three. It is
// shared verbatim with project-review-change, which runs the same procedure over one
// change instead of the tree; references/rules-conformance.md at the plugin root is the
// single copy and the skill passes its absolute path as `rulesFile`. A second copy here
// would drift from the one the change review reads, and the two reviews would then judge
// the same repository by two standards. Without the path there is no procedure, so the
// dimension drops out of the run rather than being guessed at.
function rulesProcedure(rulesFile) {
  return `Dimension: RULES — does the codebase do what the project's own documents say it must?\n\n` +
    `Read the procedure at ${rulesFile} and follow it exactly. It names the documents that form the standard, what ` +
    `counts as a finding, what does not, and which commands you may run. It is written for a review of one CHANGE; ` +
    `here the subject is THE WHOLE TREE. Two things that scope changes:\n` +
    `1. UNFINISHED DUTIES BECOME STANDING ONES. You are not diffing anything, so you cannot find them by looking for ` +
    `recent edits. Walk each document's stated requirements against the tree instead: a plugin the marketplace file ` +
    `never registered, a rename the alias table never recorded, a committed helper no suite covers.\n` +
    `2. SKIP THE "SUGGESTED RULE ADDITIONS" LIST. Report violations only. Over one change that list is short and ` +
    `immediately actionable; over a whole tree it is unbounded, and whether the documents are complete is already ` +
    `project-review-docs's question. A gap you would have listed goes in cross_dimension_notes at most.\n\n` +
    `SEVERITY: weight by what the violation costs today, not by the fact that a rule was broken. Old, load-bearing ` +
    `code that contradicts a rule everyone has since ignored is a signal the DOCUMENT is wrong — say so and route it ` +
    `to the docs review rather than demanding the code change.\n\n` +
    `NOT THIS DIMENSION: drift with nothing written down (consistency dimension); where files live, except where a ` +
    `document states where they must live (structure dimension); whether the documents themselves are accurate or ` +
    `complete (project-review-docs).`
}

function buildDimensions(vocabFile, rulesFile) {
  return [
    { key: 'consistency', procedure: CONSISTENCY_PROCEDURE, schema: DIMENSION_SCHEMA },
    { key: 'structure', procedure: STRUCTURE_PROCEDURE, schema: STRUCTURE_SCHEMA },
    { key: 'architecture', procedure: architectureProcedure(vocabFile), schema: ARCHITECTURE_SCHEMA },
    ...(rulesFile ? [{ key: 'rules', procedure: rulesProcedure(rulesFile), schema: DIMENSION_SCHEMA }] : []),
  ]
}

function dimensionPrompt(d, cfg) {
  return (
    `${PERSONA}\n\n` +
    `Repo root: ${cfg.repoRoot}\n${scopeLine(cfg.scope)}\n\n` +
    `${d.procedure}\n\n` +
    `Deliverable: verdict for THIS dimension (clean / minor issues / significant issues / broken — clean requires a ` +
    `genuine attempt to find problems, not just absence of findings) plus the findings. Each finding: severity ` +
    `(blocker/major/minor), location (exact paths, line numbers where possible), observation (what is wrong, ` +
    `concretely), evidence (the file facts that prove it — quotes, counts, import lists), why_it_matters (the cost, ` +
    `risk, or trap this creates — not a restatement), recommended_action (one concrete change). Set dimension to "${d.key}".` +
    (d.key === 'structure'
      ? ` Also return tree_mermaid, per the ALSO PRODUCE block above.`
      : '') +
    (d.key === 'architecture'
      ? ` Also return candidates, per the ALSO PRODUCE block above — findings and candidates are separate ` +
        `deliverables and you owe both.`
      : '')
  )
}

// Which dimensions never came back. A dimension agent that dies returns null, and the
// synthesis stage must be told so explicitly — otherwise it silently reports a verdict
// on two dimensions as though it had reviewed three.
function missingDimensions(reviews, keys) {
  return keys.filter(k => !reviews.some(r => r && r.dimension === k))
}

// ---------------------------------------------------------------------------
// The markdown artifact — the standalone deliverable the skill writes to a temp
// file, and the input for an optional HTML render. Specified inline rather than
// in a reference file for the same reason the dimension procedures are: when the
// Workflow tool is unavailable, the skill falls back to reading this file and
// following it by hand, so everything it needs must live here.
// ---------------------------------------------------------------------------

const ARTIFACT_FORMAT =
  `The document MUST STAND ALONE: someone opening the file with no access to this conversation has to understand ` +
  `it. Never write "as discussed" or refer to the chat. Sections in this exact order, omitting any that would be ` +
  `empty:\n\n` +
  `# Codebase review — <the repo's directory name>\n\n` +
  `One italic line giving the scope reviewed and whether the adversarial refutation pass ran.\n\n` +
  `## Verdict\n\n` +
  `A table with columns Dimension | Verdict, one row for each dimension that ran — consistency, structure, ` +
  `architecture, and rules where it was included — then a final **Overall** row. Follow it with the headline as a ` +
  `short paragraph.\n\n` +
  `## Deepening candidates\n\n` +
  `Omit this section entirely when there are no candidates. Otherwise one \`###\` block per candidate, NUMBERED FROM ` +
  `1 in array order — the number is how the user selects it, so it must match architecture_candidates exactly:\n\n` +
  `### 1. <title> — <strength> · <dependency_category>\n\n` +
  `**Files:** the paths, comma-separated, each in backticks\n` +
  `**Problem:** one sentence\n` +
  `**Solution:** one sentence\n\n` +
  `**Wins:** the wins as a bullet list\n\n` +
  `Then the pair, each a fenced mermaid block under a bold label:\n\n` +
  `**Before**\n\n\`\`\`mermaid\n<mermaid_before>\n\`\`\`\n\n**After**\n\n\`\`\`mermaid\n<mermaid_after>\n\`\`\`\n\n` +
  `Copy both Mermaid sources through BYTE-FOR-BYTE as the architecture dimension produced them. Do not reformat, ` +
  `re-indent, relabel, or "improve" them — they were authored to render, and edits break them.\n\n` +
  `## Layout\n\n` +
  `Omit when the structure dimension returned no tree_mermaid. Otherwise one legend line naming ALL THREE marks — ` +
  `god-files carry the heaviest border, misplaced paths a medium one, dead or orphaned paths a dashed one — and ` +
  `saying that a flagged directory also names its problem in its own label, which is what a reader actually goes by ` +
  `since the raw Markdown has no stylesheet to distinguish the two border weights. Then tree_mermaid verbatim in a ` +
  `fenced mermaid block — again byte-for-byte.\n\n` +
  `## Findings\n\n` +
  `Grouped under \`###\` by dimension in the order consistency, structure, architecture, rules; skip a dimension with no ` +
  `findings. Within a group order blocker → major → minor. One bullet per finding:\n` +
  `- **\`<location>\`** — <severity>. <observation> **Evidence:** <evidence> **Why it matters:** <why_it_matters> ` +
  `**Fix:** <recommended_action>\n\n` +
  `The evidence is what makes a finding checkable rather than an assertion — never drop it from a bullet.\n\n` +
  `## Recommended actions\n\n` +
  `Emit that \`##\` heading, then the two \`###\` subsections below nested under it. Omit a subsection that would be ` +
  `empty; never omit the parent, or the subsections read as the tail of Findings. Both number from 1 in priority ` +
  `order. Keeping them apart is what tells the developer where their attention is actually needed.\n\n` +
  `### Do these\n\n` +
  `Every settled action, one numbered \`action\` per line. Introduce the subsection with one line saying these have a ` +
  `single correct answer and are listed so the batch can be checked, not debated.\n\n` +
  `### Your call\n\n` +
  `Every open action, one numbered entry each:\n\n` +
  `1. **<question>**\n\n` +
  `   Options: the \`options\` as a bullet list.\n\n` +
  `   **Recommended:** the \`recommendation\`.\n\n` +
  `## Notes\n\n` +
  `cross_dimension_notes as prose; omit the section when it is empty.`

// Expose the pure helpers to any module loader (the Node unit tests in
// tests/project-review/script-tests use this). Assigned before the orchestration below so
// it is reached whichever path that takes.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeArgs, dimensionSchema, buildDimensions, dimensionPrompt, missingDimensions, scopeLine, LEVELS }
}

// ---------------------------------------------------------------------------
// Orchestration — runs only under the Workflow runtime, which injects the `agent`
// hook (plus args/log/parallel/pipeline/phase). Without that hook the runtime
// contract is broken, so we throw rather than silently no-op (see the else).
// ---------------------------------------------------------------------------

if (typeof agent === 'function') {
  const cfg = normalizeArgs(args)
  if (cfg.error) {
    // A bail-out return surfaces to the harness as status:completed, so echo what we
    // received to make the failure diagnosable rather than a silent no-op.
    log(`project-review-codebase: ${cfg.error} (args arrived as type "${typeof args}", keys: ${cfg.receivedKeys.join(', ') || 'none'})`)
    return { error: cfg.error, got: { type: typeof args, keys: cfg.receivedKeys, repoRoot: cfg.repoRoot } }
  }

  const { repoRoot, scope, vocabFile, rulesFile, level, ultra, reviewModel } = cfg
  const DIMENSIONS = buildDimensions(vocabFile, rulesFile)
  if (cfg.vocabFileRejected) {
    log(`vocabFile ${JSON.stringify(cfg.vocabFileRejected)} is not an absolute path — the architecture dimension runs without the design vocabulary this run`)
  }
  if (cfg.rulesFileRejected) {
    log(`rulesFile ${JSON.stringify(cfg.rulesFileRejected)} is not an absolute path — the rules dimension is skipped this run; the report covers three dimensions, not four`)
  } else if (!rulesFile) {
    log('no rulesFile argument: the rules dimension is skipped this run — the report covers three dimensions, not four')
  }

  // ── Review → (ultra) per-finding refutation. pipeline: each dimension's findings
  // go to verification as soon as that dimension's review completes.

  phase('Review')

  // The refutation phase is declared unconditionally (meta is a literal) but only runs
  // at ultra. Say so once, or its permanently-unstarted row reads as a stuck run.
  if (!ultra) log(`level=${level}: the refutation pass is ultra-only, so "Verify (ultra only)" stays empty this run`)

  const results = await pipeline(
    DIMENSIONS,
    d => agent(dimensionPrompt(d, cfg), { label: `review:${d.key}`, phase: 'Review', model: reviewModel, schema: d.schema }),
    (review, d) => {
      if (!review) return null
      if (!ultra || !review.findings.length) return review
      return parallel(review.findings.map(f => () =>
        agent(
          `Adversarially verify this ${d.key} finding against the repository at ${repoRoot} (read-only) and try to ` +
          `REFUTE it. Default refuted=true if the cited evidence does not clearly hold up on inspection.\n\n` +
          `Severity: ${f.severity}\nLocation: ${f.location}\nClaim: ${f.observation}\nEvidence cited: ${f.evidence}\n\n` +
          `Return {refuted, reason}.`,
          { label: `verify:${d.key}`, phase: 'Verify (ultra only)', model: 'opus', schema: VERIFY_SCHEMA }
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
  const missing = missingDimensions(reviews, DIMENSIONS.map(d => d.key))
  if (missing.length) log(`WARNING: dimension(s) did not complete: ${missing.join(', ')} — report covers the rest`)

  // ── Synthesis

  phase('Synthesis')

  const report = await agent(
    `You are assembling the final codebase-review report for ${repoRoot}. ${scopeLine(scope)}\n` +
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
    `5. Produce recommended_actions: a prioritised list ordered by what the developer should tackle first, each entry's ` +
    `\`action\` referencing its finding(s). Mandatory even when there is only one action — the ordering is itself the ` +
    `deliverable. Then tag every action \`settled\` or \`open\`, leaving none untagged. SETTLED is a plain bug, a typo, ` +
    `a dead exemption, a doc that contradicts the code — one correct answer, nothing to weigh. OPEN changes a public ` +
    `API or a name people type, picks one convention over another the repo also uses, trades one cost against another, ` +
    `or is large enough that "not now" is a real answer. When you can argue it either way it is settled: asking about ` +
    `a bug wastes the developer's attention. For every OPEN action also fill \`question\` (what is being decided, in ` +
    `ASD-STE100 Simplified Technical English — one idea per sentence, every identifier and abbreviation expanded — so ` +
    `a reader outside this review understands it), \`options\` (the real ` +
    `alternatives, including "leave it as is" wherever that is one), and \`recommendation\` (which option you would ` +
    `pick and the tradeoff that decided it).\n` +
    `6. Carry the architecture dimension's candidates into architecture_candidates, ordered by what you would tackle ` +
    `first. A candidate is a proposal built ON TOP OF findings, and it was generated BEFORE any of them were ` +
    `challenged — so re-check each one against the findings that actually survived. Drop a candidate whose supporting ` +
    `evidence you dropped or downgraded in step 1${ultra ? `, or whose supporting finding appears in a dimension's ` +
    `"refuted" list` : ''} — a proposal resting on a finding that did not survive is not a proposal — and note the ` +
    `drop in cross_dimension_notes. Do not invent new candidates here; you did not walk the code, the dimension agent ` +
    `did. Copy each candidate's mermaid_before and mermaid_after through unchanged. Empty array if the architecture ` +
    `dimension produced none.\n` +
    `7. Write report_markdown: the entire review as ONE standalone Markdown document, following this format exactly:\n\n` +
    `${ARTIFACT_FORMAT}\n\n` +
    `Every finding, action and candidate you report in the structured fields must also appear in report_markdown — ` +
    `the file is the artifact the developer keeps, so it cannot be a summary of the report, it must BE the report.\n\n` +
    `Each finding's why_it_matters states the concrete cost, risk, or trap — not a restatement of the observation. ` +
    `cross_dimension_notes is a PLAIN-TEXT prose field. ` +
    `Headline must not claim "clean/all good" unless there are zero blocker and major findings.`,
    { label: 'synthesis', phase: 'Synthesis', model: 'opus', effort: 'high', schema: REPORT_SCHEMA }
  )

  return {
    repoRoot,
    scope: scope || '(whole codebase)',
    level,
    ultra,
    report,
    raw: { dimensions: reviews },
  }
} else {
  // No `agent` hook: the Workflow runtime failed to inject it. Fail LOUD — returning
  // undefined here would be recorded by the harness as status:completed, i.e. a silent
  // no-op.
  throw new Error('project-review-codebase: the Workflow runtime did not inject the `agent` hook')
}
