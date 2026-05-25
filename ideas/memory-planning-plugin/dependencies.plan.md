# memplan — Dependency Graph & Staleness Tracking

## Concept

Some `.mem` files are derived from others. When a source file changes, its dependents
may be out of date. Rather than recomputing eagerly (expensive), memplan tracks a
staleness flag per file and reviews dependents lazily — before they are next read or
acted upon.

This applies at two levels:
- **Runtime**: `.memplan/` files within a project (managed by the plugin)
- **Plan-time**: the `ideas/memory-planning-plugin/` plan files in this repo (managed by the human; the same graph concept applies)

---

## Runtime dependency graph (`.memplan/` files)

Defined in `.memplan/deps.mem` (MemScript v1, `dep:` keys are lists).

```
dep:steps.mem=plan.mem|overview.mem
dep:slice.mem=steps.mem|progress
dep:checkpoint.mem=progress|plan.mem
dep:risk.mem=failures.mem|plan.mem
dep:budget.mem=hot.mem
```

Reading: `steps.mem` depends on `plan.mem` and `overview.mem` — if either changes,
`steps.mem` should be reviewed for consistency.

`deps.mem` is maintained by the human (or a tool) and read by the agent. It is the
only file in `.memplan/` that has no `.plan.md` counterpart — it is structural metadata,
not memory content.

---

## Staleness tracking: `stale.mem`

When the agent writes a file, it looks up `deps.mem` for everything that lists that
file as a dependency and appends a staleness entry for each:

```
~2026-05-25T14:30Z +stale:file=steps.mem,because=plan.mem,session=~2026-05-25
```

`stale.mem` is append-only. Entries are cleared (by removing matching lines) when
the stale file has been reviewed and confirmed up to date or updated.

---

## Staleness checks

**`memplan/start`**
After orient, reads `stale.mem`. For each entry, prints a warning line in the summary:
> "⚠ steps.mem may be stale (plan.mem changed on 2026-05-25) — review before acting."

**`memplan/act`**
Before executing a step, checks `stale.mem` for any file the step will read.
If a dependency in the step's scope is stale: halts and prompts the human to resolve
staleness first (via inbox or manual review), then re-run.

**`memplan/review`**
Processes all stale entries, reviews each file against its sources, updates if needed,
clears resolved entries from `stale.mem`.

---

## Plan-file dependency graph (this ideas folder)

For human reference — not enforced by tooling, but the same logic applies.
When a file in this column changes, review the files in "dependents":

| Modified file | Dependents to review |
|---------------|----------------------|
| `overview.plan.md` | `steps.plan.md` (phases → steps) |
| `file-layout.plan.md` | `steps.plan.md` (files to create → steps), `token-budget.plan.md` (file list) |
| `skills.plan.md` | `steps.plan.md` (skills to implement → steps) |
| `mem-language.plan.md` | `skills.plan.md` (read/write instructions), `file-layout.plan.md` (format notes), `steps.plan.md` |
| `feedback-language.plan.md` | `skills.plan.md` (inbox processing), `inbox-protocol.plan.md`, `steps.plan.md` |
| `inbox-protocol.plan.md` | `skills.plan.md` (memplan/inbox), `steps.plan.md` |
| `conventions.plan.md` | `skills.plan.md` (lock/unlock), `file-layout.plan.md`, `steps.plan.md` |
| `token-budget.plan.md` | `steps.plan.md` (budget skill steps) |
| `dependencies.plan.md` | `skills.plan.md` (staleness checks), `file-layout.plan.md` (deps.mem + stale.mem), `steps.plan.md` |

`steps.plan.md` depends on every other file — it should be reviewed last, after all
other files are stable.

---

## Updated file layout additions

Two new files in `.memplan/`:

```
.memplan/
  deps.mem      ← dependency graph (human-maintained; no .plan.md counterpart)
  stale.mem     ← append-only staleness log; cleared by memplan/review
```

---

## Steps to implement (additions to steps.plan.md)

- Define `deps.mem` format and initial content as part of plugin initialisation
- Add staleness append logic to `memplan/act` after every file write
- Add staleness warning to `memplan/start` orient summary
- Add staleness pre-flight to `memplan/act` before executing any step
- Add staleness resolution to `memplan/review`
