---
name: project-review-change
description: "Rules review of one change against the project's own written rules; --fix applies the settled fixes."
when_to_use: "Use when the user asks whether a change obeys the project's rules. Triggers on 'rules review'. Also loaded by name when another skill needs the rules review. Not for correctness bugs or simplification (`code-review`), a review with its fixes pushed (`worktree-flow:worktree-review`), or a docs or whole-tree audit (`project-review-docs`, `project-review-codebase`)."
argument-hint: "[--fix] [pr-number|branch|path]"
---

Review of one change against **this project's own documents**: does the change do what
the project wrote down that it must? The review is read-only. With `--fix`, step 5 then
applies the fixes it settled.

## Run the review

1. **Resolve the subject.** `$ARGUMENTS` is `[--fix] [pr-number|branch|path]`. A leading
   `--fix` turns on step 5. What is left selects the subject:

   | What is left | Subject |
   |---|---|
   | no argument | the **default subject**: the uncommitted changes where `git status --porcelain` prints a line, otherwise the current branch against its base |
   | a number, with or without `#` | that pull request |
   | a branch name | that branch against its base |
   | a path | the default subject, confined to that path |

   A pull request needs `gh`: where `command -v gh` prints nothing, say so and ask for a
   branch.

   A branch, the current one included, needs a base: `git rev-parse --abbrev-ref
   origin/HEAD`. Where that command fails, ask which branch is the base; it still prints
   `origin/HEAD` then, so read its exit status, not its output. A pull request carries its
   own base. The diff is `git diff HEAD` for a dirty tree, plus each untracked file
   `git ls-files --others --exclude-standard` prints; `git diff <base>...<branch>` for a
   branch (`HEAD` for the current one), three dots for the merge base; `gh pr diff <n>`
   for a pull request.

   **Prove the subject exists before you spawn anything**: the reviewer takes the diff
   itself, and an empty subject comes back as a confident review of nothing. For a branch,
   `<base>` and `<branch>` must each resolve (`git rev-parse --verify --quiet <base>`, and
   the same for `<branch>`): where one does not, name it, ask which branch was meant, and
   stop. The file list is what `git diff --name-only HEAD` (a dirty tree),
   `git diff --name-only <base>...<branch>` or `gh pr diff <n> --name-only` prints, plus
   the untracked files of a dirty tree. For a path, end every `git status`, `git diff` and
   `git ls-files` command of this step, the dirty-tree test included, with `-- <path>`.
   Where a file-list command fails, relay its error and stop; where the list is empty,
   say the subject contains no changes, and stop.

   `--fix` edits the working tree, so it holds only for a subject checked out here: the
   default subject, with or without a path, or a pull request or branch whose head commit
   (`gh pr view <n> --json headRefOid` for a pull request) is `git rev-parse HEAD` while
   `git status --porcelain` prints nothing. For any other subject, run without `--fix` and
   say so now, with the reason.

   A repository with neither `AGENTS.md` nor `CLAUDE.md`, or with no document they route
   to, has no standard to measure against: say so and stop.

   Done when you can name the subject in one sentence, list the files it touches, and say
   whether `--fix` still holds.

2. **Build the two absolute paths** from `SKILL_DIR`, the **base directory for this
   skill** given when the skill loads. Both files sit at the plugin root, so the `../..`
   climb is correct here:

   - the procedure: `<SKILL_DIR>/../../references/rules-conformance.md`
   - the settled-or-open vocabulary: `<SKILL_DIR>/../../references/decision-split.md`

   Run `ls` on both. Never `find` the plugin and never improvise either path: where a
   file is missing, stop and say the install is broken.

   Done when `ls` printed both paths.

