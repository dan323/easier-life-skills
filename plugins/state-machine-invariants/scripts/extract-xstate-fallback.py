#!/usr/bin/env python3
"""extract-xstate-fallback.py — regex-based best-effort extractor for XState
`createMachine(...)` configs, used when `@babel/parser` (Node) is not
available.

Usage:
    extract-xstate-fallback.py <file.ts> [--out <path>] [--no-sidecar]
    extract-xstate-fallback.py self-test

Default behaviour: prints the IR JSON to stdout AND writes
`<file>.fsm.ir.json` (extension replaced) next to the input. Pass
`--no-sidecar` to skip the sidecar write, or `--out <path>` to override
its location.

Exit codes:
    0  success (IR on stdout — always tagged with `caveat: grep-extracted`)
    2  bad usage
    3  could not locate `createMachine(` in the file
    4  could not balance braces around the config object literal
    6  self-test failed

This fallback recovers only:
    - `id` (string literal)
    - `initial` (string literal)
    - top-level `states` keys
    - whether each top-level state has `type: 'final'`
    - `on: { EVENT: '<target>' }` shorthand transitions (string-target only)

It does NOT recover guards, transition arrays, compound / parallel states,
or anything fancier. Every emitted IR includes the caveat
"grep-extracted; opaque guards" so downstream phases can downgrade
confidence.
"""
import argparse
import json
import re
import sys
from pathlib import Path


def find_create_machine_argument(source: str) -> str | None:
    """Return the substring containing the first balanced `{...}` argument
    of `createMachine(...)`, or None if it can't be located."""
    m = re.search(r"createMachine\s*\(\s*", source)
    if not m:
        return None
    start = source.find("{", m.end())
    if start == -1:
        return None
    depth = 0
    in_string: str | None = None
    escape = False
    i = start
    while i < len(source):
        c = source[i]
        if in_string:
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == in_string:
                in_string = None
        else:
            if c in "\"'`":
                in_string = c
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return source[start : i + 1]
        i += 1
    return None


def extract_ir(source: str) -> dict | None:
    cfg = find_create_machine_argument(source)
    if cfg is None:
        return None

    ir = {
        "id": None,
        "initial": None,
        "final": [],
        "events": [],
        "states": [],
        "transitions": [],
        "compound": {},
        "parallel": {},
        "caveats": ["grep-extracted; opaque guards"],
    }

    m_id = re.search(r"\bid\s*:\s*['\"]([^'\"]+)['\"]", cfg)
    if m_id:
        ir["id"] = m_id.group(1)

    m_initial = re.search(r"\binitial\s*:\s*['\"]([^'\"]+)['\"]", cfg)
    if m_initial:
        ir["initial"] = m_initial.group(1)

    m_states = re.search(r"\bstates\s*:\s*\{", cfg)
    if not m_states:
        return ir
    block = balanced_block(cfg, m_states.end() - 1)
    if block is None:
        return ir

    state_pat = re.compile(
        r"([A-Za-z_$][A-Za-z0-9_$]*|['\"][^'\"]+['\"])\s*:\s*\{",
        re.MULTILINE,
    )
    events = set()
    for sm in state_pat.finditer(block):
        raw_name = sm.group(1)
        name = raw_name.strip("'\"")
        body = balanced_block(block, sm.end() - 1)
        if body is None:
            continue
        ir["states"].append(name)
        if re.search(r"\btype\s*:\s*['\"]final['\"]", body):
            ir["final"].append(name)
        on_match = re.search(r"\bon\s*:\s*\{", body)
        if on_match:
            on_block = balanced_block(body, on_match.end() - 1)
            if on_block is not None:
                for ev_m in re.finditer(
                    r"([A-Z_][A-Z0-9_]*|['\"][A-Z_][A-Z0-9_]*['\"])\s*:\s*['\"]([^'\"]+)['\"]",
                    on_block,
                ):
                    event = ev_m.group(1).strip("'\"")
                    target = ev_m.group(2)
                    events.add(event)
                    ir["transitions"].append({
                        "from": name,
                        "event": event,
                        "to": target,
                        "guard": {"type": "always"},
                    })
    ir["events"] = sorted(events)
    return ir


def balanced_block(s: str, brace_pos: int) -> str | None:
    """Return the substring **inside** the `{...}` block whose opening `{` is
    at `brace_pos`. Returns None if not balanced."""
    if brace_pos >= len(s) or s[brace_pos] != "{":
        return None
    depth = 0
    in_string: str | None = None
    escape = False
    i = brace_pos
    while i < len(s):
        c = s[i]
        if in_string:
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == in_string:
                in_string = None
        else:
            if c in "\"'`":
                in_string = c
            elif c == "{":
                depth += 1
                if depth == 1:
                    body_start = i + 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return s[body_start:i]
        i += 1
    return None


def self_test() -> None:
    fixture = """
        import { createMachine } from 'xstate';
        export const m = createMachine({
          id: 'auth',
          initial: 'loggedOut',
          states: {
            loggedOut: {
              on: {
                SUBMIT: 'standardFlow',
                CANCEL: 'loggedOut'
              }
            },
            standardFlow: { type: 'final' },
            passwordReset: {}
          }
        });
    """
    ir = extract_ir(fixture)
    if ir is None:
        print("self-test FAIL: extractor returned None", file=sys.stderr)
        sys.exit(6)

    def expect(cond: bool, msg: str) -> None:
        if not cond:
            print(f"self-test FAIL: {msg}", file=sys.stderr)
            sys.exit(6)

    expect(ir["id"] == "auth", "id is auth")
    expect(ir["initial"] == "loggedOut", "initial is loggedOut")
    expect("passwordReset" in ir["states"], "passwordReset declared")
    expect("standardFlow" in ir["final"], "standardFlow is final")
    expect(set(ir["events"]) == {"SUBMIT", "CANCEL"}, f"events extracted: {ir['events']}")
    expect(len(ir["transitions"]) == 2, f"two transitions; got {len(ir['transitions'])}")
    expect("grep-extracted; opaque guards" in ir["caveats"], "caveat present")
    print("extract-xstate-fallback.py self-test: PASS")


def derive_sidecar_path(input_path: str) -> str:
    p = Path(input_path)
    if p.suffix:
        return str(p.with_suffix(".fsm.ir.json"))
    return str(p) + ".fsm.ir.json"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Regex-based fallback XState extractor (state-machine-invariants).",
    )
    parser.add_argument("input", nargs="?", help="path to .ts/.js source, or 'self-test'")
    parser.add_argument("--out", help="explicit sidecar path (default: derived from input)")
    parser.add_argument("--no-sidecar", action="store_true", help="skip the sidecar write")
    args = parser.parse_args()

    if not args.input:
        parser.print_usage(sys.stderr)
        sys.exit(2)
    if args.input == "self-test":
        self_test()
        return

    source = Path(args.input).read_text(errors="ignore")
    ir = extract_ir(source)
    if ir is None:
        print(
            f"extract-xstate-fallback: could not find createMachine(...) in {args.input}",
            file=sys.stderr,
        )
        sys.exit(3)
    out_json = json.dumps(ir, indent=2)
    print(out_json)
    if not args.no_sidecar:
        sidecar = args.out or derive_sidecar_path(args.input)
        Path(sidecar).write_text(out_json + "\n")


if __name__ == "__main__":
    main()
