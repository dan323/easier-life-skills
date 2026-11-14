"""Tests for wf_eval.py. Run: python3 -m unittest plugins/workflow/scripts/test_wf_eval.py -v"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import wf_eval as w  # noqa: E402


def make_run(tmp, steps):
    """steps: {id: {"status":..., "output": json|str|None, "outputs": list|None, ...}}"""
    for sid, spec in steps.items():
        d = Path(tmp) / sid
        d.mkdir(parents=True)
        st = {"status": spec.get("status", "success")}
        st.update({k: spec[k] for k in ("attempts", "iterations") if k in spec})
        (d / "status.json").write_text(json.dumps(st))
        if "output" in spec:
            (d / "output.json").write_text(json.dumps(spec["output"]))
        if "outputs" in spec:
            (d / "outputs.json").write_text(json.dumps(spec["outputs"]))


class Eval(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        make_run(self.tmp.name, {
            "build": {"status": "success", "output": {"ok": True, "count": 3, "items": ["a", "b"]}},
            "flaky": {"status": "failed", "attempts": 3},
            "skipped": {"status": "skipped"},
            "plain": {"status": "success", "output": {"stdout": "hello"}},
            "loop": {"status": "success", "iterations": 2, "output": {"n": 2}, "outputs": [{"n": 1}, {"n": 2}]},
        })
        self.ctx = w.Context({"mode": "fast", "n": "3", "empty": ""}, self.tmp.name)

    def ev(self, src, **kw):
        ctx = w.Context(self.ctx.inputs, self.tmp.name, **kw)
        return w.eval_expr(src, ctx)

    def test_references(self):
        self.assertEqual(self.ev("steps.build.status"), "success")
        self.assertEqual(self.ev("steps.build.output.count"), 3)
        self.assertEqual(self.ev("steps.build.output.items.1"), "b")
        self.assertEqual(self.ev("steps.plain.output"), "hello")          # stdout fallback is a string
        self.assertEqual(self.ev("steps.flaky.attempts"), 3)
        self.assertEqual(self.ev("steps.loop.outputs.0.n"), 1)
        self.assertEqual(self.ev("steps.loop.iterations"), 2)
        self.assertIsNone(self.ev("steps.skipped.output"))
        self.assertEqual(self.ev("steps.skipped.status"), "skipped")
        self.assertIsNone(self.ev("steps.build.output.missing"))
        self.assertEqual(self.ev("inputs.mode"), "fast")
        self.assertEqual(self.ev("inputs.nope"), None)

    def test_hyphenated_step_ids(self):
        make_run(self.tmp.name + "/h", {"run-task": {"status": "success"}})
        ctx = w.Context({}, self.tmp.name + "/h")
        self.assertEqual(w.eval_expr("steps.run-task.status == 'success'", ctx), True)

    def test_operators_and_precedence(self):
        self.assertTrue(self.ev('steps.build.status == "success" && !steps.skipped.output'))
        self.assertTrue(self.ev("false || true && true"))
        self.assertFalse(self.ev("(false || true) && false"))
        self.assertTrue(self.ev("steps.flaky.status != 'success'"))
        self.assertTrue(self.ev("!!inputs.mode"))
        self.assertFalse(self.ev("!inputs.mode"))

    def test_truthiness(self):
        for falsy in ("inputs.empty", "inputs.nope", "steps.skipped.output", "0", "null", "false"):
            self.assertFalse(w.truthy(self.ev(falsy)), falsy)
        for ok in ("inputs.mode", "steps.build.output.items", "1", "true", "steps.build.output.ok"):
            self.assertTrue(w.truthy(self.ev(ok)), ok)

    def test_equality_coerces_cli_strings(self):
        self.assertTrue(self.ev("inputs.n == 3"))
        self.assertTrue(self.ev("steps.build.output.ok == true"))
        self.assertTrue(self.ev("steps.skipped.output == null"))
        self.assertFalse(self.ev("inputs.empty == null"))

    def test_ordering(self):
        self.assertTrue(self.ev("inputs.n < 5"))
        self.assertTrue(self.ev("inputs.n >= 3 && steps.build.output.count <= 3"))
        self.assertTrue(self.ev("steps.build.output.count > 2"))
        self.assertFalse(self.ev("inputs.nope < 1"))             # missing side
        self.assertFalse(self.ev('"a" < "b"'))                   # not numeric: never true
        self.assertFalse(self.ev("steps.skipped.output >= 0"))
        self.assertTrue(self.ev("!(steps.build.output.count < 1)"))
        self.assertTrue(self.ev("index < 3", item=None, index=2))

    def test_loop_vars(self):
        self.assertEqual(self.ev("item.id", item={"id": 7}, index=1), 7)
        self.assertTrue(self.ev("index == 1", item="x", index=1))

    def test_syntax_errors(self):
        for bad in ("", "a &&", "(a", "a b", "a = b", "steps..x", "'unterminated"):
            with self.assertRaises(w.ExprError, msg=bad):
                w.parse(bad)

    def test_no_code_execution(self):
        for bad in ("__import__('os').system('x')", "1+1", "inputs.mode.upper()"):
            with self.assertRaises(w.ExprError, msg=bad):
                w.parse(bad)

    def test_render_types(self):
        r = w.render({"a": "${{ steps.build.output.items }}", "b": "n=${{ inputs.n }}!",
                      "c": "${{ steps.build.output.ok }}", "d": ["${{ index }}", 5]},
                     w.Context(self.ctx.inputs, self.tmp.name, index=4))
        self.assertEqual(r, {"a": ["a", "b"], "b": "n=3!", "c": True, "d": [4, 5]})
        self.assertEqual(w.render("x ${{ steps.skipped.output }} y", self.ctx), "x  y")
        self.assertEqual(w.render("t=${{ steps.build.output.ok }}", self.ctx), "t=true")

    def test_for_each_accepts_json_array_string(self):
        ctx = w.Context({"names": '["alpha","beta"]', "bad": "not json"}, self.tmp.name)
        self.assertEqual(w.step_value({"for_each": "${{ inputs.names }}"}, "for_each", ctx), ["alpha", "beta"])
        with self.assertRaises(w.ExprError):
            w.step_value({"for_each": "${{ inputs.bad }}"}, "for_each", ctx)

    def test_unwrap(self):
        self.assertEqual(w.unwrap("${{ a == b }}"), "a == b")
        self.assertEqual(w.unwrap("a == b"), "a == b")
        with self.assertRaises(w.ExprError):
            w.unwrap("${{ a }} && ${{ b }}")


def wf(*steps):
    return {"name": "t", "description": "d", "steps": list(steps)}


def errs(*steps):
    return w.validate_workflow(wf(*steps))


class Validate(unittest.TestCase):
    def test_legacy_workflow_is_clean(self):
        self.assertEqual(errs(
            {"id": "a", "skill": "s", "args": {"n": "${{ inputs.n }}"}},
            {"id": "b", "skill": "s", "inputs": {"p": "${{ steps.a.output }}", "q": "${{ steps.a.output.k }}"}},
        ), [])

    def test_forward_and_self_reference(self):
        e = errs({"id": "a", "skill": "s", "args": {"x": "${{ steps.b.output }}"}}, {"id": "b", "skill": "s"})
        self.assertTrue(any("has not run yet" in m for m in e), e)
        e = errs({"id": "a", "skill": "s", "args": {"x": "${{ steps.a.output }}"}})
        self.assertTrue(any("has not run yet" in m for m in e), e)

    def test_if(self):
        self.assertEqual(errs({"id": "a", "skill": "s"},
                              {"id": "b", "skill": "s", "if": "${{ steps.a.status == 'success' }}"}), [])
        e = errs({"id": "a", "skill": "s", "if": "${{ steps.a.status }}"})
        self.assertTrue(any("has not run yet" in m for m in e), e)
        e = errs({"id": "a", "skill": "s", "if": "${{ a && }}"})
        self.assertTrue(any("invalid `if` expression" in m for m in e), e)
        e = errs({"id": "a", "skill": "s", "for_each": "x", "if": "${{ item }}"})
        self.assertTrue(any("`item` is only available" in m for m in e), e)

    def test_until_requires_cap(self):
        e = errs({"id": "a", "skill": "s", "until": "${{ steps.a.status == 'success' }}"})
        self.assertTrue(any("requires `max_iterations`" in m for m in e), e)
        self.assertEqual(errs({"id": "a", "skill": "s", "until": "${{ steps.a.status == 'success' }}",
                               "max_iterations": 3, "continue_on_error": True}), [])
        for bad in (0, 101, "3", True):
            e = errs({"id": "a", "skill": "s", "until": "true", "max_iterations": bad})
            self.assertTrue(any("`max_iterations` must be" in m for m in e), (bad, e))

    def test_loop_exclusions(self):
        e = errs({"id": "a", "skill": "s", "for_each": "${{ inputs.xs }}", "until": "true", "max_iterations": 2})
        self.assertTrue(any("mutually exclusive" in m for m in e), e)
        e = errs({"id": "a", "skill": "s", "max_iterations": 2})
        self.assertTrue(any("only applies" in m for m in e), e)

    def test_for_each_scope(self):
        self.assertEqual(errs(
            {"id": "a", "skill": "s"},
            {"id": "b", "skill": "s", "for_each": "${{ steps.a.output.items }}", "max_iterations": 5,
             "args": {"it": "${{ item.id }}", "i": "${{ index }}"}},
            {"id": "c", "skill": "s", "args": {"all": "${{ steps.b.outputs }}"}},
        ), [])
        e = errs({"id": "a", "skill": "s", "args": {"it": "${{ item }}"}})
        self.assertTrue(any("`item` is only available" in m for m in e), e)
        e = errs({"id": "a", "skill": "s"}, {"id": "b", "skill": "s", "args": {"x": "${{ steps.a.outputs }}"}})
        self.assertTrue(any("exists only on steps with" in m for m in e), e)
        self.assertEqual(errs({"id": "a", "skill": "s", "for_each": ["x", "${{ inputs.y }}"]}), [])

    def test_retry_and_continue(self):
        self.assertEqual(errs({"id": "a", "skill": "s", "retry": 5, "continue_on_error": False}), [])
        for bad in (-1, 6, "2"):
            e = errs({"id": "a", "skill": "s", "retry": bad})
            self.assertTrue(any("`retry` must be" in m for m in e), (bad, e))
        e = errs({"id": "a", "skill": "s", "continue_on_error": "yes"})
        self.assertTrue(any("continue_on_error" in m for m in e), e)

    def test_bad_step_field(self):
        e = errs({"id": "a", "skill": "s"}, {"id": "b", "skill": "s", "args": {"x": "${{ steps.a.bogus }}"}})
        self.assertTrue(any("invalid steps expression" in m for m in e), e)


def block(**kw):
    inner = kw.pop("steps", [
        {"id": "review", "skill": "pr-reviewer"},
        {"id": "fix", "skill": "review-fixer", "if": "${{ steps.review.output.findings }}"},
    ])
    return {"id": "loop", "steps": inner, "max_iterations": 5,
            "until": "${{ steps.review.output.findings == 0 }}", **kw}


class Blocks(unittest.TestCase):
    def test_review_until_clean(self):
        self.assertEqual(errs({"id": "pr", "skill": "task-agent"}, block(),
                              {"id": "done", "skill": "s", "args": {"n": "${{ steps.fix.outputs }}",
                                                                    "m": "${{ steps.loop.iterations }}"}}), [])

    def test_inner_steps_keep_per_step_agent_and_retry(self):
        self.assertEqual(errs(block(steps=[
            {"id": "review", "skill": "a", "agent": "reviewer", "retry": 1},
            {"id": "fix", "skill": "b", "inline": True, "continue_on_error": True}])), [])
        e = errs(block(steps=[{"id": "review", "skill": "a", "agent": "x", "inline": True}]))
        self.assertTrue(any("mutually exclusive" in m for m in e), e)

    def test_block_needs_exactly_one_loop_and_cap(self):
        b = block(); del b["until"]; del b["max_iterations"]
        self.assertTrue(any("needs `for_each` or `until`" in m for m in errs(b)), errs(b))
        b = block(); del b["max_iterations"]
        self.assertTrue(any("requires `max_iterations`" in m for m in errs(b)), errs(b))
        b = block(for_each="${{ inputs.xs }}")
        self.assertTrue(any("mutually exclusive" in m for m in errs(b)), errs(b))
        self.assertEqual(errs({"id": "each", "for_each": "${{ inputs.xs }}", "max_iterations": 3,
                               "steps": [{"id": "one", "skill": "s", "args": {"x": "${{ item }}", "i": "${{ index }}"}}]}), [])

    def test_no_nesting_and_leaf_fields_on_block(self):
        inner = [{"id": "a", "skill": "s", "until": "true", "max_iterations": 2}]
        self.assertTrue(any("no nested loops" in m for m in errs(block(steps=inner))))
        inner = [{"id": "a", "skill": "s"}, {"id": "b", "steps": [{"id": "c", "skill": "s"}]}]
        self.assertTrue(any("no nested loops" in m for m in errs(block(steps=inner))))
        for f, v in (("skill", "x"), ("args", {"a": 1}), ("agent", "x"), ("inline", True), ("retry", 1)):
            e = errs(block(**{f: v}))
            self.assertTrue(any(f"`{f}` is not allowed on a loop block" in m for m in e), (f, e))
        self.assertTrue(any("non-empty list" in m for m in errs(block(steps=[]))))

    def test_inner_ids_are_global_and_valid(self):
        e = errs({"id": "review", "skill": "s"}, block())
        self.assertTrue(any("duplicate step id 'review'" in m for m in e), e)
        e = errs(block(steps=[{"id": "Bad_Id", "skill": "s"}]))
        self.assertTrue(any("invalid id" in m for m in e), e)
        e = errs(block(steps=[{"id": "a"}]))
        self.assertTrue(any("missing `skill`" in m for m in e), e)

    def test_reference_scope(self):
        e = errs(block(steps=[{"id": "review", "skill": "s", "args": {"x": "${{ steps.fix.output }}"}},
                              {"id": "fix", "skill": "s"}]))
        self.assertTrue(any("has not run yet" in m for m in e), e)             # no forward refs inside a pass
        e = errs(block(), {"id": "after", "skill": "s", "args": {"x": "${{ steps.loop.output }}"}})
        self.assertTrue(any("a loop block has no output" in m for m in e), e)
        e = errs({"id": "x", "skill": "s", "args": {"i": "${{ index }}"}}, block())
        self.assertTrue(any("`index` is only available" in m for m in e), e)
        e = errs(block(until="${{ steps.later.status == 'x' }}"), {"id": "later", "skill": "s"})
        self.assertTrue(any("has not run yet" in m for m in e), e)
        self.assertEqual(errs(block(until="${{ index >= 2 || steps.loop.iterations > 3 }}")), [])

    def test_item_only_with_for_each_block(self):
        e = errs(block(steps=[{"id": "a", "skill": "s", "args": {"x": "${{ item }}"}}]))
        self.assertTrue(any("`item` is only available" in m for m in e), e)

    def test_find_step_descends_into_blocks(self):
        plan = [{"id": "a"}, {"id": "loop", "steps": [{"id": "review"}, {"id": "fix"}]}]
        self.assertEqual(w.find_step(plan, "fix"), {"id": "fix"})
        self.assertEqual(w.find_step(plan, "loop")["id"], "loop")
        self.assertIsNone(w.find_step(plan, "nope"))


class Collect(unittest.TestCase):
    def test_plain_loop_and_block_inner(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for k, v in enumerate(({"n": 1}, {"n": 2}, {"n": 3})):         # plain loop: loop/<k>/output.json
                (root / "loop" / str(k)).mkdir(parents=True)
                (root / "loop" / str(k) / "output.json").write_text(json.dumps(v))
            self.assertEqual(w.collect_outputs(tmp, "loop"), [{"n": 1}, {"n": 2}, {"n": 3}])
            self.assertEqual(json.loads((root / "loop" / "outputs.json").read_text()), [{"n": 1}, {"n": 2}, {"n": 3}])
            for k in range(10, -1, -1):                                    # block: numeric (not lexical) order
                (root / "blk" / str(k) / "review").mkdir(parents=True)
                (root / "blk" / str(k) / "review" / "output.json").write_text(json.dumps({"findings": k}))
            (root / "blk" / "3" / "fix").mkdir(parents=True)               # fix skipped on every pass but one
            (root / "blk" / "3" / "fix" / "output.json").write_text(json.dumps({"stdout": "fixed"}))
            reviews = w.collect_outputs(tmp, "review", block="blk")
            self.assertEqual([r["findings"] for r in reviews], list(range(11)))
            fixes = w.collect_outputs(tmp, "fix", block="blk")
            self.assertEqual(fixes[3], "fixed")
            self.assertEqual(fixes.count(None), 10)
            self.assertEqual(w.collect_outputs(tmp, "ghost", block="nope"), [])


class Cli(unittest.TestCase):
    def test_cli_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            make_run(tmp, {"a": {"status": "success", "output": {"v": 1}}})
            parsed = Path(tmp) / "parsed.json"
            parsed.write_text(json.dumps({"workflow": wf({"id": "a", "skill": "s"}), "inputs": {"k": "v"}}))
            self.assertEqual(w.main(["validate", str(parsed)]), 0)
            self.assertEqual(w.main(["eval", str(parsed), tmp, "--expr", "steps.a.output.v == 1", "--truthy"]), 0)
            self.assertEqual(w.main(["eval", str(parsed), tmp, "--expr", "a &&", "--truthy"]), 2)

    def test_step_subcommand(self):
        with tempfile.TemporaryDirectory() as tmp:
            make_run(tmp, {"a": {"status": "success", "output": {"items": [{"id": 1}, {"id": 2}], "ok": True}}})
            parsed, plan = Path(tmp) / "parsed.json", Path(tmp) / "plan.json"
            parsed.write_text(json.dumps({"workflow": {}, "inputs": {"dry": ""}}))
            plan.write_text(json.dumps({"plan": [
                {"id": "b", "skill": "s", "if": "${{ !inputs.dry && steps.a.output.ok }}",
                 "for_each": "${{ steps.a.output.items }}", "max_iterations": 2,
                 "args": {"id": "${{ item.id }}", "i": "${{ index }}"}},
                {"id": "c", "skill": "s", "for_each": "${{ steps.a.output.items }}", "max_iterations": 1},
                {"id": "d", "skill": "s", "for_each": "${{ steps.a.output.ok }}"},
                {"id": "e", "skill": "s", "for_each": [{"k": "${{ inputs.dry }}x"}, "y"]},
            ]}))
            base = [str(parsed), tmp, "--plan", str(plan)]
            import contextlib, io
            def run(*a):
                buf = io.StringIO()
                with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(io.StringIO()):
                    rc = w.main(["step", *base, *a])
                return rc, buf.getvalue().strip()
            self.assertEqual(run("--id", "b", "--what", "if"), (0, "true"))
            self.assertEqual(json.loads(run("--id", "b", "--what", "for_each")[1]), [{"id": 1}, {"id": 2}])
            rc, out = run("--id", "b", "--what", "args", "--item", '{"id": 2}', "--index", "1")
            self.assertEqual((rc, json.loads(out)), (0, {"id": 2, "i": 1}))
            self.assertEqual(run("--id", "c", "--what", "for_each")[0], 2)      # over the cap
            self.assertEqual(run("--id", "d", "--what", "for_each")[0], 2)      # not a list
            self.assertEqual(json.loads(run("--id", "e", "--what", "for_each")[1]), [{"k": "x"}, "y"])
            self.assertEqual(run("--id", "zzz", "--what", "if")[0], 2)


if __name__ == "__main__":
    unittest.main()
