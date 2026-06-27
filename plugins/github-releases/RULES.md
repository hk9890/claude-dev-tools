# github-releases plugin — rules and design decisions

## Skill-only, no slash command

The plugin ships a single skill (`github-releases`) and no commands. It is invoked by intent or explicitly as `/github-releases`. Do not add a slash command without a concrete reason.

## Local, human-driven release flow

The workflow this plugin drives runs **locally and is human-driven** — a person decides the version, writes the notes, and confirms readiness, with the skill orchestrating the gates and `gh` calls. It is not a CI/CD system and does not run unattended.

## CI guidance stays generic — no stack-specific pipeline config

`references/ci-pipeline-guide.md` documents how to automate the *publish* half of a release in CI, but intentionally as a **tech-agnostic map**: the decide-vs-publish split, pipeline stages described abstractly, trigger models, security hardening, and a generic checklist of the tool *categories* to find for your own stack.

The plugin deliberately does **not**:

- generate, scaffold, or commit a CI pipeline file (e.g. a workflow YAML) for any project;
- name a specific language, package manager, registry, signing tool, or CI provider;
- prescribe one stack or provider as "the" way;
- ship a copy-pasteable, full pipeline template.

Rationale: the exact pipeline is tech-, provider-, and registry-dependent, so any concrete template or named tool would be wrong for most projects and would rot quickly. The guide hands the reader a model plus the *categories* of tooling to look for; choosing and writing the actual config is the reader's job. Keep `ci-pipeline-guide.md` generic — if you find yourself naming a specific tool/registry or adding a working YAML for a specific stack, that belongs in the user's repo, not here.

The one fixed reference point is GitHub itself: the guide may mention creating the GitHub release with `gh`, because GitHub is this plugin's domain (not a stack choice). It must not name a CI provider, language, package manager, registry, or signing tool — describe their roles generically and let the reader supply the specifics.

## Project-specific commands live in the consumer's docs/RELEASING.md

The skill reads the consuming project's `docs/RELEASING.md` for real build/test/version-bump commands and never hardcodes language- or tool-specific commands in the skill itself. Keep the skill and its references language-agnostic.
