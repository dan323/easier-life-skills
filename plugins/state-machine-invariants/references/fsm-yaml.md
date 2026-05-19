# `.fsm.yaml` schema

Reference for the user-authored YAML format consumed by the
`state-machine-invariants` skill. The format describes a **flat** finite
state machine `M = (Q, Σ, δ, q₀, F)` where:

- `Q` = the state set (derived from or declared as `states`)
- `Σ` = the event alphabet (derived from or declared as `events`)
- `δ ⊆ Q × Σ × Q` = the transition relation, decorated with optional guards
- `q₀ ∈ Q` = the `initial` state
- `F ⊆ Q` = the `final` state set

Hierarchical (compound / parallel) machines are **not** supported in this
YAML format in v1.0. Author hierarchical machines in XState v5 syntax
instead — the skill flattens them automatically in Phase 4. See
[`plan.md`](../skills/state-machine-invariants/plan.md) §D3.

## Top-level keys

| Key           | Required | Type             | Default                                  |
|---------------|----------|------------------|------------------------------------------|
| `id`          | yes      | string           | —                                        |
| `initial`     | yes      | string           | —                                        |
| `states`      | no       | list[string]     | derived from `from` ∪ `to` ∪ `{initial}` |
| `final`       | no       | list[string]     | `[]`                                     |
| `events`      | no       | list[string]     | derived from `transitions`               |
| `transitions` | yes      | list[Transition] | —                                        |

The validator rejects any spec missing `id`, `initial`, or `transitions`,
or whose `transitions` is empty.

## Derived defaults — when to declare explicitly

- **`states`** — if omitted, the analyser uses the closure `{initial} ∪ {t.from
  | t ∈ transitions} ∪ {t.to | t ∈ transitions}`. Pass `states` explicitly
  only when you want to declare a state that has no incoming or outgoing
  transitions (the **reachability** check fires on these; the **deadlock**
  check fires on declared non-final states with no live outgoing arrows).
- **`events`** — if omitted, the analyser uses `{t.event | t ∈ transitions}`.
  Pass `events` explicitly only when you want to assert that a declared
  event is **not** used (the **unused-event** check fires on events in this
  list that no transition consumes).

If both lists are derived, the corresponding checks (`reachability`,
`deadlock` on declared-but-unused states, `unused-event`) trivially pass —
because the data they would flag doesn't exist in the input. Declare
explicitly to opt into them.

## Transition shape

| Key     | Required | Type                          |
|---------|----------|-------------------------------|
| `from`  | yes      | string (must be in `Q`)       |
| `event` | yes      | string                        |
| `to`    | yes      | string (must be in `Q`)       |
| `guard` | no       | scalar (see below)            |

### Guard scalars

| YAML value                       | Normalized IR `guard`                | Behaviour                                                                  |
|----------------------------------|--------------------------------------|----------------------------------------------------------------------------|
| omitted, `null`, `true`          | `{type: "always"}`                   | always fires                                                               |
| `false`                          | `{type: "literalFalse"}`             | flagged as a **dead transition** (check 5c)                                |
| any other string                 | `{type: "expr", expr: "<the text>"}` | opaque — compared by **character-for-character** equality for overlap (5d) |

Guards expressed as strings are **not parsed or evaluated** in v1. Two
transitions on the same `(from, event)` whose guard strings are exactly
equal are flagged as overlapping; `a > b` and `b < a` are treated as
distinct, intentionally. See [`plan.md`](../skills/state-machine-invariants/plan.md)
§D4 for why semantic equivalence is out of scope for v1.

## Validation rules

The validator (`scripts/normalize_yaml.py`, currently a `{{TODO}}` in
`SKILL.md`) rejects any spec that fails any of the following. Each rule
maps directly to a JSON-Schema constraint in
[`fsm-yaml.schema.json`](./fsm-yaml.schema.json):

1. Missing `id`, `initial`, or `transitions`, or `transitions` is empty.
2. `initial ∉ Q` (after the derived-or-declared state set is resolved).
3. When `states` is **declared explicitly**, any transition's `from` or `to`
   that is not in the declared set. (When `states` is derived, this rule is
   trivially satisfied.)
4. Any element of `final` not in `Q`.
5. Any transition where `from`, `event`, or `to` is not a string.
6. Any `guard` that is not a scalar (lists / maps not allowed in v1).
7. Any unknown top-level key (the schema is `additionalProperties: false`).

## Minimal example

    id: light
    initial: red
    transitions:
      - {from: red,    event: TIMER, to: green}
      - {from: green,  event: TIMER, to: yellow}
      - {from: yellow, event: TIMER, to: red}

A traffic-light machine. The analyser derives `Q = {red, green, yellow}`,
`Σ = {TIMER}`, and reports no findings.

## Realistic example

See [`examples/order.fsm.yaml`](../examples/order.fsm.yaml) for an order-
processing machine. To produce a finding, edit it to add `refund` to
`events` without adding any transition that consumes it — the analyser
will then emit one **unused-event** warning.

## Out of scope for v1

- Compound and parallel states. Author in XState v5 syntax instead.
- Inline action descriptions (`actions:` / `entry:` / `exit:`). The
  analyser ignores actions — only structural invariants are checked.
- Structured guard trees richer than strings (e.g. `{op: "&&", args: [...]}`).
  Candidate for v1.1 alongside symbolic guard analysis.
