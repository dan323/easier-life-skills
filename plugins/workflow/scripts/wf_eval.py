#!/usr/bin/env python3
"""Expression evaluator, renderer and validator for the `workflow` runner.

Standard library only. Deliberately *not* `eval()`: expressions are tokenised and
parsed by a tiny recursive-descent parser, so a workflow file can never execute
arbitrary code (see adr/0001-minimal-expression-language.md).

Expression language (inside `${{ ... }}`, or bare for `if` / `until` / `for_each`).
Ordering (`<`, `<=`, `>`, `>=`) compares numbers (or numeric strings); a missing or
non-numeric side makes it false:

    expr    := or
    or      := and ( "||" and )*
    and     := cmp ( "&&" cmp )*
    cmp     := unary ( ("==" | "!=" | "<" | "<=" | ">" | ">=") unary )?
    unary   := "!" unary | primary
    primary := "(" expr ")" | string | number | true | false | null | reference

References:
    inputs.<name>                      workflow input
    steps.<id>.output[.<key>...]       captured output of an earlier step (latest iteration)
    steps.<id>.outputs[.<n>]           per-iteration outputs of an earlier looped step
    steps.<id>.status                  success | failed | skipped
    steps.<id>.attempts / .iterations  counters
    item[.<key>...] / index            inside a `for_each` step (`index` also inside `until`)

CLI (used by SKILL.md):
    wf_eval.py validate <parsed.json>
    wf_eval.py eval   <parsed.json> <run_dir> --expr E [--item JSON] [--index N] [--truthy]
    wf_eval.py render <parsed.json> <run_dir> --value JSON [--item JSON] [--index N]
    wf_eval.py collect <run_dir> --id ID [--block BLOCK]
    wf_eval.py step   <parsed.json> <run_dir> --plan <plan.json> --id ID
                      --what if|until|for_each|args [--item JSON|@file] [--index N]

A step with a `steps:` list and `for_each` / `until` is a **loop block**: its inner steps run in
order on every pass, and each inner step's `steps.<id>.*` always reads its latest pass.

`step` reads the step's raw template from the plan file and prints: `true`/`false` for
`if` and `until`, a JSON list for `for_each`, a JSON object for `args`. Exit 2 = error.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

MAX_ITERATIONS = 100   # hard ceiling for `for_each` length and `max_iterations`
MAX_RETRY = 5          # hard ceiling for `retry`

EXPR = re.compile(r"\$\{\{\s*(.+?)\s*\}\}")
STEP_FIELDS = {"output", "outputs", "status", "attempts", "iterations"}

_TOKEN = re.compile(
    r"""\s*(?:
        (?P<op>\|\||&&|==|!=|<=|>=|<|>|!|\(|\))
      | (?P<str>"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')
      | (?P<num>-?\d+(?:\.\d+)?)
      | (?P<ref>[A-Za-z_][\w-]*(?:\.[\w-]+)*)
    )""",
    re.X,
)


class ExprError(ValueError):
    pass


_CMP = {"==": "eq", "!=": "ne", "<": "lt", "<=": "le", ">": "gt", ">=": "ge"}


# ───────────────────────────── parsing ─────────────────────────────

def _tokenize(src: str) -> list[tuple[str, str]]:
    pos, out = 0, []
    src = src.rstrip()
    while pos < len(src):
        m = _TOKEN.match(src, pos)
        if not m or m.end() == pos:
            raise ExprError(f"unexpected character at '{src[pos:pos + 12].strip()}'")
        kind = m.lastgroup
        out.append((kind, m.group(kind)))
        pos = m.end()
    return out


def _unquote(s: str) -> str:
    if s[0] == '"':
        return json.loads(s)
    return json.loads('"' + s[1:-1].replace('"', '\\"').replace("\\'", "'") + '"')


class _Parser:
    def __init__(self, src: str):
        self.toks = _tokenize(src)
        self.i = 0

    def peek(self):
        return self.toks[self.i] if self.i < len(self.toks) else (None, None)

    def take(self):
        t = self.peek()
        self.i += 1
        return t

    def parse(self):
        if not self.toks:
            raise ExprError("empty expression")
        node = self.or_()
        if self.i != len(self.toks):
            raise ExprError(f"unexpected '{self.peek()[1]}'")
        return node

    def or_(self):
        node = self.and_()
        while self.peek() == ("op", "||"):
            self.take()
            node = ("or", node, self.and_())
        return node

    def and_(self):
        node = self.cmp()
        while self.peek() == ("op", "&&"):
            self.take()
            node = ("and", node, self.cmp())
        return node

    def cmp(self):
        left = self.unary()
        if self.peek()[0] == "op" and self.peek()[1] in _CMP:
            op = self.take()[1]
            return (_CMP[op], left, self.unary())
        return left

    def unary(self):
        if self.peek() == ("op", "!"):
            self.take()
            return ("not", self.unary())
        return self.primary()

    def primary(self):
        kind, val = self.take()
        if kind is None:
            raise ExprError("unexpected end of expression")
        if kind == "op" and val == "(":
            node = self.or_()
            if self.take() != ("op", ")"):
                raise ExprError("missing ')'")
            return node
        if kind == "str":
            return ("lit", _unquote(val))
        if kind == "num":
            return ("lit", float(val) if "." in val else int(val))
        if kind == "ref":
            if val in ("true", "false"):
                return ("lit", val == "true")
            if val == "null":
                return ("lit", None)
            return ("ref", val.split("."))
        raise ExprError(f"unexpected '{val}'")


def parse(src: str):
    return _Parser(src).parse()


def refs(node) -> list[list[str]]:
    if node[0] == "ref":
        return [node[1]]
    if node[0] == "lit":
        return []
    return [r for child in node[1:] for r in refs(child)]


# ───────────────────────────── evaluation ─────────────────────────────

class Context:
    def __init__(self, inputs: dict, run_dir: str, item=None, index=None):
        self.inputs, self.run_dir, self.item, self.index = inputs, Path(run_dir), item, index


def _read(path: Path):
    if not path.exists() or path.stat().st_size == 0:
        return None
    text = path.read_text(encoding="utf-8")
    try:
        return json.loads(text)
    except ValueError:
        return text


def _plain(v):
    """The stdout fallback is stored as {"stdout": text}; expose it as the plain string."""
    return v["stdout"] if isinstance(v, dict) and set(v) == {"stdout"} else v


def _drill(value, keys):
    for k in keys:
        if isinstance(value, dict):
            value = value.get(k)
        elif isinstance(value, list) and k.isdigit() and int(k) < len(value):
            value = value[int(k)]
        else:
            return None
    return value


def _resolve(parts: list[str], ctx: Context):
    head = parts[0]
    if head == "inputs":
        return _drill(ctx.inputs, parts[1:]) if len(parts) > 1 else ctx.inputs
    if head == "item":
        return _drill(ctx.item, parts[1:])
    if head == "index":
        return ctx.index
    if head == "steps":
        sid, field, rest = parts[1], parts[2], parts[3:]
        base = ctx.run_dir / sid
        if field == "output":
            return _drill(_plain(_read(base / "output.json")), rest)
        if field == "outputs":
            return _drill([_plain(o) for o in (_read(base / "outputs.json") or [])], rest)
        status = _read(base / "status.json") or {}
        return status.get(field, "pending" if field == "status" else None)
    raise ExprError(f"unknown reference '{'.'.join(parts)}'")


def truthy(v) -> bool:
    return not (v is None or v is False or v == "" or v == 0 or v == [] or v == {})


def _norm(v):
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return v


def _num(v):
    """A number, or a string that holds one (CLI inputs are strings); anything else is None."""
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float)):
        return v
    if isinstance(v, str):
        try:
            return float(v)
        except ValueError:
            return None
    return None


def _eq(a, b) -> bool:
    if a is None or b is None:
        return a is None and b is None
    if isinstance(a, (list, dict)) or isinstance(b, (list, dict)):
        return a == b
    return _norm(a) == _norm(b)         # CLI inputs are strings: "3" == 3


def evaluate(node, ctx: Context):
    kind = node[0]
    if kind == "lit":
        return node[1]
    if kind == "ref":
        return _resolve(node[1], ctx)
    if kind == "not":
        return not truthy(evaluate(node[1], ctx))
    if kind == "and":
        left = evaluate(node[1], ctx)
        return evaluate(node[2], ctx) if truthy(left) else left
    if kind == "or":
        left = evaluate(node[1], ctx)
        return left if truthy(left) else evaluate(node[2], ctx)
    if kind in ("eq", "ne"):
        res = _eq(evaluate(node[1], ctx), evaluate(node[2], ctx))
        return res if kind == "eq" else not res
    if kind in ("lt", "le", "gt", "ge"):
        a, b = _num(evaluate(node[1], ctx)), _num(evaluate(node[2], ctx))
        if a is None or b is None:
            return False                      # a missing / non-numeric side never satisfies an ordering
        return {"lt": a < b, "le": a <= b, "gt": a > b, "ge": a >= b}[kind]
    raise ExprError(f"bad node {kind}")


def unwrap(s: str) -> str:
    """`${{ x }}` -> `x`; a bare expression stays as is; a mixed string is an error."""
    s = s.strip()
    m = EXPR.match(s)          # non-greedy: stops at the first `}}`
    if m and m.end() == len(s):
        return m.group(1)
    if "${{" in s:
        raise ExprError("use either one `${{ … }}` or a bare expression, not both")
    return s


def eval_expr(src: str, ctx: Context):
    return evaluate(parse(unwrap(src)), ctx)


def _stringify(v) -> str:
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (dict, list)):
        return json.dumps(v)
    return str(v)


def render(value, ctx: Context):
    """Substitute `${{ … }}` in a string / list / map. A value that is exactly one
    expression keeps its type; an embedded expression is stringified."""
    if isinstance(value, dict):
        return {k: render(v, ctx) for k, v in value.items()}
    if isinstance(value, list):
        return [render(v, ctx) for v in value]
    if not isinstance(value, str):
        return value
    ms = list(EXPR.finditer(value))
    if not ms:
        return value
    if len(ms) == 1 and ms[0].group(0) == value.strip():
        return eval_expr(ms[0].group(0), ctx)
    out, last = [], 0
    for m in ms:
        out.append(value[last:m.start()])
        out.append(_stringify(eval_expr(m.group(0), ctx)))
        last = m.end()
    out.append(value[last:])
    return "".join(out)


# ───────────────────────────── validation ─────────────────────────────

SLUG = re.compile(r"^[a-z][a-z0-9-]*[a-z0-9]$")
BLOCK_FORBIDDEN = ("skill", "args", "inputs", "agent", "inline", "retry")   # these belong on inner steps
INNER_FORBIDDEN = ("steps", "for_each", "until", "max_iterations")          # no nested loops


class _State:
    """What the validator has seen so far, in workflow order."""

    def __init__(self, top_ids):
        self.earlier: list[str] = []      # ids whose steps have run before the current one
        self.looped: set[str] = set()     # ids that expose `outputs` (loop steps and a loop block's inner steps)
        self.blocks: set[str] = set()     # loop-block ids: no `output` / `outputs`
        self.seen: set[str] = set(top_ids)  # every id in use (inner ids are checked against it)


def _check_refs(where: str, node, st: _State, *, self_id: str | None, allow_self: bool,
                item_ok: bool, index_ok: bool) -> list[str]:
    errs = []
    for parts in refs(node):
        head = parts[0]
        text = ".".join(parts)
        if head == "inputs":
            if len(parts) < 2:
                errs.append(f"{where}: `{text}` needs an input name (inputs.<name>).")
        elif head == "item":
            if not item_ok:
                errs.append(f"{where}: `item` is only available inside a `for_each` step or block.")
        elif head == "index":
            if not index_ok or len(parts) != 1:
                errs.append(f"{where}: `index` is only available inside a `for_each` or `until` step or block.")
        elif head == "steps":
            if len(parts) < 3 or parts[2] not in STEP_FIELDS:
                errs.append(f"{where}: invalid steps expression `{text}` "
                            f"(steps.<id>.{{{'|'.join(sorted(STEP_FIELDS))}}}).")
                continue
            sid, field = parts[1], parts[2]
            if sid == self_id and allow_self:
                pass
            elif sid not in st.earlier:
                errs.append(f"{where}: `{text}` references step that has not run yet.")
            if field in ("output", "outputs") and sid in st.blocks:
                errs.append(f"{where}: `{text}` — a loop block has no output; read its inner steps "
                            f"(steps.<inner>.output) or its `status` / `iterations`.")
            elif field == "outputs" and sid not in st.looped and sid != self_id:
                errs.append(f"{where}: `{text}` — `outputs` exists only on steps with `for_each` or `until`, "
                            f"and on the inner steps of a loop block.")
        elif head not in ("true", "false", "null"):
            errs.append(f"{where}: unknown expression head `{head}`.")
    return errs


def _check_template(errs, w, field, value, st, sid, flags):
    if isinstance(value, dict):
        for v in value.values():
            _check_template(errs, w, field, v, st, sid, flags)
    elif isinstance(value, list):
        for v in value:
            _check_template(errs, w, field, v, st, sid, flags)
    elif isinstance(value, str):
        for m in EXPR.finditer(value):
            try:
                node = parse(m.group(1))
            except ExprError as e:
                errs.append(f"{w} `{field}`: invalid expression `{m.group(1)}` — {e}.")
                continue
            errs.extend(_check_refs(f"{w} `{field}`", node, st, self_id=sid, **flags))


def _validate_step(step: dict, idx: int, errs: list[str], st: _State, block: dict | None = None) -> None:
    sid = step.get("id")
    w = f"Step '{sid or idx}'"
    inner = block is not None
    is_block = (not inner) and "steps" in step
    has_fe, has_until = "for_each" in step, "until" in step

    if inner:
        for f in INNER_FORBIDDEN:
            if f in step:
                errs.append(f"{w}: `{f}` is not allowed on a step inside a loop block (no nested loops).")
        has_fe = has_until = False
        if not isinstance(sid, str) or not SLUG.match(sid):
            errs.append(f"{w}: invalid id '{sid}'. Must be kebab-case.")
        elif sid in st.seen:
            errs.append(f"{w}: duplicate step id '{sid}'.")
        else:
            st.seen.add(sid)
        if not step.get("skill"):
            errs.append(f"{w}: missing `skill`.")
        if "agent" in step and (not isinstance(step["agent"], str) or not step["agent"].strip()):
            errs.append(f"{w}: `agent` must be a non-empty agent type name.")
        if "inline" in step and not isinstance(step["inline"], bool):
            errs.append(f"{w}: `inline` must be true or false.")
        if step.get("inline") is True and "agent" in step:
            errs.append(f"{w}: `inline: true` and `agent` are mutually exclusive.")

    if has_fe and has_until:
        errs.append(f"{w}: `for_each` and `until` are mutually exclusive (no nested or combined loops).")
    if is_block:
        for f in BLOCK_FORBIDDEN:
            if f in step:
                errs.append(f"{w}: `{f}` is not allowed on a loop block — put it on an inner step.")
        if not (has_fe or has_until):
            errs.append(f"{w}: a loop block needs `for_each` or `until`.")
        if not isinstance(step.get("steps"), list) or not step["steps"]:
            errs.append(f"{w}: `steps` must be a non-empty list.")
    if "max_iterations" in step and not inner:
        mi = step["max_iterations"]
        if not isinstance(mi, int) or isinstance(mi, bool) or not 1 <= mi <= MAX_ITERATIONS:
            errs.append(f"{w}: `max_iterations` must be an integer 1–{MAX_ITERATIONS}.")
        if not (has_fe or has_until):
            errs.append(f"{w}: `max_iterations` only applies to a step with `for_each` or `until`.")
    if has_until and "max_iterations" not in step:
        errs.append(f"{w}: `until` requires `max_iterations` (unbounded loops are rejected).")
    if "retry" in step and "retry" not in (BLOCK_FORBIDDEN if is_block else ()):
        r = step["retry"]
        if not isinstance(r, int) or isinstance(r, bool) or not 0 <= r <= MAX_RETRY:
            errs.append(f"{w}: `retry` must be an integer 0–{MAX_RETRY}.")
    if "continue_on_error" in step and not isinstance(step["continue_on_error"], bool):
        errs.append(f"{w}: `continue_on_error` must be true or false.")

    def check(field, text, **kw):
        if not isinstance(text, str):
            errs.append(f"{w}: `{field}` must be an expression string.")
            return
        try:
            node = parse(unwrap(text))
        except ExprError as e:
            errs.append(f"{w}: invalid `{field}` expression — {e}.")
            return
        errs.extend(_check_refs(f"{w} `{field}`", node, st, self_id=sid, **kw))

    # `if` runs before the loop starts, so only an inner step may use `item` / `index` there.
    in_loop = dict(allow_self=False, item_ok=inner and "for_each" in block, index_ok=inner)
    outer = dict(allow_self=False, item_ok=False, index_ok=False)
    if "if" in step:
        check("if", step["if"], **(in_loop if inner else outer))
    if has_fe:
        if isinstance(step["for_each"], list):
            for el in step["for_each"]:
                _check_template(errs, w, "for_each", el, st, sid, outer)
        else:
            check("for_each", step["for_each"], **outer)

    if is_block:
        st.blocks.add(sid)
        for j, child in enumerate(step["steps"] if isinstance(step.get("steps"), list) else []):
            if not isinstance(child, dict):
                errs.append(f"{w}: inner step {j} is not a map.")
                continue
            _validate_step(child, j, errs, st, block=step)
            st.looped.add(child.get("id"))
        if has_until:   # evaluated after each pass, so it may read the inner steps and the block itself
            check("until", step["until"], allow_self=True, item_ok=False, index_ok=True)
    else:
        if has_until:
            check("until", step["until"], allow_self=True, item_ok=False, index_ok=True)
        args = step.get("args") or step.get("inputs") or {}
        flags = (dict(allow_self=False, item_ok="for_each" in block, index_ok=True) if inner
                 else dict(allow_self=False, item_ok=has_fe, index_ok=has_fe or has_until))
        _check_template(errs, w, "args", args, st, sid, flags)

    st.earlier.append(sid)
    if has_fe or has_until:
        st.looped.add(sid)


def validate_workflow(wf: dict) -> list[str]:
    steps = [s for s in (wf.get("steps") or []) if isinstance(s, dict)]
    st = _State(s.get("id") for s in steps if s.get("id"))
    errs: list[str] = []
    for idx, step in enumerate(steps):
        _validate_step(step, idx, errs, st)
    return errs


def collect_outputs(run_dir: str, sid: str, block: str | None = None) -> list:
    """Gather a looped step's per-pass outputs, in pass order, into `<run_dir>/<sid>/outputs.json`.

    Plain loop: passes live in `<sid>/<k>/output.json`. Inner step of a loop block:
    `<block>/<k>/<sid>/output.json`. A pass that produced no output (a skipped inner step)
    contributes `null`, so positions line up with the pass index."""
    root = Path(run_dir)
    base = root / (block or sid)
    passes = sorted((p for p in base.iterdir() if p.is_dir() and p.name.isdigit()), key=lambda p: int(p.name)) \
        if base.exists() else []
    outs = [_plain(_read((p / sid if block else p) / "output.json")) for p in passes]
    (root / sid).mkdir(parents=True, exist_ok=True)
    (root / sid / "outputs.json").write_text(json.dumps(outs), encoding="utf-8")
    return outs


def find_step(plan: list[dict], sid: str):
    """Look a step up by id in a plan, descending into loop blocks."""
    for s in plan:
        if s["id"] == sid:
            return s
        found = find_step(s.get("steps") or [], sid)
        if found:
            return found
    return None


# ───────────────────────────── CLI ─────────────────────────────

def _load(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _ctx(args) -> Context:
    inputs = _load(args.parsed).get("inputs", {})
    item = None
    if args.item is not None:
        item = _load(args.item[1:]) if args.item.startswith("@") else json.loads(args.item)
    return Context(inputs, args.run_dir, item, args.index)


def step_value(plan_step: dict, what: str, ctx: Context):
    """Evaluate one templated field of a plan step. See the module docstring."""
    if what == "args":
        return render(plan_step.get("args") or {}, ctx)
    raw = plan_step.get(what)
    if what in ("if", "until"):
        return truthy(eval_expr(raw, ctx))
    if what == "for_each":
        items = [render(v, ctx) for v in raw] if isinstance(raw, list) else eval_expr(raw, ctx)
        if isinstance(items, str):
            try:
                items = json.loads(items)
            except ValueError:
                pass
        if not isinstance(items, list):
            raise ExprError("`for_each` did not resolve to a list")
        cap = plan_step.get("max_iterations") or MAX_ITERATIONS
        if len(items) > cap:
            raise ExprError(f"`for_each` has {len(items)} items; the cap is {cap}")
        return items
    raise ExprError(f"unknown field '{what}'")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="wf_eval")
    sub = ap.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("validate"); v.add_argument("parsed")
    co = sub.add_parser("collect")
    co.add_argument("run_dir"); co.add_argument("--id", required=True); co.add_argument("--block")
    st = sub.add_parser("step")
    st.add_argument("parsed"); st.add_argument("run_dir")
    st.add_argument("--plan", required=True); st.add_argument("--id", required=True)
    st.add_argument("--what", required=True, choices=["if", "until", "for_each", "args"])
    st.add_argument("--item"); st.add_argument("--index", type=int)
    for name in ("eval", "render"):
        p = sub.add_parser(name)
        p.add_argument("parsed"); p.add_argument("run_dir")
        p.add_argument("--item"); p.add_argument("--index", type=int)
        if name == "eval":
            p.add_argument("--expr", required=True); p.add_argument("--truthy", action="store_true")
        else:
            p.add_argument("--value", required=True)
    a = ap.parse_args(argv)
    try:
        if a.cmd == "validate":
            wf = _load(a.parsed)["workflow"]
            errs = validate_workflow(wf)
            print(json.dumps({"errors": errs}, indent=2))
            return 1 if errs else 0
        if a.cmd == "eval":
            val = eval_expr(a.expr, _ctx(a))
            print("true" if truthy(val) else "false") if a.truthy else print(json.dumps(val))
            return 0
        if a.cmd == "collect":
            print(json.dumps(collect_outputs(a.run_dir, a.id, a.block)))
            return 0
        if a.cmd == "step":
            plan = find_step(_load(a.plan)["plan"], a.id)
            if plan is None:
                raise ExprError(f"no step '{a.id}' in the plan")
            val = step_value(plan, a.what, _ctx(a))
            print(("true" if val else "false") if a.what in ("if", "until") else json.dumps(val))
            return 0
        print(json.dumps(render(json.loads(a.value), _ctx(a)), indent=2))
        return 0
    except ExprError as e:
        print(json.dumps({"errors": [str(e)]}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
