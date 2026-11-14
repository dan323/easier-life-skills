# ADR 0001 — A minimal, hand-parsed expression language, and loops over groups of steps

- **Status**: Accepted
- **Date**: 2026-11-14
- **Skill**: [`workflow`](../SKILL.md)
- **Issue**: [#129](https://github.com/dan323/easier-life-skills/issues/129)

> This ADR is **not** referenced from `SKILL.md` and is **not** loaded
> by the skill at runtime — `SKILL.md` is fed to the agent on every
> invocation, so design rationale belongs here instead.

## Context

Workflows ran a linear list of steps and halted on the first failure.
Real pipelines need to skip a step (`if`), repeat one (`for_each`,
`until`) and react to failure (`retry`, `continue_on_error`). Conditions
and loop lists need *some* expression language on top of the existing
`${{ … }}` references (`inputs.x`, `steps.<id>.output`).

Two things shape the choice:

- Workflow files can come from third parties (a plugin ships them), and
  the runner is an LLM agent with `Bash`. An expression that is passed to
  `eval()`, a shell, or `python -c` is arbitrary code execution from a
  YAML file.
- The runner is a prompt, not a program. If the agent is asked to
  "evaluate this condition", the result is non-deterministic and can
  disagree with what validation accepted.

## Decision

1. **A deliberately tiny language.** References, string / number /
   `true` / `false` / `null` literals, `==`, `!=`, numeric ordering
   (`<`, `<=`, `>`, `>=`), `!`, `&&`, `||` and parentheses. No
   arithmetic, no string operations, no function calls, no indexing syntax
   (a numeric path segment, `outputs.0`, covers it). Ordering is numeric
   only (numeric strings count, since inputs arrive as strings); a missing or
   non-numeric side is simply false rather than an error, so a loop never
   crashes on a skill that forgot to report a field.
2. **A hand-written tokeniser and recursive-descent parser**
   (`scripts/wf_eval.py`), never `eval()`. Anything outside the grammar is
   a syntax error at validation time, so workflow text cannot execute.
3. **The runner never evaluates expressions itself.** Validation
   (Phase 2), conditions, loop lists, `until` and argument rendering all
   go through the same script. The agent reads `true` / `false` / JSON from
   it. This is also why Phase 3 stopped pre-resolving `${{ … }}` into
   placeholder markers: values are rendered at run time, from the files the
   previous steps actually wrote.
4. **JavaScript-like truthiness**: `null`, `false`, `0`, `""`, `[]`, `{}`
   are falsy, everything else truthy (so `"false"` is truthy). `==`
   compares scalars by their string form, because CLI inputs always arrive
   as strings (`"3" == 3`). A missing key, or the output of a skipped step,
   is `null`.
5. **Every loop is bounded.** `until` requires `max_iterations`;
   `max_iterations` and `for_each` length are capped at 100 and `retry`
   at 5. Exceeding a cap is an error, never a silent truncation. Hitting
   `max_iterations` with `until` still false fails the step.
6. **A loop is either one step or a flat *block* of steps; no `else`, no
   nesting.** A step with `for_each` / `until` repeats itself. A step with
   a `steps:` list (a *loop block*) repeats its inner steps together, which
   is what "review, fix, repeat until the review is clean" needs: a
   per-step loop cannot express a cycle across two steps. Inner steps are
   ordinary steps (own `agent` / `inline`, `if`, `retry`,
   `continue_on_error`) but cannot loop or contain blocks. The negated
   condition on another step expresses `else`.
7. **Blocks keep a flat namespace.** Inner step ids are global and
   `steps.<inner>.*` always reads the **latest pass**: the runner mirrors
   each pass's files to `<inner>/` (archiving them under
   `<block>/<k>/<inner>/`) and deletes the mirrored output of an inner step
   that was skipped on this pass, so a skipped step never exposes a stale
   output. This keeps `wf_eval.py`'s reference lookup identical for plain
   steps, loops and blocks. The cost is that two passes cannot be compared
   inside the block (an inner step may read only steps listed before it);
   the full history is available afterwards as `steps.<inner>.outputs`.
8. **Skipped is not failed.** A step skipped by `if` has status `skipped`,
   no output, and never fails the workflow. A tolerated failure
   (`continue_on_error`) makes the workflow `partial`.

## Alternatives considered

- **`eval()` / `python -c` on the expression.** Rejected: arbitrary code
  execution from a YAML file.
- **Repeating several steps by unrolling** (`review-1`, `fix-1`, `review-2`,
  `fix-2`, … each with an `if`). Works with no new feature, but the round
  count is baked into the file, every copy must be kept in sync, and the
  summary is noise. Rejected as the answer to a basic use case.
- **Nested blocks / one generic `loop:` construct everywhere.** More
  general, but needs hierarchical references (`steps.a.steps.b`) and a
  recursive on-disk layout. The flat block covers the review/fix cycle.
- **A fuller language (Jinja, JMESPath, CEL, JSONPath).** More power
  than any workflow here needs, and each adds a dependency or a large
  grammar to specify, validate and test. The standard-library-only constraint
  already applies to the runner's YAML parser. Richer operators can be added
  later without breaking existing workflows (they are currently syntax errors).
- **Let the agent judge conditions in natural language.** Rejected: not
  reproducible, and validation could not reject a bad condition up front.
- **Only declarative fields (`skip_if_empty: steps.x.output`).** Covers the
  review-fixer example but not "retry until checks pass" or "run only when
  the previous step failed".

## Consequences

- Existing workflows run unchanged: none of the new fields is required,
  and a workflow without them takes one run per step. Each step now also
  gets a small `status.json`, which Phase 5 reads instead of inferring status
  from file existence.
- The runner depends on `${CLAUDE_PLUGIN_ROOT}/scripts/wf_eval.py` and
  `python3`, as the runner already did for its other helper snippets. The
  script has its own unit tests (`scripts/test_wf_eval.py`, run with
  `python3 -m unittest`); they are not part of the vitest CI suite.
- A loop over a group depends on skills reporting something to test. `pr-reviewer`
  now writes `{"findings": N, …}` to `$WORKFLOW_OUTPUT` (task-agent 2.2.0);
  a skill that writes nothing can only be bounded by `max_iterations`.
- `retry` re-runs the whole step, so it is only safe on idempotent steps. The
  runner cannot tell: that is the workflow author's call, documented in
  `format.md`. `task-agent` is the counter-example (it opens a PR before it
  records state and output), which is why the shipped examples do not retry it.
- An `until` iteration that fails is not retried by the loop itself: use
  `retry` for "the same run again" and `until` + `continue_on_error` for "run
  until a condition holds".
- Because no operator can fail at runtime on missing data (a missing key
  is `null`), a typo in a *key* inside `steps.<id>.output.<key>` silently
  evaluates falsy. Validation checks the shape of references (`steps.<id>`
  exists and is earlier, `outputs` only on looped steps), not the keys a skill
  emits, which are not declared anywhere.
