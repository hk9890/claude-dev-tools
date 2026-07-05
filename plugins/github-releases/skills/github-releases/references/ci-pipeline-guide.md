# CI Release Pipeline Guide

Guidance for automating the *publish* half of a release in CI. The rest of this
plugin covers the local, human-driven flow; this complements it.

**Scope:** this file is a tech-agnostic *map* — it describes the pipeline as
abstract stages and the principles behind them. It names no language, package
manager, registry, signing tool, or CI provider, and ships no copy-pasteable
config, because the exact pipeline is tech-, provider-, and registry-dependent
and intentionally out of scope. Use it to understand *what* a release pipeline
must do, then look up the concrete tooling for your own stack.

## Core principle: decide vs publish

Split a release into two responsibilities and put each where it belongs.

| Phase | What it is | Who/where |
| --- | --- | --- |
| **Decide** | Version, notes, "is it ready?" — human judgment | Person, locally |
| **Publish** | Build, sign, upload, create release — mechanical | CI, automatically |

Decide stays local — see [release-workflow.md](release-workflow.md),
[version-management.md](version-management.md),
[release-notes-guide.md](release-notes-guide.md). Publishing belongs in CI (below).

## Pipeline anatomy

A release pipeline is a linear sequence of stages. Each fails closed: a red
stage stops the release. Treat this as the backbone and adapt it to your stack.

1. **Trigger** — what kicks off the publish (see *Trigger models*).
2. **Clean checkout** — fresh checkout at the released commit. No reused
   workspace, no local cruft. This is what makes the build reproducible.
3. **Set up & pin the toolchain** — install the exact build/runtime versions
   (pinned, not "latest") so the artifact is reproducible across runs and machines.
4. **Restore dependencies** — install from a lockfile; cache by a content key to
   speed it up without changing what gets installed.
5. **Quality gates** — run tests, build, lint. The same gates as the local
   pre-flight (see [quality-gates.md](quality-gates.md)); a clean environment can
   catch what a developer machine hid.
6. **Build artifacts** — produce the distributable(s) your project ships.
7. **Sign + attest provenance** — sign the artifacts and emit a provenance
   attestation so consumers can verify their origin (see *Security hardening*).
8. **Publish to the registry** — upload to wherever consumers fetch from,
   ideally via a short-lived exchanged identity rather than a stored token.
9. **Create / update the GitHub release** — `gh release create <tag>` with the
   notes and any artifacts attached (see [release-notes-guide.md](release-notes-guide.md)).
10. **Post-publish verification** — smoke-test the *published* artifact: fetch it
    fresh from the registry and run a trivial check.

**Fail closed.** Any stage failing must stop the publish — never ship a partial
release. Order irreversible steps (the registry upload) as late as possible, so a
failure before them costs nothing.

**Re-runs & recovery.** Registry publishes are usually irreversible — most
registries reject a duplicate version, so a naive re-run fails on the
already-taken version rather than doing nothing. Make re-runs safe by guarding or
skipping versions that are already published, and recover from a partial publish
by cutting a new patch version — never by overwriting. Validate the whole pipeline
with a dry-run, a staging/test registry, or a prerelease tag before the first real
publish. See [troubleshooting.md](troubleshooting.md) for publish failures.

## Why publishing belongs in CI

- **Reproducibility** — clean checkout + pinned toolchain beats "works on my
  machine"; the artifact derives only from the released commit.
- **Secrets handling** — credentials live in the CI secret store, scoped to the
  job, not in a developer's shell history. Prefer a short-lived exchanged identity
  so no long-lived token exists at all.
- **Provenance & signing** — CI can attest *what built this, and from which
  commit* in a way a manual upload cannot.
- **Auditability** — every publish is a logged run tied to a commit, an actor,
  and an environment; reverting and forensics become trivial.

## Trigger models

| Model | How it fires | Trade-off |
| --- | --- | --- |
| **Tag-triggered** | Push `vX.Y.Z` → CI publishes | Simplest; the tag *is* the decision. |
| **Release-PR merge** | Merge a "version PR" raised by automation | Notes/version reviewed in a PR; needs the automation set up. |
| **Manual dispatch** | Start the pipeline by hand | Full human control; easy to forget or mis-trigger. |

Two common automation styles: one accumulates changes into a standing "version
PR" that tags and publishes when merged; the other publishes directly on push,
deriving the version from commit history. Tag-triggered pairs most cleanly with
this plugin's local flow.

**Caveat:** on many CI platforms a tag pushed by the pipeline's own default
identity will *not* trigger a second workflow (a recursion guard). If you chain a
tag push into a publish run, use a separate token/identity or an explicit
release/dispatch event.

## Choosing tooling for your stack

This guide stays tech-agnostic on purpose. To make it concrete, find the
equivalent of each of these in *your* ecosystem and CI provider:

- a **build / publish** step that produces and uploads your distributable;
- a **signing / provenance** mechanism (your registry's, or a standalone one);
- optionally, **release automation** (version-PR or commit-driven) if you don't
  want to tag by hand;
- your CI provider's mechanism for **short-lived publish credentials** and
  **per-job least-privilege permissions**.

Consult your language's packaging docs and your CI provider's docs for the
specific commands — they change often, so verify current best practice rather
than copying a snippet.

## Security hardening checklist

- [ ] **Short-lived over long-lived credentials** — use exchanged, per-run
      identities instead of stored long-lived registry tokens where supported.
- [ ] **Least-privilege CI token** — default the pipeline's auto-provided token
      to read-only, and grant write/identity scopes only on the publish job.
- [ ] **Pin third-party CI steps by an immutable version**, not a moving tag.
- [ ] **Protected publish environment** — required reviewers and/or protected
      tags, so a tag push alone cannot ship unreviewed.
- [ ] **No secrets to forks** — never expose publish secrets to runs triggered by
      forked pull requests; gate publish on the trusted branch/tag.
- [ ] **Verify provenance is consumable** — confirm a downstream verification of
      your signatures/attestations actually passes.

## When CI publishing is NOT needed

If a release produces **no downloadable artifact** — a docs site, a metadata-only
tag, or a Claude Code plugin marketplace where the "release" is just a version
bump and a tag — there is nothing to build, sign, or upload. The local flow in
this plugin is sufficient. CI's job is then narrower: run the quality gates on
every PR so the default branch stays releasable. Don't build a publish pipeline
for a release that publishes nothing.

## Handoff from the local flow

The local flow (see [release-workflow.md](release-workflow.md)) owns **decide +
gates + tag/notes**. Pushing the tag is the handoff: it fires the CI publish.

- Local gates stay valuable as a fast pre-flight — fail before you tag, not after
  CI does.
- Keep the tag the single source of truth: the same `vX.Y.Z` drives the local
  notes and the CI publish.
- If CI owns release-note generation, have the local flow stop at the tag and let
  CI create the GitHub release — don't do it in both places.
