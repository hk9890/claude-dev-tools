# External tooling suggestions for claude-dev-tools

Date: 2026-07-10. Claude Code CLI v2.1.206.
Every claim below marked "verified" was checked against this working tree or by running the tool, not read off a doc page.

---

## 1. What you already have

The validation stack is layered and, for a plugin marketplace, above average. CI runs five jobs — `test`
(`bash tests/run-all.sh`), `consistency` (`scripts/check-internal-consistency.py`), `manifests` (`jq empty` over every
manifest), `shellcheck --severity=warning`, and `gitleaks` — plus `codeql.yml` and `dependabot.yml`. Secrets, static
analysis, dependency updates, shell correctness, and cross-reference integrity are all covered. Nothing recommended below
duplicates them.

On top of that you ship an in-house review suite that already does what most external review plugins would:
`project-quality` (10 review skills), `grill` (adversarial challenge), `project-explore`, `tasks`, plus
`scripts/analyze-sessions.py`. And the harness gives you `/code-review`, `/simplify`, `/security-review`, `/loop` for free.

The repo is markdown + bash + python, deliberately skills-only (zero `commands/`, no MCP, no LSP, no TypeScript). That fact
alone eliminates most candidate tooling.

## 2. The gaps, ranked by the failure each lets through

1. **Zero behavioral evals across all 8 plugins.** Nothing proves a skill fires on its trigger phrases. Concretely: edit
   `project-review-complexity`'s description, and `project-review-tests` starts firing instead — every deterministic check
   stays green. This is the biggest gap and it lands hardest on `project-quality`, whose five model-invocable review skills
   have long, overlapping descriptions.
2. **3 of 8 plugins have no tests** — `github-releases`, `grill`, `keep-awake-linux`, `project-explore`. Sharpest case:
   `keep-awake-linux` ships five lifecycle hooks driving `systemd-inhibit` with zero tests. A broken hook ships silently.
3. **`jq empty` is well-formedness, not schema validation.** It parses JSON; it never checks required fields, field types,
   or SKILL.md frontmatter. A missing `description` — which silently kills triggering — sails through.

Secondary: 1,664 lines of CI-gating Python are unlinted (verified: `wc -l scripts/*.py`); the inline bash inside
`ci.yml` is unreachable by the `*.sh`-scoped shellcheck job; `mise run lint` is a placeholder that echoes
"No linter configured"; ~2,514 always-on tokens/session (§5).

## 3. Adopt

**1. `claude plugin eval` — behavioral routing tests [official].** Closes gap #1. Already in your CLI. No `evals/` dir
exists anywhere today.

```
claude plugin eval init project-quality
claude plugin eval project-quality --json --threshold 0.9 --output-dir evals/results
```

`--ablation with-without` adds a no-plugin baseline arm and reports the score delta. Catches "asked for a complexity
review, `project-review-tests` fired."

**Caveat the research memo underplayed:** unlike `validate`, `eval` *runs the model*. In CI it needs credentials and spends
tokens on every PR. Budget it, or run it on a schedule / label rather than per-push.

Companion, already installed: `skill-creator`'s `improve_description.py` tunes a description against an eval set with a
held-out split. Use `eval` as the gate, `skill-creator` to author fixtures.

**2. `claude plugin validate --strict` in CI [official].** Closes part of gap #3.

Verified: passes all 8 plugins and the marketplace manifest today (safe ratchet); does validate SKILL.md frontmatter (a
removed `description` produces a warning); `--strict` exits 1 on warnings, bare `validate` exits 0; and it runs with an
empty `HOME` and no API key, so it needs no credentials in CI.

Verified limit: it does **not** flag unknown/typo'd frontmatter keys — an injected `bogus_field: 1` passed silently. That
residual is item 4.

**3. `ruff` [community — astral-sh/ruff, 48.5k★, last commit 2026-07-10].** Lints the 1,664 lines of Python that gate CI
and retires the placeholder `lint` task.

```toml
# .mise.toml
[tools]
ruff = "latest"

[tasks.lint]
description = "Lint Python (ruff)"
dir = "{{config_root}}"
run = "ruff check ."
```

