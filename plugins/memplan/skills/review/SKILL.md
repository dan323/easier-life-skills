---
name: review
description: >
  Weekly memory hygiene: resolve stale entries, compact append-only .mem files,
  merge overflow, regenerate all .plan.md files. Human-initiated only — never
  automatic. Trigger: "memplan review".
tools: Bash, Read, Grep
---

# memplan/review

Weekly memory hygiene skill. Compacts append-only files, resolves stale entries,
merges overflow.mem, and regenerates all `.plan.md` files. **Human-initiated only** —
compaction breaks the monotonic-append guarantee, so it must never run automatically.

All bulk rewrites go through `memplan-cli.js` (`compact`, `stale-compact`), which
writes `.backup` files before every rewrite. This skill does NOT modify `plan.mem`
or any mutable-key files — it only compacts append-only logs.

---

## Phase 1: Pre-flight checks

1. **Check .memplan/ exists:**

   ```bash
   [ -d .memplan ] || { echo "No .memplan/ directory — run memplan/bootstrap first"; exit 1; }
   ```

2. **Verify no uncommitted changes** (review touches many files — start clean):

   ```bash
   if [ -n "$(git status --porcelain .memplan)" ]; then
     echo "Uncommitted changes in .memplan/ — commit or stash first"
     exit 1
   fi
   ```

3. **List unresolved stale entries:**

   ```bash
   node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" stale-list .
   ```

   If empty, skip Phase 2.

---

## Phase 2: Resolve stale entries

For each file in the stale list, read it and decide whether the staleness reason is
still valid. Common cases:

- **checkpoint.mem stale because progress updated** — if progress is now stable, resolve.
- **plan.mem stale because checkpoint.mem updated** — if plan still aligns with checkpoint, resolve.
- **facts.mem stale because new facts appended** — always safe to resolve (append-only).

Resolve each entry that is no longer relevant (ask the user if unsure):

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" stale-resolve . "<file>"
```

Then compact `stale.mem` down to only the still-unresolved entries:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" stale-compact .
```

If critical files (like `plan.mem`) remain stale, list them, ask the user for
guidance, and do not proceed to compaction.

---

## Phase 3: Compact append-only files

One call deduplicates all append-only files (entities, facts, code-map, failures,
questions, decisions log), writing a `.backup` per changed file and re-rendering
paired `.plan.md` counterparts:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" compact .
```

Dedup identities: entities `(name, type)` keep-last; facts `(tag, text)` keep-last;
code-map `(path, purpose)` keep-last; failures `(cmd, reason)` keep-last; questions
`text` keep-first; decisions `(choice, because)` keep-last. Lines that are not
dedupable entries (e.g. `+cap-warning:`) are preserved.

---

## Phase 4: Merge overflow.mem

If `.memplan/memory/overflow.mem` exists, route each entry back to its target file
via `append` (which preserves cap checks and staleness propagation):

```bash
cat .memplan/memory/overflow.mem
```

Targets by key: `entity` → `memory/entities.mem`, `fact` → `memory/facts.mem`,
`file` → `memory/code-map.mem`, `failure` → `memory/failures.mem`,
`question` → `memory/questions.mem`, `decision` → `decisions/log.mem`.

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . "<target>" "<key>" "<value>"
```

Entries with an unknown key stay in overflow.mem; delete the file only when every
entry was routed. After merging, re-run `compact .` to dedup the merged entries.

---

## Phase 5: Convert answered questions to decisions

Read `questions.mem` and `checkpoint.mem`. For questions that have evidently been
answered (e.g. checkpoint `open-questions` is `none`), record the answer as a
decision. This phase is **manual** — the agent inspects and decides; no automatic
conversion.

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . decisions/log.mem decision "choice=<answer>,because=<reason>"
```

---

## Phase 6: Regenerate all .plan.md files

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" render-all .
```

This is the only skill that calls `render-all`.

---

## Phase 7: Summary

Report: stale entries resolved/remaining, per-file compaction results (printed by
`compact`), overflow entries merged/remaining. Remind the user that `.backup` files
allow rollback and should be deleted after the review is verified. Do not commit
automatically.
