# Project understanding — <name>

Fill all seven sections. Leave a section empty only if the information genuinely does not exist after reading all available sources — do not skip for brevity.

---

## What it is

One paragraph: what the product does, who uses it, and how they interact with it.

---

## Implemented features

Bullet list of features that appear real and usable based on docs, source, and recent history. Distinguish "documented and likely working" from "present in code but not exposed".

---

## Known / likely-fragile areas

Areas worth poking first — drawn from open bugs, recent change-heavy commits, TODO comments, incomplete migrations, and anything flagged in the docs as "experimental" or "not yet". The riskiest places for a user to hit a problem.

---

## User flows discovered

The main start-to-finish paths a real user would take — from first run through typical daily use. Include the zero-state / first-run flow explicitly if it exists. Each flow is one or two sentences describing the steps and the expected outcome.

---

## Expectations to verify

Concrete claims from docs, README, or end-user documentation that the exploration should check against reality. Phrase each as a testable statement:

- "Supports CSV import from the File menu"
- "Works offline after first run"
- "Search returns results within 200 ms on a 10 k-item dataset"

---

## General context / history

Why the project exists, who it is for, notable architectural decisions, and anything that helps the explorer behave like an informed user rather than a stranger. Include: major pivots, known constraints, the intended deployment environment, and any "this is intentional" explanations that explain otherwise-surprising behaviour.

---

## Prior exploration

What recent `project-explore` sessions (within the last 14 days) already covered, so this session avoids re-treading ground and re-filing known issues.

- Areas and user flows already exercised, each with the session date.
- Finding and question task IDs still open from those sessions — these are the dedup targets when filing in Phase 2.

Write "No recent exploration sessions" if no exploration epic falls within the last 14 days.
