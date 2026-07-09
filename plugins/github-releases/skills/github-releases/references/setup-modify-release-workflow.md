# Setup or Modify Release Workflow

Guide for creating or updating `docs/RELEASING.md`.

## Overview

**Step 1:** Check if `docs/RELEASING.md` exists
- If **NO** → Run **Creation Process**
- If **YES** → Run **Update Process**

## RELEASING.md Required Sections

The file MUST contain these sections:

1. **Build** - How to build the project
2. **Tests** - All test commands (unit, integration, e2e)
3. **Version Files** - Which files contain version numbers
4. **Release Steps** - Exact commands to release
5. **Verification** - How to verify release succeeded

Optional but recommended:
- Prerequisites (dependencies, auth setup)
- Pre-Release Checklist
- Post-Release Steps
- Rollback Procedure

## Creation Process

### 1. Analyze Project

Detect project characteristics:

```bash
# Check build system
[ -f package.json ] && echo "npm/node project"
[ -f Cargo.toml ] && echo "Rust project"
[ -f go.mod ] && echo "Go project"
[ -f pyproject.toml ] && echo "Python project"

# Find test commands
grep -E "test|spec" package.json 2>/dev/null
ls -la tests/ test/ __tests__/ 2>/dev/null

# Find build commands
grep -E "build|compile" package.json 2>/dev/null
ls -la Makefile CMakeLists.txt 2>/dev/null

# Find version locations
grep -r "version" package.json setup.py pyproject.toml Cargo.toml 2>/dev/null
```

### 2. Determine Required Information

For each section, identify:

**Build:**
- What command builds the project?
- What output is produced?
- Are there build variants (debug/release)?

**Tests:**
- What are ALL test commands?
- Unit tests command?
- Integration tests command?
- E2E tests command?
- Do all tests need to pass?

**Version Files:**
- Which files contain version numbers?
- How to update them (manually or via tool)?

**Release Steps:**
- Is there a GitHub Actions workflow?
- Manual release commands?
- Where is package published (npm/crates.io/PyPI/etc)?

**Verification:**
- How to check release succeeded?
- How to test installation?

### 3. Ask User for Confirmation

**Present findings to user:**

```
I analyzed the project and found:

Build: npm run build (creates dist/ directory)
Tests:
  - Unit: npm test
  - Integration: npm run test:integration
  - E2E: (none found)

Version Files:
  - package.json
  - src/version.ts (contains VERSION constant)

Release: GitHub Actions workflow detected (.github/workflows/release.yml)

Publish: npm registry

Does this look correct? Should I:
1. Add/modify any commands?
2. Include additional test suites?
3. Add other version file locations?
```

**ONLY proceed if user confirms accuracy.**

If user says something is wrong or missing, ask for corrections. Where several candidates
exist — two build commands, a handful of test scripts — ask which one the release uses
rather than picking one yourself.

### 4. Create RELEASING.md

Write `docs/RELEASING.md` with confirmed information.

### 5. Verify Information

Execute every command you documented. A release guide nobody ran is worse than no guide,
because the next release will trust it:

```bash
# Verify build works
<build-command>  # e.g., npm run build
# Check: Did it succeed? Output created?

# Verify tests work
<test-command>   # e.g., npm test
# Check: Do tests run? What's the result?

# Verify version files exist
ls -la <version-files>  # e.g., package.json src/version.ts
# Check: Do files exist?

# Verify workflow exists (if applicable)
ls -la .github/workflows/release.yml
# Check: Does file exist?
```

**If ANY verification fails:**
1. Report to user what failed
2. Ask how to fix it
3. Update RELEASING.md with correct information
4. Re-verify

**Only mark complete when all commands execute successfully.**

## Update Process

### 1. Check Current RELEASING.md

Verify all required sections exist:

```bash
# Check for required sections
grep -i "## Build" docs/RELEASING.md
grep -i "## Test" docs/RELEASING.md
grep -i "## Version" docs/RELEASING.md
grep -i "## Release" docs/RELEASING.md
grep -i "## Verif" docs/RELEASING.md
```

### 2. Verify Current Information

**Execute all commands in RELEASING.md:**

```bash
# Run build command from RELEASING.md
<build-command-from-file>
# Check: Does it still work?

# Run ALL test commands from RELEASING.md
<test-command-from-file>
# Check: Do they still work? Are there new tests not documented?

# Check version files from RELEASING.md
<version-files-from-file>
# Check: Do files still exist? Are there new version files?

# Check release commands from RELEASING.md
# Check: Are they still accurate? Has workflow changed?
```

### 3. Detect Changes in Project

**Compare current project to RELEASING.md:**

```bash
# Check for new test files/commands
grep -E "test|spec" package.json  # Compare with documented tests
ls tests/ test/ __tests__/ e2e/   # New test directories?

# Check for build changes
grep -E "build" package.json  # Build command changed?

# Check for new version files
find . -name "version.*" -o -name "VERSION"  # New version files?

# Check for workflow changes
git log --oneline -n 10 .github/workflows/  # Workflow updated?
```

### 4. Ask User for Confirmation

**Present findings:**

```
I verified docs/RELEASING.md and found:

✅ Build command works: npm run build
✅ Unit tests work: npm test
✅ Integration tests work: npm run test:integration
❌ E2E tests found but not documented: npm run test:e2e
❌ New version file found: README.md (has version in install command)

Should I update RELEASING.md to include:
1. E2E test command: npm run test:e2e
2. Version file: README.md (installation instructions)
```

**ONLY proceed if user confirms.**

### 5. Update RELEASING.md

Apply approved updates.

### 6. Re-Verify

Execute every documented command again to confirm the updated guide still holds:

```bash
# Run all documented commands
<build-command>
<all-test-commands>
# Check version files exist
# Verify workflow exists
```

**Only mark complete when everything verified.**

