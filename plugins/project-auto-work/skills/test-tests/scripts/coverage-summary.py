#!/usr/bin/env python3
"""coverage-summary.py — normalize a line-coverage report into compact JSON.

Language-independent: accepts the four mainstream interchange formats and emits
one schema, so agents never parse raw coverage files.

Supported input formats (auto-detected):
  - LCOV tracefile           (SF:/DA:/end_of_record records; kcov, lcov, vitest, jest)
  - Cobertura XML            (pytest-cov, .NET XPlat, gcovr, many CI exporters)
  - coverage.py JSON         (coverage json; has "meta" + "files" keys)
  - Go coverprofile          (go test -coverprofile=...; first line "mode: ...")

Usage:
  coverage-summary.py COVERAGE_FILE [--repo-root DIR]            # per-file summary
  coverage-summary.py COVERAGE_FILE --file PATH [--repo-root DIR] # line detail for one file

Output (summary mode):
  { "format": "...", "totals": {"files": N, "lines_total": N, "lines_covered": N, "pct": F},
    "files": [ {"path": "...", "lines_total": N, "lines_covered": N, "pct": F}, ... ] }

Output (--file mode):
  { "format": "...", "path": "...", "lines_total": N, "lines_covered": N, "pct": F,
    "covered_ranges": [[start, end], ...], "uncovered_ranges": [[start, end], ...] }

Paths are normalized: absolute or module-qualified paths (Go) are reduced to
repo-relative paths when --repo-root is given and the suffix resolves there.
Exit codes: 0 ok, 2 usage error, 3 unrecognized/unparseable input.
"""

import json
import os
import sys
import xml.etree.ElementTree as ET


def die(code, msg):
    print(json.dumps({"error": msg}), file=sys.stderr)
    sys.exit(code)


# ---------------------------------------------------------------------------
# Parsers — each returns {path: {line_number: hit_bool}}
# ---------------------------------------------------------------------------

def parse_lcov(text):
    files, cur, lines = {}, None, {}
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("SF:"):
            cur, lines = line[3:].strip(), {}
        elif line.startswith("DA:") and cur is not None:
            parts = line[3:].split(",")
            if len(parts) >= 2:
                try:
                    ln, hits = int(parts[0]), int(parts[1])
                except ValueError:
                    continue
                # A line already seen as hit stays hit (merged tracefiles).
                lines[ln] = lines.get(ln, False) or hits > 0
        elif line == "end_of_record" and cur is not None:
            if lines:
                merged = files.setdefault(cur, {})
                for ln, hit in lines.items():
                    merged[ln] = merged.get(ln, False) or hit
            cur, lines = None, {}
    return files


def parse_cobertura(text):
    root = ET.fromstring(text)
    if root.tag != "coverage":
        raise ValueError("not a Cobertura report (root element is not <coverage>)")
    sources = [s.text.strip() for s in root.iter("source") if s.text and s.text.strip()]
    files = {}
    for cls in root.iter("class"):
        fname = cls.get("filename")
        if not fname:
            continue
        # Prefix with the first <source> that is not "." so suffix-resolution works.
        path = fname
        for src in sources:
            if src not in (".", ""):
                path = os.path.join(src, fname)
                break
        merged = files.setdefault(path, {})
        for line in cls.iter("line"):
            try:
                ln, hits = int(line.get("number")), int(line.get("hits", "0"))
            except (TypeError, ValueError):
                continue
            merged[ln] = merged.get(ln, False) or hits > 0
    return files


def parse_coverage_py_json(data):
    files = {}
    for path, info in data.get("files", {}).items():
        lines = {}
        for ln in info.get("executed_lines", []):
            lines[int(ln)] = True
        for ln in info.get("missing_lines", []):
            lines.setdefault(int(ln), False)
        files[path] = lines
    return files


def parse_go_coverprofile(text):
    files = {}
    for raw in text.splitlines()[1:]:  # skip "mode: ..."
        line = raw.strip()
        if not line:
            continue
        # path/file.go:startLine.startCol,endLine.endCol numStmts hitCount
        try:
            loc, _, hits = line.rsplit(" ", 2)
            path, span = loc.rsplit(":", 1)
            start, end = span.split(",")
            start_line = int(start.split(".")[0])
            end_line = int(end.split(".")[0])
            hit = int(hits) > 0
        except ValueError:
            continue
        merged = files.setdefault(path, {})
        for ln in range(start_line, end_line + 1):
            merged[ln] = merged.get(ln, False) or hit
    return files