3. **Invoke the reviewer.** Use the **Agent** tool with `subagent_type`
   `project-review:project-reviewer` — that agent carries the adversarial posture, the
   read-only contract, and the output skeleton. Do **not** review inline while it is
   available. The prompt supplies the procedure, the subject, and the verdict labels:

   > Review one change against this project's own written rules.
   >
   > Read the procedure at `<the rules-conformance.md path>` and follow it exactly. It is
   > the whole review: the documents to read, what counts as a finding, and what does not.
   >
   > The subject is `<the step-1 subject in one sentence>`. Its files: `<the list>`. Take
   > the diff yourself with `<the step-1 diff command>` and read the changed files in full
   > — a diff hunk alone hides what a rule binds.
   >
   > Verdict labels: `clean`, `minor issues`, `significant issues`, `broken`. `clean`
   > requires a genuine attempt to find a broken rule, not the absence of one.
   >
   > Add two sections between `## Findings` and `## Recommended actions`, each omitted when
   > it is empty. `## Checks run` lists every command you ran because a document says to
   > run it, one per line with its result: passed, failed, or could not run.
   > `## Suggested rule additions` holds at most two additions that pass the four tests of
   > the procedure, each as the document, the section and the exact sentence.
   > Those are proposals for the documents, never defects in the subject, and they never
   > change the verdict.
   >
   > Grade every finding `proven` or `plausible` in its Observation.
   >
   > Tag every entry in `## Recommended actions` `settled` or `open`, leaving none
   > untagged — read `<the decision-split.md path>` for what the two mean. An entry is
   > `settled` only where every finding it names is proven; an entry for a plausible
   > finding is `open`. For each `open` entry also give the question, the real options
   > including "leave it as is" where that is one, and your recommendation.

   If the **Agent** tool is unavailable, run the procedure yourself — read the step-2
   procedure path in full, apply it to the subject, produce the same sections, and state
   that the review ran inline rather than on the reviewer agent.

   Done when the review carries one of the four verdict labels, every finding a grade, and
   every action a tag. An untagged action counts as `open`, and so does a `settled` one
   that names a finding not graded `proven`: its question is whether to apply it as
   stated. Where the reviewer reports no standard to measure against, relay that and end
   the run.

4. **Relay the review.** Surface the agent's verdict and findings as it wrote them; do not
   re-derive or re-label them. Then follow `<SKILL_DIR>/../../references/decision-split.md`
   over the actions, in the groups step 3 ended on — "this change" is what was reviewed. With `--fix`, say that step 5 applies the settled batch now, in place
   of the reference's closing line on how the user stops a settled one, and hold back the
   reviewer's suggestion to file the findings with `/tasks:tasks-create` for step 5.

   Keep `## Suggested rule additions` visibly apart from the findings when you relay it.
   Merging the two is the one failure that turns this review into an ordinary code review.
   Relay only the additions this session has not relayed before.

   For a "did you really check X?" follow-up, **re-run the skill**; never answer from the
   review text alone.

   Done when every open item has been put to the user and the settled batch has been named.

5. **Apply the settled batch**, with `--fix` only. Without it the run ends at step 4.

   Make every change the `settled` entries of `## Recommended actions` name, as the
   reviewer stated it and nothing beyond it. The batch edits files in the working tree and
   nothing else: name a settled action of another kind — a commit message, a branch name,
   a pull request field — as not applied, with that reason. The `open` entries stay the
   questions step 4 put to the user, and `## Suggested rule additions` stay proposals.

   An entry tagged `settled` that names a plausible finding is outside the batch: step 3
   counted it as `open`. Name it as not applied, with that reason.

   Where an edit was made, run every command under `## Checks run` again on the edited
   tree and report each result. A command that passed in the review and fails now goes
   first in the report: the batch stays in the tree, for the caller to correct.

   Leave the result uncommitted: the commit belongs to whoever asked for the review.

   Where the reviewer closed with a suggestion to file the findings with
   `/tasks:tasks-create`, give it for what the batch left alone: the `open` entries and
   the actions named as not applied. Where none is left, leave it out.

   Done when every settled action is applied, or named with the reason it was not, and
   every command under `## Checks run` has run again, with its result reported.

## Not covered

Correctness bugs, reuse, and simplification → the general code review. Whether the
documents themselves are right → `project-review-docs`. Rule debt in files this change
never touched, plus consistency, layout and architecture → `project-review-codebase`,
whose rules dimension runs this same procedure over the whole tree. Empirical test-suite
strength → `project-auto-work:test-tests`. A retrospective on one coding session →
`project-review-session`.