**4. Vendored strict manifest schema via `check-jsonschema` [community — python-jsonschema/check-jsonschema, 325★, last
commit 2026-07-07].** The only approach that closes the typo'd-key gap both `jq empty` and `validate --strict` miss.

Verified: SchemaStore publishes `claude-code-plugin-manifest.json` (HTTP 200 after redirect; 22 properties), and its root
object has **no** `additionalProperties` — so it too accepts unknown keys. Vendor a copy, add `"additionalProperties": false`
to the root, validate against the local copy.

```
curl -sSL https://json.schemastore.org/claude-code-plugin-manifest.json -o schemas/plugin.strict.json
# hand-add "additionalProperties": false to the root object
pipx run check-jsonschema --schemafile schemas/plugin.strict.json plugins/*/.claude-plugin/plugin.json
```

Cost: the vendored copy drifts when Claude Code adds a manifest field. Re-pull and re-apply the one-line delta periodically.

**5. `actionlint` [community — rhysd/actionlint, 4.0k★, last commit 2026-04-19].** Your shellcheck job globs
`git ls-files '*.sh'`, so the inline bash in `ci.yml`'s `manifests` job is structurally unreachable. `actionlint` validates
workflow schema and `${{ }}` contexts, and runs shellcheck over inline `run:` blocks. Chain it: `run = ["ruff check .", "actionlint"]`.

## 4. Skip, and why

