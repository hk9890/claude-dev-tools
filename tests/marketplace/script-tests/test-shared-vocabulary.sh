#!/usr/bin/env bash
# test-shared-vocabulary.sh — pin the two places this marketplace deliberately
# duplicates prose, so a one-sided edit fails instead of drifting quietly.
#
# 1. decision-split.md exists twice, in project-auto-work and project-review.
#    That is required, not accidental: plugins install independently and neither
#    may reach the other's files. Both copies say so, and both warn that changing
#    what settled or open *means* is a two-file edit "or they drift". They had
#    drifted — project-review's `open` gained "it changes a name people type" and
#    project-auto-work's did not — which is what this pins.
#
# 2. html-visualization's three modes share one /submit contract. It used to be
#    written out in each <mode>-submit-schema.md, and the copies disagreed about
#    whether constant-time comparison was a SHOULD or a statement of fact. The
#    contract now lives once in submit-contract.md; these checks stop a mode file
#    from growing its own copy back.
#
# Exit codes: 0 — all assertions passed; 1 — one or more failed.
set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }

PASS=0
FAIL=0
ok()   { printf 'PASS: %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf 'FAIL: %s\n' "$1"; FAIL=$((FAIL + 1)); }

# ── 1. The settled/open vocabulary, one row at a time ────────────────────────
AW="$REPO_ROOT/plugins/project-auto-work/references/decision-split.md"
RV="$REPO_ROOT/plugins/project-review/references/decision-split.md"

for f in "$AW" "$RV"; do
  [[ -f "$f" ]] || fail "missing $f"
done

if [[ -f "$AW" && -f "$RV" ]]; then
  for kind in settled open; do
    a=$(grep -F "| **${kind}** |" "$AW")
    b=$(grep -F "| **${kind}** |" "$RV")
    if [[ -z "$a" || -z "$b" ]]; then
      fail "decision-split: no \`${kind}\` row in one of the two copies"
    elif [[ "$a" == "$b" ]]; then
      ok "decision-split: \`${kind}\` is identical in both plugins"
    else
      fail "decision-split: \`${kind}\` differs between the plugins — edit both or they drift
     project-auto-work: ${a}
     project-review:    ${b}"
    fi
  done
fi

# ── 2. One /submit contract, pointed at by every mode ────────────────────────
REF="$REPO_ROOT/plugins/html-visualization/references"
CONTRACT="$REF/submit-contract.md"

if [[ -f "$CONTRACT" ]]; then
  ok "submit-contract.md exists"
else
  fail "submit-contract.md is missing — the three mode schemas have nothing to point at"
fi

for mode in ask feedback visualize; do
  f="$REF/${mode}-submit-schema.md"
  if [[ ! -f "$f" ]]; then
    fail "${mode}-submit-schema.md not found"
    continue
  fi
  if grep -Fq 'submit-contract.md' "$f"; then
    ok "${mode}-submit-schema.md points at submit-contract.md"
  else
    fail "${mode}-submit-schema.md — no pointer to submit-contract.md; the shared contract is unreachable from this mode"
  fi
done

# The headings that were triplicated. A mode file reintroducing one is a copy
# growing back, which is exactly how the CSRF wording diverged the first time.
# `visualize` legitimately documents its own extra 200 body and its saved-copy
# guard, so only the shared headings are checked here.
for mode in ask feedback visualize; do
  f="$REF/${mode}-submit-schema.md"
  [[ -f "$f" ]] || continue
  for heading in 'Token lifecycle' 'Origin / Sec-Fetch-Site' 'Wire format' 'CSRF protection'; do
    if grep -Fq "# ${heading}" "$f"; then
      fail "${mode}-submit-schema.md re-documents '${heading}' — it belongs to submit-contract.md alone"
    else
      ok "${mode}-submit-schema.md leaves '${heading}' to the shared contract"
    fi
  done
done

# The contract must actually carry them, or the checks above pass against nothing.
if [[ -f "$CONTRACT" ]]; then
  for heading in 'Token lifecycle' 'Origin / Sec-Fetch-Site' 'Wire format' 'CSRF protection'; do
    if grep -Fq "# ${heading}" "$CONTRACT"; then
      ok "submit-contract.md owns '${heading}'"
    else
      fail "submit-contract.md — '${heading}' is missing; the mode files were stripped of it"
    fi
  done
  # The drift that motivated this: ask said constant-time comparison "SHOULD be
  # used" while the server has always called crypto.timingSafeEqual. The contract
  # states what the code does.
  if grep -Fq 'timingSafeEqual' "$CONTRACT"; then
    ok "submit-contract.md names the constant-time comparison the server actually uses"
  else
    fail "submit-contract.md — no mention of timingSafeEqual; the CSRF check is described weaker than it is"
  fi
fi

printf '\nResults: %d passed, %d failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]] || exit 1
