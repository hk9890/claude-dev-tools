---
name: kiss
description: "KISS — challenge accidental complexity in whatever is in front of you and propose the simpler form."
user-invocable: true
disable-model-invocation: true
argument-hint: "[what-to-challenge]"
---

# KISS

What to challenge: $ARGUMENTS. If no argument is given, challenge the artifact currently under
discussion, and say which one you took it to be.

Every layer, abstraction, dependency, flag, and option is **guilty until proven necessary** — the
burden sits on the addition. Ask the user when something is unclear, and apply the simplification
once it is agreed.

## Route

Read the matching file, and only that one. A target spanning two rows reads both.

| Target | Read |
|---|---|
| requirement, scope proposal, feature request, acceptance criteria | [references/requirements-analysis.md](references/requirements-analysis.md) |
| design, component structure, dependency choice, service boundary, integration plan | [references/architecture-analysis.md](references/architecture-analysis.md) |
| implementation, diff, pull request | [references/code-analysis.md](references/code-analysis.md) |

## Stance

**Essential or accidental.** Essential complexity comes from the problem; **accidental complexity**
(Brooks) is self-inflicted. Separate them first. Smells: machinery serving machinery; code that
**complects** — interleaves what should stand apart.

**The addition carries the burden.** What pain does it solve *now*, and what breaks without it?
**YAGNI**; abstract on the third repeat, not the first (**Rule of Three**). Smells: optionality with
no caller; configuration standing in for a decision; a dependency bought for convenience.

**Model before machinery.** Complicated logic usually means the model underneath is wrong — show me
your tables and I won't need your flowcharts. Smells: components named before the model is clear;
code compensating for a weak model; proposals resting on unverified assumptions.

**One engineer, whole system.** Intent should read without decoding, and a module's interface should
be smaller than its implementation — a **shallow module** that renames and forwards has earned
nothing. Write it as cleverly as you can and you are, by definition, not smart enough to debug it.
Smells: non-local rules, hidden state, indirect control flow, tribal knowledge as a prerequisite.

**Keep what works working.** *Don't break userspace.* A simplification that shifts cost onto users is
not one. Smells: casual public-contract changes; migration left unstated.

**Missing justification is itself a defect.** Smells: hand-wavy rationale; future-proofing with no
concrete scenario; fluency mistaken for soundness.

When complexity has compounded, propose the redesign, not another patch.

## Propose

Name the complexity, say what it buys and what it costs, give the simpler form, offer to apply it.
Follow the recommendation order in the file you read; `accept` is the last rung, not the default.
Talk it through — this is not a report.

**Done when** every layer, abstraction, dependency, flag, and option the target adds is named, and
each is justified in a sentence or paired with a concrete simpler form. General observations are not
done.
