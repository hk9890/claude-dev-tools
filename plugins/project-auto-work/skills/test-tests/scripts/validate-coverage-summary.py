#!/usr/bin/env python3
"""validate-coverage-summary.py — validate a coverage-summary document and normalize it.

This audit does NOT parse any coverage format. The TARGET REPOSITORY provides a
command that emits a coverage summary as JSON on stdout, in the neutral schema
documented at ../references/coverage-summary-schema.md. This script is the
machine-checkable form of that contract: it is technology-agnostic — it knows
nothing about any specific coverage format or tool — it only checks the neutral
shape and emits per-file and total line counts derived from the ranges.

Input (read from FILE, or from stdin when FILE is omitted or "-"):
  { "files": [
      { "path": "src/foo.py",
        "covered_ranges":   [[10, 25], [30, 42]],
        "uncovered_ranges": [[26, 29]] },
      ...
  ] }

Rules enforced (non-conformance exits 3 with every problem listed on stderr):
  - top-level object with a non-empty "files" array
  - each entry has a "path" that is REPO-RELATIVE: not absolute, no ".." segment,
    forward-slash, non-empty after normalization
  - covered_ranges / uncovered_ranges (both optional, default []) are arrays of
    [start, end] integer pairs with 1 <= start <= end
  - every file has at least one covered or uncovered line
  - paths are unique after normalization

Output (stdout, on success) — the normalized summary the workflow consumes:
  { "totals": {"files": N, "lines_total": N, "lines_covered": N, "pct": F},
    "files": [ {"path": "...", "lines_total": N, "lines_covered": N, "pct": F,
                "covered_ranges": [[s,e],...], "uncovered_ranges": [[s,e],...]}, ... ] }
Covered lines win on overlap; uncovered_ranges in the output exclude covered lines.

Usage:
  validate-coverage-summary.py [FILE] [--repo-root DIR]
  --repo-root is accepted for symmetry with the producer contract; file existence
  is deliberately NOT checked (a producer may reference generated sources).
Exit codes: 0 valid, 2 usage error, 3 invalid/non-conforming input.
"""

import json
import sys


def die(code, msg):
    print(json.dumps({"error": msg}), file=sys.stderr)
    sys.exit(code)


def normalize_rel(path):
    """Reduce a path to a repo-relative form, or return an error string."""
    if not isinstance(path, str) or not path.strip():
        return None, "path must be a non-empty string"
    p = path.replace("\\", "/").strip()
    if p.startswith("/") or (len(p) >= 2 and p[1] == ":"):
        return None, f"path must be repo-relative, got absolute: {path!r}"
    segs = [s for s in p.split("/") if s not in ("", ".")]
    if any(s == ".." for s in segs):
        return None, f"path must not escape the repo (no '..'): {path!r}"
    if not segs:
        return None, f"path is empty after normalization: {path!r}"
    return "/".join(segs), None


def validate_ranges(ranges, label, path):
    """Return (normalized pairs, error). Missing/None ranges are treated as empty."""
    if ranges is None:
        return [], None
    if not isinstance(ranges, list):
        return None, f"{label} for {path!r} must be an array"
    out = []
    for r in ranges:
        if not isinstance(r, list) or len(r) != 2:
            return None, f"{label} for {path!r} must be [start, end] pairs, got {r!r}"
        s, e = r
        # bool is an int subclass — reject it explicitly.
        if isinstance(s, bool) or isinstance(e, bool) or not isinstance(s, int) or not isinstance(e, int):
            return None, f"{label} for {path!r} has non-integer endpoints: {r!r}"
        if s < 1 or e < s:
            return None, f"{label} for {path!r} needs 1<=start<=end, got {r!r}"
        out.append([s, e])
    return out, None


def lines_of(ranges):
    nums = set()
    for a, b in ranges:
        nums.update(range(a, b + 1))
    return nums


def to_ranges(line_numbers):
    """Sorted line numbers -> [[start, end], ...] inclusive, merged."""
    ranges = []
    for ln in sorted(line_numbers):
        if ranges and ln == ranges[-1][1] + 1:
            ranges[-1][1] = ln
        else:
            ranges.append([ln, ln])
    return ranges


def main(argv):
    args = list(argv[1:])
    positional = []
    i = 0
    while i < len(args):
        if args[i] == "--repo-root":
            i += 1
            if i >= len(args):
                die(2, "--repo-root requires a value")
            # Accepted for symmetry with the producer contract; unused (see docstring).
        elif args[i] in ("-h", "--help"):
            print(__doc__)
            return 0
        else:
            positional.append(args[i])
        i += 1
    if len(positional) > 1:
        die(2, "usage: validate-coverage-summary.py [FILE] [--repo-root DIR]")

    src = positional[0] if positional else "-"
    try:
        if src == "-":
            text = sys.stdin.read()
        else:
            with open(src, encoding="utf-8", errors="replace") as f:
                text = f.read()
    except OSError as e:
        die(3, f"cannot read {src}: {e}")

    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        die(3, f"input is not valid JSON: {e}")

    if not isinstance(data, dict) or not isinstance(data.get("files"), list):
        die(3, 'coverage summary must be an object with a "files" array')
    if not data["files"]:
        die(3, "coverage summary has no file entries")

    errors = []
    seen = set()
    out_files = []
    grand_cov = grand_total = 0
    for idx, entry in enumerate(data["files"]):
        if not isinstance(entry, dict):
            errors.append(f"files[{idx}] must be an object")
            continue
        rel, err = normalize_rel(entry.get("path"))
        if err:
            errors.append(f"files[{idx}]: {err}")
            continue
        cov, err = validate_ranges(entry.get("covered_ranges"), "covered_ranges", rel)
        if err:
            errors.append(err)
            continue
        unc, err = validate_ranges(entry.get("uncovered_ranges"), "uncovered_ranges", rel)
        if err:
            errors.append(err)
            continue
        cov_lines = lines_of(cov)
        unc_lines = lines_of(unc) - cov_lines
        if not cov_lines and not unc_lines:
            errors.append(f"{rel!r} has no covered or uncovered lines")
            continue
        if rel in seen:
            errors.append(f"duplicate file entry after path normalization: {rel!r}")
            continue
        seen.add(rel)
        covered, total = len(cov_lines), len(cov_lines) + len(unc_lines)
        grand_cov += covered
        grand_total += total
        out_files.append({
            "path": rel,
            "lines_total": total,
            "lines_covered": covered,
            "pct": round(100.0 * covered / total, 1) if total else 0.0,
            "covered_ranges": to_ranges(cov_lines),
            "uncovered_ranges": to_ranges(unc_lines),
        })

    if errors:
        die(3, "; ".join(errors))

    out_files.sort(key=lambda f: f["path"])
    print(json.dumps({
        "totals": {
            "files": len(out_files),
            "lines_total": grand_total,
            "lines_covered": grand_cov,
            "pct": round(100.0 * grand_cov / grand_total, 1) if grand_total else 0.0,
        },
        "files": out_files,
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