def detect_and_parse(text):
    stripped = text.lstrip()
    if stripped.startswith("<?xml") or stripped.startswith("<coverage"):
        return "cobertura", parse_cobertura(text)
    if stripped.startswith("mode:"):
        return "go-coverprofile", parse_go_coverprofile(text)
    if stripped.startswith("{"):
        data = json.loads(text)
        if "files" in data and "meta" in data:
            return "coverage.py-json", parse_coverage_py_json(data)
        raise ValueError("JSON input is not a coverage.py report (missing meta/files)")
    if "\nSF:" in text or stripped.startswith(("SF:", "TN:")):
        return "lcov", parse_lcov(text)
    raise ValueError("unrecognized coverage format")


# ---------------------------------------------------------------------------
# Path normalization
# ---------------------------------------------------------------------------

def normalize_path(path, repo_root):
    """Reduce an absolute or module-qualified path to repo-relative when possible."""
    norm = path.replace("\\", "/")
    if repo_root:
        root = os.path.abspath(repo_root)
        if os.path.isabs(norm):
            try:
                rel = os.path.relpath(norm, root)
                if not rel.startswith(".."):
                    return rel.replace("\\", "/")
            except ValueError:
                pass
        # Strip leading components (Go module prefixes) until the suffix exists.
        parts = norm.split("/")
        for i in range(len(parts)):
            candidate = "/".join(parts[i:])
            if candidate and os.path.exists(os.path.join(root, candidate)):
                return candidate
    return norm


def to_ranges(line_numbers):
    """Sorted line numbers -> [[start, end], ...] inclusive ranges."""
    ranges = []
    for ln in sorted(line_numbers):
        if ranges and ln == ranges[-1][1] + 1:
            ranges[-1][1] = ln
        else:
            ranges.append([ln, ln])
    return ranges


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(argv):
    args = list(argv[1:])
    repo_root, file_filter, positional = None, None, []
    i = 0
    while i < len(args):
        if args[i] == "--repo-root":
            i += 1
            if i >= len(args):
                die(2, "--repo-root requires a value")
            repo_root = args[i]
        elif args[i] == "--file":
            i += 1
            if i >= len(args):
                die(2, "--file requires a value")
            file_filter = args[i]
        elif args[i] in ("-h", "--help"):
            print(__doc__)
            return 0
        else:
            positional.append(args[i])
        i += 1
    if len(positional) != 1:
        die(2, "usage: coverage-summary.py COVERAGE_FILE [--file PATH] [--repo-root DIR]")

    try:
        with open(positional[0], encoding="utf-8", errors="replace") as f:
            text = f.read()
    except OSError as e:
        die(3, f"cannot read {positional[0]}: {e}")

    try:
        fmt, raw_files = detect_and_parse(text)
    except (ValueError, ET.ParseError, json.JSONDecodeError) as e:
        die(3, f"unparseable coverage input: {e}")

    # Normalize and merge (two raw paths may normalize to the same file).
    files = {}
    for path, lines in raw_files.items():
        norm = normalize_path(path, repo_root)
        merged = files.setdefault(norm, {})
        for ln, hit in lines.items():
            merged[ln] = merged.get(ln, False) or hit

    def stats(lines):
        total = len(lines)
        covered = sum(1 for hit in lines.values() if hit)
        pct = round(100.0 * covered / total, 1) if total else 0.0
        return total, covered, pct

    if file_filter is not None:
        # Normalize the filter the same way as coverage paths, so absolute or
        # worktree-prefixed arguments still resolve to the repo-relative key.
        norm_filter = normalize_path(file_filter.replace("\\", "/"), repo_root)
        match = files.get(norm_filter)
        if match is None:  # fall back to suffix match
            candidates = [p for p in files if p.endswith(norm_filter)]
            if len(candidates) == 1:
                norm_filter, match = candidates[0], files[candidates[0]]
        if match is None:
            die(3, f"no coverage data for file: {file_filter}")
        total, covered, pct = stats(match)
        print(json.dumps({
            "format": fmt, "path": norm_filter,
            "lines_total": total, "lines_covered": covered, "pct": pct,
            "covered_ranges": to_ranges([ln for ln, hit in match.items() if hit]),
            "uncovered_ranges": to_ranges([ln for ln, hit in match.items() if not hit]),
        }))
        return 0

    per_file = []
    grand_total = grand_covered = 0
    for path in sorted(files):
        total, covered, pct = stats(files[path])
        grand_total += total
        grand_covered += covered
        per_file.append({"path": path, "lines_total": total,
                         "lines_covered": covered, "pct": pct})
    print(json.dumps({
        "format": fmt,
        "totals": {
            "files": len(per_file), "lines_total": grand_total,
            "lines_covered": grand_covered,
            "pct": round(100.0 * grand_covered / grand_total, 1) if grand_total else 0.0,
        },
        "files": per_file,
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
