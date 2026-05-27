---
name: gaps
description: >
  Read-only analysis skill: scans .memplan/ plan files for undefined references,
  contradictions, missing behaviours, phase ordering violations, uncovered error paths,
  format inconsistencies, circular deps, and missing documentation steps. Outputs a
  numbered gap list — no files written. Trigger phrases: "memplan gaps", "find gaps",
  "audit the plan", "check the plan for issues", "what's missing from the plan".
tools: Bash, Read, Grep
---

# memplan/gaps

Read-only plan analysis. Checks all `.memplan/` plan files against 8 gap categories and
outputs a numbered list of actionable findings. **No files are written.**

---

## Phase 1: Collect plan content

Read all plan files:

```bash
cat .memplan/steps.mem 2>/dev/null
cat .memplan/plan.mem 2>/dev/null
cat .memplan/slice.mem 2>/dev/null
cat .memplan/checkpoint.mem 2>/dev/null
cat .memplan/deps.mem 2>/dev/null
cat .memplan/deps-closure.mem 2>/dev/null
cat .memplan/stale.mem 2>/dev/null
cat .memplan/risk.mem 2>/dev/null
cat .memplan/memory/persona.mem 2>/dev/null
cat .memplan/memory/aliases.mem 2>/dev/null
cat .memplan/memory/entities.mem 2>/dev/null
cat .memplan/memory/facts.mem 2>/dev/null
cat .memplan/memory/failures.mem 2>/dev/null
cat .memplan/memory/questions.mem 2>/dev/null
cat .memplan/decisions/log.mem 2>/dev/null
```

Also list session files:

```bash
ls .memplan/sessions/ 2>/dev/null
```

---

## Phase 2: Run all 8 gap checks

For each check, collect findings. A finding is only a gap if it is **actionable** — a
clear inconsistency, omission, or error. Do not flag style preferences or speculative issues.

**Check 1 — Undefined references**

For every file, skill name, key name, or step ID referenced in any `.mem` file, verify
it exists elsewhere in the plan. Flag: `file: <source>, gap: references '<name>' which is not defined anywhere, fix: add definition or correct the reference.`

**Check 2 — Contradictions**

Look for any rule stated in one file that conflicts with a rule in another. Examples:
a key marked append-only in one place but cleared in another; a step marked complete
while `progress` shows it not done. Flag: `file: <source1> + <source2>, gap: '<rule A>' contradicts '<rule B>', fix: reconcile.`

**Check 3 — Missing behaviours**

Find skills or steps that reference a condition with no defined outcome (e.g. "if X, handle
appropriately" with no handler defined). Flag: `file: <source>, gap: condition '<X>' has no defined outcome, fix: define the outcome or remove the condition.`

**Check 4 — Phase ordering violations**

Check `steps.mem` for any step that depends on a skill, file, or concept not available
until a later phase. Flag: `file: steps.mem, gap: step <N> uses '<X>' which is not available until phase <M>, fix: move step after phase <M> or introduce it earlier.`

**Check 5 — Uncovered error paths**

For each operation or state in the plan, check whether an error outcome is defined.
Flag: `file: <source>, gap: '<operation>' has no defined error handling, fix: add error path or note it is intentionally silent.`

**Check 6 — Format inconsistencies**

Check examples against grammar rules in `memscript-v1.md` (list separator `|`, map
separator `,`, integer prefix `#`, timestamp prefix `~`). Flag any example using
undeclared syntax: `file: <source>, gap: example uses '<syntax>' not defined in MemScript v1, fix: correct the example.`

**Check 7 — Circular dependencies**

Read `deps.mem`. Build the dependency graph. If any cycle exists (A depends on B, B
depends on A, directly or transitively): flag it. Flag: `file: deps.mem, gap: circular dependency <A> → <B> → … → <A>, fix: break the cycle by removing one dep.`

**Check 8 — Missing documentation step**

If `steps.mem` exists and any step text contains `api`, `export`, `command`, `skill`,
`agent`, or `endpoint`, OR if any step touches `README*`, `CHANGELOG*`, `SKILL.md`, or
`*.plan.md` — check whether any step text contains `doc`, `readme`, `changelog`, or `spec`.
If not: flag it. Flag: `file: steps.mem, gap: plan modifies public-facing files but has no documentation step, fix: add a doc step with deps pointing to the last step that settles the public shape.`

---

## Phase 3: Output

Print all findings as a numbered list. Each finding on one line:

```
<N>. [<check-name>] file: <file>, gap: <description>, fix: <suggestion>
```

If no gaps found for a check, omit that check from the output entirely.

If no gaps found at all: print `No gaps found.`

Do not add prose, section headers, or summaries. One gap per line.
