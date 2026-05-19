#!/usr/bin/env python3
"""record_skipped.py — append a {path, reason} entry to the skipped list.

Phases 3 and 4 of state-machine-invariants call this whenever a spec
fails to parse (Phase 3) or fails to flatten (Phase 4) so Phase 6's
report can list it under the "skipped" section.

Usage:
    record_skipped.py <spec-path> <reason>

The destination defaults to /tmp/smi-skipped.json. Override with the
SMI_SKIPPED_PATH environment variable when running multiple invocations
in parallel.
"""
import json
import os
import sys


def main() -> None:
    if len(sys.argv) != 3:
        print("usage: record_skipped.py <spec-path> <reason>", file=sys.stderr)
        sys.exit(2)
    dest = os.environ.get("SMI_SKIPPED_PATH", "/tmp/smi-skipped.json")
    entries = json.load(open(dest)) if os.path.exists(dest) else []
    entries.append({"path": sys.argv[1], "reason": sys.argv[2]})
    with open(dest, "w") as f:
        json.dump(entries, f, indent=2)


if __name__ == "__main__":
    main()
