---
name: what-do-you-mean
description: "Re-pitch a message that did not land — 400 words, plain language, every label spelled out."
user-invocable: true
disable-model-invocation: true
argument-hint: "[what-did-not-land]"
---

What did not land: $ARGUMENTS. With no argument, your last message, whole.

Pitch it again from the top. Not a summary of it, and not the same words slower — say what
you were trying to say to someone who has just walked in.

## The re-pitch

**Context before the point.** Open with a sentence on where we are and what we are trying
to do. The message failed because it assumed a place in the argument the user is not
standing in, so supplying that place comes first.

**ASD-STE100.** Write in Simplified Technical English: one meaning per word, one idea per
sentence, short sentences, active voice, present tense.

**The project's own words.** Speak the **ubiquitous language** the project already has —
the domain terms in whichever of `CONTEXT.md`, `AGENTS.md`, `CLAUDE.md` or the README it
keeps, and the names its own identifiers use. A term the user coined beats one you coined.

**Every name resolves in place.** Say what the thing is. A label carries the reader only
once the thing behind it has been described.

| Written as | Lands as |
|---|---|
| option A | the shared-database option |
| decision A23 | the decision to keep sessions in Redis |
| §2, the second rule | the rule that every step ends on a completion criterion |
| #412 | the ticket about the login timeout |
| as discussed above | the claim itself, said again |

Where a label is worth keeping for later use, introduce it once — "the shared-database
option (A)" — and use the words from then on.

**400 words.** That is the budget, and spelling names out is what you spend it on: drop a
point rather than shorten a name.

## The closing line

Every re-pitch ends on one line naming what the cap cost, then the command for the page
where the room is — "I left out the migration path and the rollback story. For the long
form:", followed by the command in full.

Offer the page, never open it. Whether the 400 words landed is the one thing you cannot
tell from here, and a page built for a re-pitch that already worked is exactly the noise
this skill exists to remove — so print the command and leave the call with the user.

The page needs the separate `html-visualization` plugin, which is not a dependency of this
one; `html-visualize-feedback` in your own available skills is the check. Without it, name
the dropped points and stop — the 400 words stand alone.

The subject and the brief — [`references/html-explanation.md`](references/html-explanation.md),
which carries what an explanation page must contain — both ride in the argument, so the
command still works in a fresh turn:

```
/html-visualization:html-visualize-feedback explain <subject> — follow the brief at <base directory for this skill>/references/html-explanation.md; it is instructions for the page, not content to typeset
```

Print the resolved absolute path in place of the placeholder.

**Done when** the re-pitch is under 400 words, every label in it has been said in full, and
the closing line names what was dropped.
