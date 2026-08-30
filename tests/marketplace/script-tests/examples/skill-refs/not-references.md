# Colon pairs that are not local skill references

Fixture for Check E. None of these name a plugin directory in this repo, so none is checked and
this file must pass.

External plugins this repo does not ship: `commit-commands:commit`, `plugin-dev:skill-reviewer`.

Colon pairs that are not references at all: `display:none` in CSS, `test:integration` as a task
name, `github:hk9890` as a mise backend, and `user:pass` in a URL.

A deliberately-wrong name, marked the way `docs/CODING.md` marks one, must stay wrong:

- ❌ `tasks:core` — bare noun, shared with no sibling
