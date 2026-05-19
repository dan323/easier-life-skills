# Plan — state-machine-invariants

Design rationale, decisions, and v1 caveats for the
`state-machine-invariants` skill. **This file is not read by the skill at
runtime** — it exists so the SKILL.md can stay a tight runbook and the
design context lives somewhere durable. Update it whenever a decision below
changes or a new one is taken.

## Context

The skill finds bugs and reports safety invariants in user-authored state
machines. Audience: working developers who use XState or hand-roll FSMs and
have never reached for TLA+ / SPIN / Alloy. The skill is read-only on the
user's source — it writes only `*.fsm.ir.json` sidecars next to each input
and one `state-machine-invariants-report.json` in the working directory.

## Decisions

### D1 — Inputs: XState configs + a tiny YAML schema; nothing else for v1

- **XState v5 `createMachine(...)` configs in TS / JS / TSX / JSX** are the
  primary audience. The argument is largely a static object literal so a
  Babel/acorn parse can lift it without executing user code. Function-typed
  guards are recorded but listed as opaque caveats.
- **`*.fsm.yaml` schema** is the escape hatch for non-XState users and the
  stable form used by every eval fixture (so CI doesn't need a JS toolchain).
  The format is specified in
  [`../../references/fsm-yaml.md`](../../references/fsm-yaml.md) with a
  machine-readable JSON Schema at
  [`../../references/fsm-yaml.schema.json`](../../references/fsm-yaml.schema.json).
  Canonical example: [`../../examples/order.fsm.yaml`](../../examples/order.fsm.yaml).
  v1.0 is **flat-only**; hierarchical YAML is a v1.1 candidate (see below).
- **Rejected:** hand-rolled `switch (state)` enums in TS / Go / Java / Rust.
  Recovering an implicit FSM from imperative code is a per-language
  control-flow problem with weak signal — the user has already lost most of
  the structure the analysis needs. Translate to `.fsm.yaml` instead.
- **Rejected:** SCXML, TLA+, Alloy, Promela. Existing heavyweight tooling
  owns those; we're not competing.

### D2 — Five invariants for v1

| Invariant            | Maths                                                                                  | Catches                                          |
|----------------------|----------------------------------------------------------------------------------------|--------------------------------------------------|
| Reachability         | `s ∈ orbit(initial)` under the transition relation                                     | declared states no event sequence can reach      |
| Deadlock             | non-final sink in the transition graph                                                 | user-stuck states                                |
| Dead transitions     | guard's denotation is the empty set (literal `false` only in v1)                       | transitions that never fire                      |
| Overlapping guards   | non-functional transition relation on `(state, event)`                                 | XState first-match silently shadows alternatives |
| Unused events        | `e ∉ image(π_event)`; transition relation not total on the input alphabet              | dead members of an event union type              |

Each invariant maps to a one-line statement in category theory / algebra; the
report can surface that line per finding under the `with_math` flag (see D5).

**Deferred to v1.1+:** strongly-connected-component analysis (non-terminating
loops), final-state reachability ("can the machine actually terminate?"),
concurrent-region safety beyond plain flattening, idle-state detection,
guard coverage gaps (every `(state, event)` has at least one satisfiable
transition).

### D3 — Flatten hierarchical and parallel states

Compound and parallel XState states are unfolded into a flat product
automaton in Phase 4. The invariants in D2 then run on the flat machine.

- A compound state `S` with children `{c1, c2}` and initial `c1` becomes
  atomic states `S.c1`, `S.c2`; transitions on `S` apply to both.
- A parallel state `P` with regions `[R1, R2]` and atomic substates
  `R1 ∈ {a, b}`, `R2 ∈ {x, y}` becomes atomic states `{a|x, a|y, b|x, b|y}`.
- A `max_flat_states` arg (default `1000`) bounds the product — a spec that
  blows past it is skipped with that reason.

**Rejected:** refusing hierarchical machines outright (a large fraction of
real XState configs would fall out) and "analyse top level, ignore children"
(misses the bugs that matter — they almost always live inside compound
states).

### D4 — Guard analysis stays literal + syntactic in v1

- `Literal(false)` and trivially-folded constants → flagged as dead.
- Overlapping guards detected by **AST equality** on the `expr` field, not
  by semantic equivalence: `a > b` and `b < a` are treated as distinct.
- Function-typed guards are opaque; recorded in `caveats` and never trigger
  findings.

**Rejected:** a hand-rolled symbolic checker over int/bool/string comparisons
(would catch `a > 5 && a < 3` and disjoint-range overlaps), and a real SMT
solver via `z3-solver`. Both are v1.1 candidates; both were over-budget for
v1 given the wedge value of the cheaper checks.

### D5 — Math one-liners are opt-in via `with_math`

Default report is mundane. Adding `with_math` or `with_math=true` to the
skill's arguments appends one short categorial/algebraic line under each
finding (e.g. `passwordReset ∉ orbit(loggedOut)`).

**Rejected:** always-inline (jargon noise for working devs) and out-entirely
(strips a small but interesting layer the skill is uniquely positioned to
provide). Behind a flag we keep the default clean and let math-curious users
surface the structure on demand.

### D6 — Exit code is opt-in via `fail_on_findings`

Default exit code is `0` whether or not there are findings — surprising
interactive users with a non-zero exit "because we found something" is a
papercut. CI users who want the gating behaviour pass `fail_on_findings` (or
`fail_on_findings=true`); the skill then exits `1` if any finding of
severity `warning` or higher is reported.

**Rejected:** unconditional `exit 1 on findings` (matches lint conventions
but worse interactive UX) and "always exit 0, severity in report only"
(adds friction to the CI use case).

### D7 — IR sidecar next to each spec

Phase 3 writes a normalized `<spec>.fsm.ir.json` next to each successfully
parsed input. The same path is reused by Phase 4 (which rewrites it with
`"flattened": true`) and is the artefact every eval compares against.

**Why next to the source** (not a cache directory): debugging a skipped or
mis-parsed spec is much easier when the IR sits beside the source file. Add
`*.fsm.ir.json` and `state-machine-invariants-report.json` to `.gitignore`
if the sidecars shouldn't be tracked.

## What v1 explicitly does **not** do

Analysis depth limitations:

- **No semantic guard analysis.** `a > b` vs. `b < a` are treated as
  distinct. Internal contradictions like `a > 5 && a < 3` are not flagged.
- **No reachability under guards.** Reachability ignores guards (treats
  every non-`literalFalse` guard as satisfiable). A state reachable only
  through unsatisfiable paths is incorrectly reported as reachable.
- **No SCC / cycle analysis.** Non-terminating loops are out of scope; no
  final-state reachability check ("can the machine ever halt?").
- **No context / extended-state flow.** XState's `context` mutates via
  actions; guards reference it (`ctx.balance > 0`). v1 records `expr`
  guards as opaque strings and never traces context updates — so dead
  guards reachable only through context contradictions go unflagged.
- **Function-typed XState guards stay opaque.** They appear in the IR
  with `type: "function"` and the spec gets a caveat, but they never
  trigger a finding. Real XState configs use inline functions heavily, so
  a large fraction of overlap bugs in the wild are invisible to v1.
- **Actions, entry/exit handlers, invoked services, delayed transitions,
  `after:` blocks** are parsed by the extractor and then discarded. No
  analysis layer touches them — no "two actions on the same transition
  conflict", no "this service is never stopped", no `delayed.until`
  reachability.
- **Event payloads collapse to event names.** XState v5 discriminated
  event unions all look identical to v1 — a transition guarded by
  `event.admin === true` is not distinguishable from one guarded by
  `event.admin === false` if they share the same event tag.

Input-format limitations:

- **Hand-rolled `switch (state)` enums are unsupported** (TS / Go / Java
  / Rust / Python). Authors must translate to a `.fsm.yaml` alongside.
- **XState v4 (`Machine()` form) is unsupported** — only v5
  (`createMachine()`). The extractor doesn't recognise the v4 shape.
- **Other state-machine libraries are unsupported** — Robot3,
  statecharts.dev, Redux Toolkit slices, Akka FSM, Go's `fsm` package,
  none of these have an extractor. Authors translate to `.fsm.yaml` or
  add an extractor in v1.1+.
- **SCXML, TLA+, Alloy, Promela**: rejected — those have their own
  heavyweight tooling; this skill is not competing.
- **Parallel XState states are skipped at Phase 4** (`flatten.py` exits
  8). The extractor lifts them into the IR; the flattener refuses them
  pending v1.1's product-automaton work. Until then, any XState config
  using `type: parallel` produces *no* analysis at all.

Output limitations:

- **No source-position diagnostics.** Findings reference state names and
  event names but never file path + line + column. Babel's `loc` info
  and a position-tracking YAML loader could carry this through; v1
  discards it.
- **No diff / changeset mode.** Always analyses the full tree. "Did this
  PR introduce a new violation?" is unanswerable today.
- **No autofix.** Findings are read-only output. Despite the AI layer
  being well-positioned to *propose* fixes, v1 only reports.

## v1.1+ candidates

Analysis depth:

- Symbolic guard checker for integer / boolean / string-equality
  comparisons (would catch `a > 5 && a < 3` and disjoint-range overlaps
  without an SMT dep).
- `z3-solver` integration for full SMT-grade overlap and dead-guard
  analysis (the heavier alternative to the hand-rolled symbolic checker).
- SCC analysis: non-terminating loops; final-state reachability.
- Context-flow analysis: propagate context updates from actions to
  refine guard satisfiability (`ctx.balance` after `assign` actions).
- Action / service / delay analysis: surface conflicting actions on the
  same transition, services that no exit transition stops, delayed
  transitions whose `delay` is provably never reached.
- Concurrent-region conflict detection beyond plain flattening.

Input formats:

- XState v4 (`Machine()`) extractor — separate script or a multi-form
  recogniser in `extract-xstate.cjs`.
- Per-language hand-rolled-enum recovery (TypeScript first), guarded by
  an explicit `--from-enum` flag because the recovery is heuristic.
- Hierarchical `.fsm.yaml` (compound + parallel directly in YAML, not
  just XState) — today flat-only.
- Robot3, statecharts.dev, Redux Toolkit slices — most common targets.
- Event-payload-aware transitions: distinguish guards over discriminated
  event unions.

Output / UX:

- Source-position propagation (`file:line:col` on every finding).
  Babel `loc` is already on every AST node; we discard it.
- Diff / changeset mode (`smi audit --since main`) — compare current
  findings against a baseline, surface only the new ones. PR-gate use.
- Autofix mode (`smi audit --fix`) — remove shadowed transitions, delete
  unreached states, prune `literalFalse` guards. Each fix surfaced as a
  patch the user accepts or rejects, not applied blindly.

Infrastructure:

- End-to-end driver script — a `smi audit` entry point that owns Phase 2
  → Phase 6 inside one process so the agent stops orchestrating the
  pipeline by hand (see "Implementation debt" below).
- IR JSON Schema — schema-validate `*.fsm.ir.json` between phases. We
  validate the user's `.fsm.yaml` input but not the IR; a buggy
  extractor can emit malformed IR and the next stage crashes with an
  unhelpful traceback.
- Editor / CI integrations: `eslint-plugin-state-machine-invariants` (or
  similar) so the five findings show up next to the code in VS Code,
  and a GitHub Action wrapper that runs `--fail-on-findings` on PR.

## Known v1.0 implementation debt

These are *not* deferred features — they are gaps in how v1.0 ships that
we'd close before adding any v1.1 feature. They survive in v1.0 because
nothing in CI catches them today.

- **Agent-side orchestration is fragile.** `SKILL.md` instructs the
  agent to loop over specs, invoke 4 scripts per spec, track failures
  via `record_skipped.py`, assemble the run-summary JSON, and pipe it
  into `report.py` — all in prose. There is no top-level driver that
  enforces the contract. If the agent forgets to call
  `record_skipped.py` on a non-zero extractor exit, the affected spec
  silently reports zero findings instead of being listed as skipped.
- **`record_skipped.py` has no self-test.** It is small but
  load-bearing for skip-tracking correctness across the whole report.
- **Evals don't reference the canonical example.** Each eval rebuilds
  its fixture inline; `examples/order.fsm.yaml` is read only by
  `normalize_yaml.py`'s self-test. The example file is half-orphaned.
- **No automated integration test** of the full SKILL.md pipeline. Each
  script self-tests in isolation; nothing in CI proves that the agent's
  Phase 2 → Phase 6 walk produces the documented report. Manual `bash`
  verification was done twice during development; that's all.
- **IR shape asymmetry between `compound` and `parallel`.** `compound`
  is `{state: {initial, children}}`; `parallel` is `{state:
  [region_names]}`. Awkward once v1.1's product-automaton work lands.
- **`SKILL.md` does not link to this `plan.md`.** Intentional per the
  "SKILL.md is action-only" rule (every word in `SKILL.md` costs
  runtime context tokens), but the file is then only discoverable by
  filesystem navigation. Worth a single line in the README plugin row
  or a top-level `references/` entry once `references/` becomes a
  convention here.

## AI value-add — open question for v1.x

Today the skill is a CLI workflow wrapped in markdown. Every check is a
plain script; the SKILL.md is an orchestration runbook. None of the
three things that make a *skill* (rather than a CLI) more valuable are
implemented:

1. **Translation from non-supported formats** into the supported YAML —
   hand-rolled enums in TS / Go / Rust, Redux Toolkit slices,
   `useReducer` patterns, Akka FSMs. Pattern-matching across an
   open-ended space of state-machine idioms is the most clearly
   AI-shaped piece. v1.1 candidate; not started.
2. **In-context explanation of findings.** "Overlapping guards on
   `(loggedOut, SUBMIT)`" becomes useful when the agent reads the
   source around the violation, recognises that the admin check on
   line 47 is identical to the one on line 52, and proposes the
   intended `!isAdmin` on one branch. v1 reports the finding; it does
   not explain.
3. **Follow-up actions** — autofix, test generation for the
   counterexample trace, issue creation on the project board for each
   high-severity finding. Today the skill prints; it does not act.

Until at least one of these three is real, the honest answer to "why is
this a skill rather than a CLI?" is "convenience of invocation, and not
much else." The skill's current value is roughly equal to
`smi audit [paths...]` wrapped in markdown — and the markdown costs
runtime context tokens that the CLI wouldn't. v1.1's first design
question is: pick one of the three and make it real, or split the
deliverable into a CLI plus a much thinner skill that only does the
AI-shaped edges.
