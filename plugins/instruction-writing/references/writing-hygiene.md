# Writing hygiene

The rules for keeping an agent-facing document lean, shared by `writing-skills` and
`writing-project-docs`. It sits at the plugin root rather than inside either skill because both
reach it and neither owns it.

Every lever here binds any document an agent reads — a `SKILL.md`, an `AGENTS.md`, a topic doc, a
reference file. Where a skill names one of these ideas in its own vocabulary, that naming governs
its own artifact; this file is the definition underneath.

## Single source of truth

Keep each meaning in one authoritative place, so changing the behaviour is a one-place edit.

**Duplication** — the same meaning in more than one place — is the violation. It costs maintenance
(correct one copy and you must find the others), costs tokens, and inflates the meaning's
prominence past its real rank. It binds hardest inside a single file, where the same rule restated
two sections apart reads as two rules.

Duplication is the accidental inverse of a **leading word** — a compact concept from the model's
pretraining that a document repeats as a token to anchor a region of behaviour. That repeats a
token on purpose, never the meaning.

## Cache

The environment is a source of truth too — `package.json` scripts, task-runner definitions, config
files, the directory layout, `--help` output. A document that restates one is a **cache** of a
lookup: a copy that earns its load only when the lookup is expensive, and that goes stale the
moment the source moves.

Cache what the agent cannot get by looking — the unwritten convention, the reason behind a choice,
the gotcha no config confesses, which of two commands to reach for. Leave the one-file,
one-command lookups to the environment, where they cannot drift.

## Relevance

Check every line for relevance: does it still bear on what the document does? A line loses
relevance either by never bearing on the task — mere exposition, or a branch that should sit
behind a pointer — or by going stale as the behaviour it describes changes. Shorter documents are
easier to keep relevant, because each line is cheaper to check.

**Sediment** is the failure here: stale layers that settle because adding feels safe and removing
feels risky, until you must core down through them to find what is still live. The default fate of
any document without a pruning discipline.

## No-ops

An instruction the model already obeys by default pays load to say nothing. The test — does this
line change behaviour versus the default? — is model-relative, not reader-relative: two people
disagreeing about a no-op disagree about the default, and settle it by running the document rather
than by debate. A line can be perfectly relevant and still be a no-op.

Hunt them sentence by sentence, and when one fails, delete the whole sentence rather than trim
words from it.

The same test grades **leading words**: a word too weak to beat the default (_be thorough_, where
the agent is already thorough-ish) is a no-op, and the fix is a stronger word (_relentless_), not a
different technique.

## Negation

Steering by prohibition drags the forbidden behaviour into context and makes it _more_ available,
not less. _Don't think of an elephant_, and the elephant is all there is: the negation is a weak
modifier that the strongly-activated concept overruns, so the ban half-reads as an instruction to
do the thing.

Prompt the **positive** — state the target behaviour ("write one-line comments") so the banned one
is never spoken. A prohibition earns its place only as a hard guardrail you cannot phrase
positively; even then, pair it with the positive target so attention lands on what to do.
