# Try to break it

The point of this reference is one sentence: **try to break the system.**

The moves below are examples that prompt the instinct — not a checklist to march through. "Emoji in a name field" is one flavour of extreme input; it is not a required step. Use these as triggers, then follow the surprising result wherever it leads.

---

## Extreme input

*What happens when data is nothing like the happy path?*

- Longest string the UI/API will accept — then one character longer.
- Empty string, whitespace-only, null-equivalent, or a field left blank.
- A giant paste: thousands of characters, multiline, mixed encoding.
- Emoji, right-to-left text, combining characters, zero-width joiners.
- Numbers at the edge: 0, -1, maximum integer, a float where an integer is expected.
- Dates far in the past or future; malformed date strings; timezone ambiguity.

---

## Volume and scale

*What happens under load the happy path never tests?*

- Create hundreds of entries, then sort, search, paginate, and measure responsiveness.
- Import a large file; export all records.
- Open many tabs or concurrent sessions (if applicable).

Note: creating many records is destructive — always confirm with the user before proceeding.

---

## Order and interruption

*What happens when the expected sequence breaks?*

- Steps taken out of order: finish before starting, or skip a required step.
- Cancel mid-flow: abandon a wizard, close a modal, navigate away before saving.
- Double-submit: submit a form twice in quick succession.
- Refresh mid-operation: reload the page or restart the CLI mid-task.
- Network interruption (if applicable): pull the plug partway through a request.

---

## Empty state and first run

*What does the product look like before any real data exists?*

- A brand-new installation with no prior state — often the most neglected screen.
- A fresh account or project: are the zero-state prompts helpful?
- After deleting all records: does the UI recover gracefully or break?

---

## The unhappy path

*What happens when the user makes a mistake or the environment is hostile?*

- Wrong file type: upload a PDF where a CSV is expected, or vice versa.
- Malformed input: a JSON field that is not valid JSON, a URL without a scheme.
- Missing permissions: read-only file, locked database row, insufficient auth scope.
- No network / offline (if the product makes network calls).
- Does failure fail gracefully with a useful message, or does it crash silently?

---

## Consistency

*What happens when you look for contradictions?*

- A concept named two different ways in the UI, docs, and CLI.
- A button whose label contradicts what it does.
- Help text or a tooltip that describes the old behaviour.
- An error message that names an internal field the user never sees.
- A flow documented one way in the README and implemented differently.

---

## Why any of this matters

A finding is worth filing when the result surprises a reasonable user, contradicts the docs, or would cause data loss, confusion, or wasted time. Use FEW HICCUPPS / Test Tours vocabulary as a shared language for explaining *why* something counts: Familiarity, Explainability, World (user's mental model), History, Image, Comparable products, Claims, User experience, Product purpose, Potential, Practicability, Sensory input, and Statutes.
