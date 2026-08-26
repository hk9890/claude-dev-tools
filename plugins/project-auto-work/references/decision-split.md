# Settled and open

Both skills here classify what a run proposed into two kinds, and relay them the
same way. This file governs that for `project-auto-work`; each skill's workflow
owns only what the line means in its own domain.

`project-review` carries its own copy of the same vocabulary, because plugins
install independently and neither can reach the other's files. Changing what
settled or open *means* is a two-file edit, in both plugins, or they drift.

| Kind | What it is |
|---|---|
| **settled** | One correct answer, and no consequence anyone could reasonably weigh differently. Just do it. |
| **open** | A competent person could answer differently — it changes a name people type, picks between conventions the project already uses, trades one cost against another, or is big enough that "not now" is a real answer. Ask. |

The workflow assigns this, not the relay. Carry each proposal into the group the
report put it in.

Two things are open by construction, whatever the tag says: `test-app`'s
`questions[]`, which exist because the run could not settle them, and any
`test-tests` proposal resting on a `candidate: true` finding — a possible
equivalent mutant or a legitimate latency contract is exactly the call a human
has to make.

## Relaying

Relay the two groups separately: the settled ones as a batch, the open ones as
questions carrying their `options` and `recommendation`.

Neither skill acts on either group. The report names the work; what happens next
is the user's to say, in the same way they would answer any other message.

## The browser form

Reach for it only when `html-viz` was passed. The terminal relay and the saved
report happen first and in full either way, so the form adds a surface and takes
nothing away — a missing plugin, an absent Node, or a closed tab leaves the user
exactly where the skill would have left them anyway.

With the flag set, invoke `html-visualization:html-visualize-ask` through the
`Skill` tool, passing the open items and naming what was run:

```
the <N> open decisions from <the test-app run|the test-suite audit> — the settled proposals are already agreed
```

Invoking it in this turn is what keeps the report in context when the answers
come back, so the picks read as the reply the user would otherwise have typed.

The check is whether `html-visualize-ask` appears in your own available skills —
invoke it only then. It ships in the separate `html-visualization` plugin, which
is not a dependency of this one, and it is missing from that list for either of
two reasons: the plugin is not installed, or it is installed at a version whose
ask mode is user-only and so unreachable by the `Skill` tool. Say which of those
you can tell, then put the same questions in chat. Never reconstruct the form by
other means — a user-only skill is reserved for the user typing its name.

Either way, say plainly that the settled batch is not among the questions. A
settled proposal is one the user never saw a question about, so one filed wrongly
is one they never hear of at all — naming the batch is what keeps that
recoverable.
