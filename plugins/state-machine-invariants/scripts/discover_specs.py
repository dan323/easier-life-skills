#!/usr/bin/env python3
"""discover_specs.py — Phase 2 of state-machine-invariants.

Reads Phase 1's args JSON; if `paths` is non-empty, echoes those entries
to the specs output file. Otherwise scans `--root` (default CWD) for
`*.fsm.yaml` files and any of `*.ts` / `*.tsx` / `*.js` / `*.jsx`
containing the substring `createMachine(`, skipping common build /
vendor directories.

Usage:
    discover_specs.py [--args-file PATH] [--out PATH] [--root PATH]
    discover_specs.py self-test

Exit codes:
    0  success (count printed to stdout, paths written to `--out`)
    2  bad usage
    3  args file missing or malformed
    6  self-test failed
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

EXCLUDE_DIRS = {"node_modules", "dist", "build", ".git", "vendor", "target", "__pycache__"}
CODE_EXTS = {".ts", ".tsx", ".js", ".jsx"}


def discover(root: str | Path) -> list[str]:
    keep: list[str] = []
    for current, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for f in files:
            p = Path(current) / f
            if p.name.endswith(".fsm.yaml"):
                keep.append(str(p))
                continue
            if p.suffix not in CODE_EXTS:
                continue
            try:
                if "createMachine(" in p.read_text(errors="ignore"):
                    keep.append(str(p))
            except OSError:
                pass
    return keep


def load_args(args_path: str) -> dict:
    p = Path(args_path)
    if not p.is_file():
        print(f"discover_specs: args file not found: {args_path}", file=sys.stderr)
        sys.exit(3)
    try:
        return json.loads(p.read_text())
    except json.JSONDecodeError as e:
        print(f"discover_specs: args file is not valid JSON: {e}", file=sys.stderr)
        sys.exit(3)


def self_test() -> None:
    def expect(cond: bool, msg: str) -> None:
        if not cond:
            print(f"self-test FAIL: {msg}", file=sys.stderr)
            sys.exit(6)

    # 1. Explicit-paths branch returns the list verbatim.
    with tempfile.TemporaryDirectory() as tmp:
        args_path = Path(tmp) / "args.json"
        args_path.write_text(json.dumps({"paths": ["src/a.ts", "specs/b.fsm.yaml"]}))
        data = load_args(str(args_path))
        expect(data["paths"] == ["src/a.ts", "specs/b.fsm.yaml"], "explicit paths preserved")

    # 2. Auto-discover branch — picks up YAML + matching TS, skips non-matching
    #    files, skips excluded directories.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "machine.ts").write_text("import { createMachine } from 'xstate';\ncreateMachine({});")
        (root / "no-match.ts").write_text("export const x = 1;")
        (root / "spec.fsm.yaml").write_text("id: y\ninitial: a\ntransitions: []\n")
        (root / "spec.yaml").write_text("not an fsm.yaml")
        nm = root / "node_modules"
        nm.mkdir()
        (nm / "skip.ts").write_text("createMachine({})")
        nested = root / "src" / "subdir"
        nested.mkdir(parents=True)
        (nested / "nested.tsx").write_text("createMachine({});")

        specs = discover(root)
        names = sorted(Path(p).name for p in specs)
        expect("machine.ts" in names, f"machine.ts discovered: {names}")
        expect("spec.fsm.yaml" in names, f"spec.fsm.yaml discovered: {names}")
        expect("nested.tsx" in names, f"nested.tsx discovered: {names}")
        expect("no-match.ts" not in names, f"no-match.ts excluded: {names}")
        expect("spec.yaml" not in names, f"non-fsm yaml excluded: {names}")
        expect("skip.ts" not in names, f"node_modules excluded: {names}")

    print("discover_specs.py self-test: PASS")


def main() -> None:
    parser = argparse.ArgumentParser(description="Discover specs for state-machine-invariants.")
    parser.add_argument("input", nargs="?", help="'self-test' to run the self-test, otherwise unused")
    parser.add_argument("--args-file", default="/tmp/smi-args.json")
    parser.add_argument("--out", default="/tmp/smi-specs.json")
    parser.add_argument("--root", default=".", help="root directory for auto-discovery (default: CWD)")
    args = parser.parse_args()

    if args.input == "self-test":
        self_test()
        return

    data = load_args(args.args_file)
    paths = data.get("paths") or []
    if paths:
        specs = list(paths)
    else:
        specs = discover(args.root)

    Path(args.out).write_text(json.dumps(specs, indent=2))
    print(f"Discovered {len(specs)} spec(s).")


if __name__ == "__main__":
    main()
