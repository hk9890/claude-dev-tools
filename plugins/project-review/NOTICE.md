# Third-party notices

The following file in this plugin is derived from
[mattpocock/skills](https://github.com/mattpocock/skills) (the `codebase-design`
skill), used under the MIT license:

- `skills/project-review-codebase/references/design-vocabulary.md` — adapted from
  [v1.1.0](https://github.com/mattpocock/skills/releases/tag/v1.1.0), unchanged
  upstream through v1.2.3; its terms trace to Ousterhout and Feathers

`skills/project-review-codebase/workflows/review-codebase.js` borrows from the same source twice:

- its `dependency_category` enum and the prose describing it rename the four categories in that
  skill's `DEEPENING.md` at v1.1.0
- its churn weighting follows the YAGNI filter added to upstream's
  `improve-codebase-architecture` skill in
  [v1.2.0](https://github.com/mattpocock/skills/releases/tag/v1.2.0)

`skills/project-review-session/SKILL.md` is adapted from the `retro` skill of the same source at
commit [`d81f3a1`](https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/retro/SKILL.md):
the text is upstream's, with the frontmatter, the style-guide skills it names, and the name of
the coding-standards document changed to fit this plugin. Upstream's step 1, which loads its
style guide, is removed, and the step that reads the session names `$ARGUMENTS`.

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
