---
name: project-review-change
description: "Read-only adversarial review of one change against the project's own written rules: the coding, testing and layout documents AGENTS.md routes to, quoting the rule behind every finding; reports fixes, never edits."
user-invocable: true
disable-model-invocation: true
argument-hint: "[pr-number|branch|path]"
---

Read-only review of one change against **this project's own documents**. It asks a single
question: does the change do what the project wrote down that it must? The standard is
whatever `AGENTS.md` routes to — in the usual layout `docs/CODING.md`, `docs/TESTING.md`,
`docs/DOCUMENTING.md`, and the layout map they point at. Correctness bugs, design, and simplification are a
different review and are not judged here.

One adversarial agent does the whole job. There is no workflow and no level argument.

## Run the review

1. **Resolve the subject.** `$ARGUMENTS` is a pull request number, a branch name, a path,
   or empty.

   | Argument | Subject |
   |---|---|
   | empty | the uncommitted changes when the tree is dirty, otherwise the current branch against its base |
   | a number, with or without `#` | that pull request |
   | a branch name | that branch against its base |
   | a path | the same default subject, confined to that path |

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

   Then take the diff — `git diff` for a dirty tree, `git diff <base>...HEAD` for a
   branch, `gh pr diff <n>` for a pull request. Use the three-dot form for a branch so the
   comparison is against the merge base, not against whatever the base branch has since
   gained.

   **Prove the subject exists before you spawn anything.** Step 3 tells the reviewer agent
   to take the diff itself, so a ref that does not resolve or a range with no files in it
   reaches the agent as an empty subject and comes back as a confident review of nothing.
   That has to fail here instead:

   ```bash
   git rev-parse --verify --quiet "<the ref you resolved>" >/dev/null || echo "ref does not resolve — stop and ask which branch is the base"
   git diff --name-only "<the range you resolved>" | head -50
   ```

   An empty file list is not a clean review. Say the subject contains no changes, and stop.

   Done when you can name the subject in one sentence and list the files it touches.

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
   > Add one section, `## Suggested rule additions`, after `## Findings` and before
   > `## Recommended actions`. It holds the problems no document states, each naming the
   > document that should carry it. Omit the section when it is empty. These are proposals
   > for the documents, never defects in the subject, and they never change the verdict.
   >
   > Tag every entry in `## Recommended actions` `settled` or `open`, leaving none
   > untagged — read `<the decision-split.md path>` for what the two mean. For each `open`
   > entry also give the question, the real options including "leave it as is" where that
   > is one, and your recommendation.

4. **Relay the review.** Surface the agent's verdict and findings as it wrote them; do not
   re-derive or re-label them. Then follow `<SKILL_DIR>/../../references/decision-split.md`
   over the tagged actions — "this change" is what was reviewed. Done when every open item
   has been put to the user and the settled batch has been named.

   Keep `## Suggested rule additions` visibly apart from the findings when you relay it.
   Merging the two is the one failure that turns this review into an ordinary code review.

   For a "did you really check X?" follow-up, **re-run the skill**; never answer from the
   review text alone.

If the **Agent** tool is unavailable, run the procedure yourself — read
`references/rules-conformance.md` in full, apply it to the subject, produce the same
sections, and state that the review ran inline rather than on the reviewer agent.

## No standard, no review

Where the project has no `AGENTS.md` and no document it routes to, there is nothing to
measure against. Report that, and stop. Never fall back to the patterns already in the
code, and never report a rule the project has not written down.

## Not covered

Correctness bugs, reuse, and simplification → the general code review. Whether the
documents themselves are right → `project-review-docs`. Rule debt in files this change
never touched, plus consistency, layout and architecture → `project-review-codebase`,
whose rules dimension runs this same procedure over the whole tree. Empirical test-suite
strength → `project-auto-work:test-tests`.

**This review never edits.** Every finding is a report the developer acts on.
