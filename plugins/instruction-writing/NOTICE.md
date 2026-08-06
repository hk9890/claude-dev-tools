# Third-party notices

The following files in this plugin are derived from
[mattpocock/skills](https://github.com/mattpocock/skills), used under the MIT license:

- `skills/writing-skills/SKILL.md` — adapted from the `writing-great-skills` skill and its
  `GLOSSARY.md` at
  [v1.1.0](https://github.com/mattpocock/skills/releases/tag/v1.1.0), then largely resynced
  against that skill's successor `writing-for-agents` at
  [v1.2.0](https://github.com/mattpocock/skills/releases/tag/v1.2.0) — both that skill's
  `SKILL.md` and its `SKILL-MECHANICS.md`, unchanged upstream through v1.2.3. Nearly all of the
  body is upstream text, locally adapted and maintained since; assume any passage traces upstream
  rather than reading this as a list of the ones that do
- `references/writing-hygiene.md` — the shared hygiene rules both skills point at. Adapted from
  the same upstream skill: single source of truth and duplication, `cache`, relevance and
  sediment, no-ops, and negation all trace there, across v1.1.0 and v1.2.0
- `skills/writing-project-docs/references/project-doc-guidelines.md` — the Failure modes framing
  is adapted from the same skill. The `cache`, `Duplication` and `Sediment` material that used to
  sit here has moved into `references/writing-hygiene.md` above; what is left is locally authored

Upstream renamed that skill to `writing-for-agents` in v1.2.0, folded `GLOSSARY.md` into its
`SKILL.md`, split the skill-specific mechanics out into a new `SKILL-MECHANICS.md`, and widened
its scope to any agent-facing document. The `writing-skills` skill here keeps the skills-only
scope and holds the mechanics inline, with the other document audiences owned by
`writing-project-docs`, so the two file sets no longer correspond one-to-one.

## MIT License (mattpocock/skills)

Copyright (c) 2026 Matt Pocock

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