**Community SKILL.md linters — all of them.** `himself65/skill-lint`, `agent-ecosystem/skill-validator`,
`MukundaKatta/claude-skill-check`, `olgasafonova/SkillCheck-Free`, `felixgeelhaar/cclint`. Common defeater, verified against
this tree: every one hard-codes a ~6-key frontmatter allowlist (`name`, `description`, `license`, `allowed-tools`,
`metadata`, `compatibility`). Your 21 SKILL.md files intentionally use six non-spec keys — `argument-hint` (15×),
`user-invocable` (12×), `disable-model-invocation` (11×), `when_to_use` (9×), `context` (4×), `agent` (4×). They would error
on essentially every skill you ship, and none supports a custom allowlist. `skill-validator`'s `--allow-extra-frontmatter`
is all-or-nothing, which kills the typo detection that was the whole point. `claude-skill-check`'s secret scan duplicates
gitleaks. The one real gap (typo'd keys) is closed cheaper and false-positive-free by §3 item 4.

**Official plugins that duplicate your own work:** `code-review` and `code-simplifier` (same lineage as the built-in
`/code-review` and `/simplify`, and `code-simplifier` duplicates `project-review-complexity`); `pr-review-toolkit` (5 of 6
agents duplicate `project-quality` or built-ins; `type-design-analyzer` is dead weight with no TypeScript);
`claude-md-management` (`project-review-docs` already audits AGENTS/CLAUDE staleness across more files); `feature-dev` (you
compose this from `project-explore` + `tasks` + `grill`); `security-guidance` (its bash/python-applicable classes are
already covered by gitleaks + codeql + `/security-review`; the XSS/SSRF/SQLi classes don't exist here); `hookify` (its
warn/block pattern model can't express `keep-awake`'s stateful lifecycle hooks); `claude-code-setup` (recommends the
MCP/command categories you deliberately reject); `ralph-loop` (overlaps built-in `/loop`); `playground` and
`project-artifact` (same domain as your `html-visualization`); `code-modernization`, `math-olympiad` (off-domain).

**`json-schema-diff` tools — category error.** They diff two *schemas*, not two data *instances* like `plugin.json`. Your
real breaking surface (skill/agent names) lives in directories, not manifest metadata. If you want release-drift protection,
add a ~30-line surface-snapshot check to `check-internal-consistency.py`: emit sorted plugin+skill+agent+hook names,
`git show <prev-tag>:` the same, warn on a disappearance. No dependency needed.

**Other generic devtools — not now.** `markdownlint-cli2` / `remark-lint` (default rules fight hand-authored instructional
prose), `mypy` (near-zero return until ~1,600 lines are annotated), `zizmor` (only two already-hardened workflows;
`actionlint` is the better spend), `shfmt` (format-only; shellcheck guards correctness), `Vale` (heavy config, low return on
terse trigger descriptions), `pre-commit` (a second orchestrator alongside `mise`).

## 5. The token-cost finding

Verified via `claude plugin details`: `project-quality ~1,386`, `tasks ~332`, `grill ~319`, `html-visualization ~240`,
`keep-awake-linux ~182`, `project-explore ~55`, `claude-catppuccin ~0` — **~2,514 tokens on every session** before anything
fires. "Always-on" is the plugin's listing text (skill/agent descriptions + `when_to_use` + names), so the lever is textual.

1. **Attribute it.** Verified: `project-quality`'s five exec/orchestrator skills already carry
   `disable-model-invocation: true` — correctly done, no action. The remaining ~1,110 tokens are the five model-invocable
   dimension skills (`project-review-complexity`, `-consistency`, `-docs`, `-structure`, `-tests`), which must stay
   auto-routable.
2. **Shorten their `description` + `when_to_use`.** Each runs ~160–250 always-on tokens. Cut the "Not for X — each has its
   own skill" boilerplate that repeats verbatim across all five; keep the "Triggers on …" phrases. Re-run
   `claude plugin details` to confirm the drop, then `claude plugin eval` to confirm routing is unchanged.
3. **Audit the other seven plugins** for pure-action skills still exposing a description to the model:
   `grep -L 'disable-model-invocation' $(find plugins -name SKILL.md)`.
4. **`defaultEnabled: false`** on heavy opt-in plugins (`grill`, `keep-awake-linux`) in `.claude-plugin/marketplace.json`
   ships them installed-but-disabled for *consumers*. It does **not** cut your own sessions unless you disable them locally.
   It's a distribution-policy choice, not a same-session saving.
5. **Tune, don't guess** — `skill-creator`'s `improve_description.py` picks a shortened description by test score rather
   than by eye.

There is no `--json` on `claude plugin details`, so a CI token-budget gate must scrape stdout.

## 6. First move (today)

Replace the well-formedness-only `manifests` job with real schema validation. It passes on all 8 plugins today, so it lands
green as a ratchet, and it immediately catches the missing `description` that `jq empty` cannot see.

**Note:** `.mise.toml` currently has no `[tools]` section, so the runner has no `claude` binary. The install step is
required — the obvious snippet without it fails.

```yaml
  manifests:
    name: manifests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Install Claude Code
        run: npm install -g @anthropic-ai/claude-code@2.1.206
      - name: Validate manifests + SKILL.md frontmatter (schema, strict)
        run: |
          set -euo pipefail
          for p in plugins/*/; do
            echo "validating $p"
            claude plugin validate "$p" --strict
          done
          claude plugin validate .claude-plugin/marketplace.json --strict
```

Alternatively keep the `jdx/mise-action@v4` pattern and add the binary to `.mise.toml`:

```toml
[tools]
"npm:@anthropic-ai/claude-code" = "2.1.206"
ruff = "latest"
```

No credentials needed — verified that `validate --strict` runs with an empty `HOME` and no API key.

Then, same sitting: `claude plugin eval init project-quality` to start on the real gap, and wire `ruff check .` into
`[tasks.lint]` to retire the placeholder.

---

## Appendix: corrections applied to the research output

- The research memo's headline CI snippet used `jdx/mise-action@v4` and then called `claude`. Verified that `.mise.toml`
  declares no `[tools]`, so no `claude` binary would exist on the runner. Install step added above.
- The memo called `claude plugin eval` "CI-gateable" without noting it invokes the model, so it needs credentials and spends
  tokens per run. `validate` does not. Flagged in §3.
- The memo's claim that community linters "would ERROR on this repo's 21 SKILL.md files" was checked and holds: 21 files,
  six non-spec keys in active use.
- SchemaStore's `claude-code-plugin-manifest.json` was fetched (200, 22 properties) and confirmed to omit
  `additionalProperties`, so the vendored-strict-copy recommendation stands.
