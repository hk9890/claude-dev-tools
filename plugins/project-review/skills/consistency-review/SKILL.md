---
name: consistency-review
description: "This skill should be used when the user wants to review a codebase for consistency, naming coherence, or divergent patterns — e.g. 'review my codebase for consistency', 'are we doing this two different ways?', 'our naming is a mess', 'we have two HTTP clients', 'check if patterns are uniform', 'do our APIs look the same', 'is our import style consistent', or 'find drift from our conventions'. Does not apply to over-engineering review (use complexity-review), directory layout and boundary concerns (use structure-review), test quality (use test-review), or pure formatting like whitespace and bracket placement (use a linter)."
---

## Read-only contract

This review challenges and recommends. It does not edit code, rename files, or apply fixes. Every finding ends with a recommended answer, not an applied change. If you want fixes applied, take the recommended answer and act on it separately.

## Explore the codebase before asking

Before posing any question: read the actual code. Open the files in question. Count the competing implementations. Find where each pattern is used. Check whether AGENTS.md, CODING.md, or a RULES.md file documents a standard. Do not ask the user to describe their own codebase — discover it yourself, then challenge what you found.

## Interrogation procedure

Work through these questions in sequence. For each one, state the recommended answer before asking for the user's justification. If the evidence is unambiguous, deliver a verdict directly — only ask when the evidence genuinely conflicts or context is missing.

1. **Competing implementations for one concern**
   Scan for two or more libraries, classes, or modules that do the same job — two HTTP clients, two config loaders, two error-handling chains, two logging setups, two auth strategies. For each competing pair:
   - Name both implementations and where each is used.
   - State the recommended answer: _which one should win, and why_ (favour the one with more usage, better test coverage, or explicit documentation).
   - Ask: "What would it take to eliminate the minority implementation? Is there a reason it still exists?"

2. **Naming convention divergence**
   Look for inconsistent naming across the same category of thing — functions that do the same kind of work but are named differently (`getUser`, `fetch_account`, `loadProfile`); files that follow different casing or separators (`UserService.ts`, `user-service.ts`, `user_service.ts`); constants with mixed styles. For each divergence:
   - List the variants found and the files they appear in.
   - State the recommended answer: _the dominant pattern is X; the variants are deviations_.
   - Ask: "Is there a documented convention? If not, which variant should become the standard, and what prevents normalising the others?"

3. **Inconsistent API / function shapes across siblings**
   Find sibling functions, methods, or route handlers that do analogous things but have different signatures, different parameter orders, different return shapes, or different error contracts. For each group:
   - Show the divergent shapes side by side.
   - State the recommended answer: _the most common or most documented shape should be the template_.
   - Ask: "Why do these siblings have different contracts? Is the difference essential or historical accident?"

4. **Import and module convention drift**
   Check whether the codebase has a stated or dominant import convention: default vs. named exports, index-barrel re-exports vs. direct file imports, absolute vs. relative paths, import ordering. Find files that break the dominant pattern. For each violation:
   - Identify the file and the deviation.
   - State the recommended answer: _conform to the documented convention; if undocumented, conform to the majority_.
   - Ask: "Is this deviation intentional? Does it introduce any coupling or confusion that the dominant pattern avoids?"

5. **File-naming and casing drift**
   Verify that file and directory names follow one casing convention (kebab-case, PascalCase, snake_case). Note any casing inconsistencies, especially within the same directory.
   - List files that break the dominant pattern.
   - State the recommended answer: _the dominant casing is X; the deviations should be renamed_.
   - Ask: "Is there a documented convention? Are the deviations legacy or accidental?"

6. **Documented-but-ignored standard**
   Check AGENTS.md, CODING.md, and any RULES.md files for explicit standards. Look for places where the code demonstrably ignores those standards.
   - For each violation: cite the documented rule and the code that ignores it.
   - State the recommended answer: _the documented standard takes precedence; the code is wrong, not the standard_.
   - Ask: "Is this a deliberate exception (in which case document it) or an oversight?"

## Baseline rule

When a documented convention exists (AGENTS.md, CODING.md, a plugin's RULES.md), that convention is authoritative. Deviations from it are violations regardless of how many files deviate.

When no documented convention exists, the dominant pattern is the de facto standard. Flag minority deviations. Do not "fix" the majority to match a documented-but-ignored standard without surfacing the conflict first — that is a policy decision, not a mechanical cleanup.

## What this review does not cover

- Pure formatting: whitespace, indentation, bracket placement, trailing commas. These belong to linters and formatters.
- Whether the shared pattern is the right design — that is complexity-review's domain.
- Whether the directory layout makes sense — that is structure-review's domain.
- Whether tests are adequate — that is test-review's domain.

## Adversarial stance

A codebase with two ways of doing the same thing is a codebase with a hidden disagreement. Someone added the second approach without removing or replacing the first. That is a decision — or a failure to decide. Name it. Make the user justify it or commit to eliminating it.

Inconsistent naming is not aesthetic drift. It is an accuracy problem: inconsistent names suggest the things named are different when they are not, and hide real differences when names accidentally converge. Challenge each divergence.

Inconsistent API shapes between siblings are a trap for every caller. Each caller must check which shape they are calling rather than trusting the pattern. Name the trap.

Do not soften findings with "you might want to consider." State what the dominant or documented pattern is, state what the deviation is, and ask the user to justify keeping both.
