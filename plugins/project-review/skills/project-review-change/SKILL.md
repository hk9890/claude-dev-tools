---
name: project-review-change
description: "Rules review of one change against the project's own written rules; read-only unless --fix, which applies the settled fixes."
when_to_use: "Use when the user asks whether a change obeys the project's rules. Triggers on 'rules review'. Also loaded by name when another skill needs the rules review. Not for correctness bugs or simplification (`code-review`), an audit of the docs (`project-review-docs`), or the whole tree (`project-review-codebase`)."
argument-hint: "[--fix] [pr-number|branch|path]"
---

Review of one change against **this project's own documents**. It asks a single
question: does the change do what the project wrote down that it must?

The review is read-only. With `--fix`, step 5 then applies the fixes it settled.

`references/rules-conformance.md` at the plugin root is the whole procedure, including
which documents form the standard. Step 2 builds the path to it.

One adversarial agent does the whole review. There is no workflow and no level argument.

## Run the review

1. **Resolve the subject.** `$ARGUMENTS` is `[--fix] [pr-number|branch|path]`. A leading
   `--fix` turns on step 5. What is left selects the subject:

   | What is left | Subject |
   |---|---|
   | no argument | the **default subject**: the uncommitted changes when the tree is dirty, otherwise the current branch against its base |
   | a number, with or without `#` | that pull request |
   | a branch name | that branch against its base |
   | a path | the default subject, confined to that path |

   A pull request needs the GitHub command line tool. Check before you promise it:

   ```bash
   command -v gh >/dev/null && echo "gh present" || echo "gh missing"
   ```

   When it is missing, say so and ask for a branch instead — do not review something else
   and call it the pull request.

   Resolve the base and see the shape of the change in one call, because shell state does
   not survive between `Bash` calls:

   ```bash
   git status --porcelain | head -30
   git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo "no origin/HEAD — ask which branch is the base"
   ```

   Then take the diff — `git diff HEAD` for a dirty tree, `git diff <base>...<branch>` for a
   branch (`HEAD` for the current one), `gh pr diff <n>` for a pull request. `git diff HEAD`
   holds the staged and the unstaged changes; an untracked file is in no diff, so add each
   one `git ls-files --others --exclude-standard` prints to the file list. Use the three-dot
   form for a branch so the comparison is against the merge base, not against whatever the
   base branch has since gained.

   **Prove the subject exists before you spawn anything.** Step 3 tells the reviewer agent
   to take the diff itself, so a ref that does not resolve or a range with no files in it
   reaches the agent as an empty subject and comes back as a confident review of nothing.
   That has to fail here instead:

   ```bash
   git rev-parse --verify --quiet "<the ref you resolved>" >/dev/null || echo "ref does not resolve — stop and ask which branch is the base"
   git diff --name-only "<the range you resolved>" | head -50
   ```

   A pull request carries its own base, so a missing `origin/HEAD` does not matter for it:
   `gh pr diff <n> --name-only` is its proof and its file list.

   An empty file list is not a clean review. Say the subject contains no changes, and stop.

   `--fix` edits the working tree, so it holds only for a subject checked out here: the
   default subject, with or without a path, or a pull request or branch whose head commit
   is `git rev-parse HEAD` (`gh pr view <n> --json headRefOid` prints a pull request's)
   while `git status --porcelain` prints nothing: other edits in the tree make its files
   differ from the diff under review. For any other subject the run goes on as one without
   `--fix`: say so now, with the reason.

   A repository with neither `AGENTS.md` nor `CLAUDE.md`, or with no document they route
   to, has no standard to measure against. Say so and stop here rather than paying for an
   agent run to discover it.

   Done when you can name the subject in one sentence, list the files it touches, and say
   whether `--fix` still holds.

2. **Build the two absolute paths.** `SKILL_DIR` is the **base directory for this skill**,
   given at the top of this file when the skill loads. It is absolute and install-correct.
   Both files this review needs sit at the plugin root, so the `../..` climb is correct
   here:

   - the procedure: `<SKILL_DIR>/../../references/rules-conformance.md`
   - the settled-or-open vocabulary: `<SKILL_DIR>/../../references/decision-split.md`

   ```bash
   ls "<SKILL_DIR>/../../references/rules-conformance.md" "<SKILL_DIR>/../../references/decision-split.md"
   ```

   Never `find` the plugin and never improvise either path. If a file is missing, stop and
   say the install is broken.

   Done when both paths are printed above.

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
   > `## Suggested rule additions` holds the problems no document states, each naming the
   > document that should carry it. Those are proposals for the documents, never defects
   > in the subject, and they never change the verdict.
   >
   > Tag every entry in `## Recommended actions` `settled` or `open`, leaving none
   > untagged — read `<the decision-split.md path>` for what the two mean. For each `open`
   > entry also give the question, the real options including "leave it as is" where that
   > is one, and your recommendation.

   If the **Agent** tool is unavailable, run the procedure yourself — read the step-2
   procedure path in full, apply it to the subject, produce the same sections, and state
   that the review ran inline rather than on the reviewer agent.

   Done when the review carries one of the four verdict labels and every entry in
   `## Recommended actions` is tagged `settled` or `open`. An entry the reviewer left
   untagged counts as `open`. Where the reviewer reports instead that the project has no
   standard to measure against, relay that and end the run.

4. **Relay the review.** Surface the agent's verdict and findings as it wrote them; do not
   re-derive or re-label them. Then follow `<SKILL_DIR>/../../references/decision-split.md`
   over the tagged actions — "this change" is what was reviewed. This review takes no
   `html-viz` flag, so the reference's **Without it** branch applies. With `--fix`, say
   that step 5 applies the settled batch now, in place of the reference's line on where
   the user stops it.

   Keep `## Suggested rule additions` visibly apart from the findings when you relay it.
   Merging the two is the one failure that turns this review into an ordinary code review.

   For a "did you really check X?" follow-up, **re-run the skill**; never answer from the
   review text alone.

   Done when every open item has been put to the user and the settled batch has been named.

5. **Apply the settled batch**, with `--fix` only. Without it the run ends at step 4.

   Make every change the `settled` entries of `## Recommended actions` name, as the
   reviewer stated it and nothing beyond it. The batch edits files in the working tree and
   nothing else: name a settled action of another kind — a commit message, a branch name,
   a pull request field — as not applied, with that reason. The `open` entries stay the
   questions step 4 put to the user, and `## Suggested rule additions` stay proposals.

   Where an edit was made, run every command under `## Checks run` again on the edited
   tree and report each result. A command that passed in the review and fails now goes
   first in the report: the batch stays in the tree, for the caller to correct.

   Leave the result uncommitted: the commit belongs to whoever asked for the review.

   Done when every settled action is applied, or named with the reason it was not, and
   every command under `## Checks run` has run again, with its result reported.

## Not covered

Correctness bugs, reuse, and simplification → the general code review. Whether the
documents themselves are right → `project-review-docs`. Rule debt in files this change
never touched, plus consistency, layout and architecture → `project-review-codebase`,
whose rules dimension runs this same procedure over the whole tree. Empirical test-suite
strength → `project-auto-work:test-tests`. A retrospective on one coding session →
`project-review-session`.
