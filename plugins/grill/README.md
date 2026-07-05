# grill

An adversarial stress-test you can invoke any time. Point it at a plan, a design, a
change, a decision, or a bare idea, and it generates a sheet of pointed questions — each
with a committed recommended answer and a source — then walks them with you one at a
time and closes on a `clean` / `needs-answers` gate.

Read-only and project-agnostic: it challenges, it never edits, and it works whether or
not there is a project around the idea.

## When to use it

Reach for grill before you commit to something and want it challenged: "grill me on
this", "poke holes in this design", "challenge this plan", "stress-test this approach",
"what am I missing?", "talk me out of this".

It is a **discussion**, not a written report. For a post-hoc audit of existing code or a
whole-project review, use the `project-quality` reviews instead; grill is
forward-looking and interactive.

## How it works

1. The `grill` skill (main loop) spawns the `challenger` agent in an isolated context.
2. The challenger explores the evidence — the plan, and any project code and docs — then
   produces an ordered grill sheet grounded in a generic value base.
3. The skill walks the sheet with you one question at a time (Accept / Override /
   Defer), dropping questions a scope decision makes moot, and ends on the gate.

## The value base

The challenger argues from `skills/grill/references/principles.md` — a generic
critical-engineering value base in two families: **simplicity** values (is this worth
its cost?) and **risk** values (what happens when it is wrong? — failure modes, blast
radius, reversibility, testable success criteria, hidden assumptions). When a project
doc settles a question, that doc wins; when none does, the value base breaks the tie.

The simplicity half is **derived** — paraphrased and condensed — from `project-quality`'s
complexity-review principles (a 6-of-11 subset); both descend from the same lean-systems
ideas. The two are kept as separate files rather than a shared import because each plugin
installs independently, so a reword of the canonical lean-principles will **not** propagate
automatically — keep the two conceptually aligned when either side changes. grill's set
adds the risk lenses a pre-commitment stress-test needs and that a complexity review does not.

## Structure

```
grill/
├── .claude-plugin/
│   └── plugin.json
├── README.md
├── RULES.md                  (design decisions — read before changing)
├── agents/
│   └── challenger.md         (adversarial challenger persona + grill-sheet contract)
└── skills/
    └── grill/
        ├── SKILL.md          (main-loop orchestrator: generate sheet → walk → gate)
        └── references/
            └── principles.md (the critical-engineering value base)
```
