---
name: review
description: >
  Weekly memory hygiene: resolves stale.mem entries, compacts append-only files
  (entities.mem, facts.mem, etc.), merges overflow.mem, removes duplicates across all
  files, regenerates all .plan.md files via render-all, produces human-readable summary.
  Human-initiated only — never automatic. This is the ONLY skill that bulk-rewrites
  .plan.md files and resolves stale.mem entries.
tools: Bash, Read, Grep
---

# memplan/review

Weekly memory hygiene skill. Compacts append-only files, resolves stale entries,
merges overflow.mem, and regenerates all `.plan.md` files. **Human-initiated only** —
this skill breaks the monotonic-append guarantee, so it must never run automatically.

**This is the only skill that:**
- Bulk-rewrites `.plan.md` files via `render-all`
- Resolves all `stale.mem` entries at once
- Compacts append-only files to remove duplicates

Compaction writes use shell commands (`awk`, `mv`, `>`) directly for atomic bulk rewrites.
This is an architectural exception (see Design Notes). Phase 5 (overflow merge) and Phase 2
(stale resolution) route through `memplan-cli.js` to preserve cap checks and staleness propagation.
This skill does NOT modify `plan.mem`, `steps.mem`, or any mutable-key files — it only
compacts append-only logs.

---

## Phase 1: Pre-flight checks

Before starting:

1. **Check .memplan/ exists:**
   ```bash
   [ -d .memplan ] || { echo "No .memplan/ directory — run memplan/init first"; exit 1; }
   ```

2. **List unresolved stale entries:**
   ```bash
   node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" stale-list . > /tmp/stale-list.json
   cat /tmp/stale-list.json
   ```

   If the list is empty, inform the user and skip to Phase 4 (compaction). If there are
   stale entries, continue to Phase 2.

3. **Verify no uncommitted changes:**
   ```bash
   if [ -n "$(git status --porcelain .memplan)" ]; then
     echo "Uncommitted changes in .memplan/ — commit or stash first"
     exit 1
   fi
   ```

   Review is a bulk operation that touches many files. Ensure clean state before proceeding.

---

## Phase 2: Resolve stale entries

For each file in the stale list (from Phase 1):

1. **Read the file and inspect:**
   ```bash
   cat .memplan/<file>
   ```

   Determine if the staleness reason is still valid. Common cases:
   - **checkpoint.mem stale because progress updated** — if progress is now stable, resolve.
   - **plan.mem stale because checkpoint.mem updated** — if plan is still aligned with checkpoint, resolve.
   - **facts.mem stale because new facts appended** — always safe to resolve (facts are append-only).

2. **Resolve if safe:**
   ```bash
   node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" stale-resolve . "<file>"
   ```

   Only resolve if the stale reason is no longer relevant. If unsure, ask the user.

3. **Report unresolved:**
   After processing all entries, if any files remain stale, list them and ask the user
   for guidance. Do not proceed to compaction if critical files (like `plan.mem`) are
   still stale.

---

## Phase 3: Rewrite stale.mem

After resolving all entries, compact `stale.mem` to retain only unresolved entries:

1. **Parse current stale list:**
   ```bash
   node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" stale-list . > /tmp/unresolved.json
   cat /tmp/unresolved.json
   ```

2. **Rewrite stale.mem:**
   ```bash
   # Back up original
   cp .memplan/stale.mem .memplan/stale.mem.backup

   # Overwrite with only unresolved entries (preserving timestamps)
   > .memplan/stale.mem
   jq -c '.[]' /tmp/unresolved.json | while IFS= read -r line; do
     file=$(echo "$line" | jq -r '.file')
     because=$(echo "$line" | jq -r '.because')
     session=$(echo "$line" | jq -r '.session')
     timestamp=$(echo "$line" | jq -r '.timestamp')
     echo "${timestamp} +stale:file=${file},because=${because},session=${session}" >> .memplan/stale.mem
   done
   ```

   This step removes all resolved entries, keeping only the unresolved ones.

---

## Phase 4: Compact append-only files

For each append-only file (`entities.mem`, `facts.mem`, `code-map.mem`, `failures.mem`,
`questions.mem`, `decisions/log.mem`), remove duplicates and compact:

### 4.1: entities.mem

```bash
cat .memplan/memory/entities.mem
```

Remove duplicate entity entries. Each entity is a timestamped `+entity:name=X,type=Y,desc=Z`
line. Dedup by `(name, type)` pair — keep the **last** occurrence (most recent):

```bash
# Parse, dedup by (name, type), keep last occurrence, rewrite
awk -F'[: =,]+' '
  /^\~.*\+entity:/ {
    split($0, parts, " ");
    ts = parts[1];
    rest = substr($0, index($0, "+entity:"));

    # Extract name and type
    for (i = 3; i <= NF; i += 2) {
      if ($i == "name") name = $(i+1);
      if ($i == "type") type = $(i+1);
    }

    key = name ":" type;
    entries[key] = ts " " rest;
  }
  END {
    for (key in entries) print entries[key];
  }
' .memplan/memory/entities.mem > /tmp/entities-dedup.mem

# Replace if different
if ! cmp -s .memplan/memory/entities.mem /tmp/entities-dedup.mem; then
  mv .memplan/memory/entities.mem .memplan/memory/entities.mem.backup
  mv /tmp/entities-dedup.mem .memplan/memory/entities.mem
  echo "entities.mem: compacted"
else
  echo "entities.mem: no duplicates"
fi
```

### 4.2: facts.mem

```bash
cat .memplan/memory/facts.mem
```

Dedup by `(tag, text)` pair — keep the **last** occurrence:

```bash
awk -F'[: =,]+' '
  /^\~.*\+fact:/ {
    split($0, parts, " ");
    ts = parts[1];
    rest = substr($0, index($0, "+fact:"));

    # Extract tag and text
    for (i = 3; i <= NF; i += 2) {
      if ($i == "tag") tag = $(i+1);
      if ($i == "text") text = $(i+1);
    }

    key = tag ":" text;
    entries[key] = ts " " rest;
  }
  END {
    for (key in entries) print entries[key];
  }
' .memplan/memory/facts.mem > /tmp/facts-dedup.mem

if ! cmp -s .memplan/memory/facts.mem /tmp/facts-dedup.mem; then
  mv .memplan/memory/facts.mem .memplan/memory/facts.mem.backup
  mv /tmp/facts-dedup.mem .memplan/memory/facts.mem
  echo "facts.mem: compacted"
else
  echo "facts.mem: no duplicates"
fi
```

### 4.3: code-map.mem

```bash
cat .memplan/memory/code-map.mem
```

Dedup by `(path, purpose)` pair — keep the **last** occurrence:

```bash
awk -F'[: =,]+' '
  /^\~.*\+file:/ {
    split($0, parts, " ");
    ts = parts[1];
    rest = substr($0, index($0, "+file:"));

    # Extract path and purpose
    for (i = 3; i <= NF; i += 2) {
      if ($i == "path") path = $(i+1);
      if ($i == "purpose") purpose = $(i+1);
    }

    key = path ":" purpose;
    entries[key] = ts " " rest;
  }
  END {
    for (key in entries) print entries[key];
  }
' .memplan/memory/code-map.mem > /tmp/code-map-dedup.mem

if ! cmp -s .memplan/memory/code-map.mem /tmp/code-map-dedup.mem; then
  mv .memplan/memory/code-map.mem .memplan/memory/code-map.mem.backup
  mv /tmp/code-map-dedup.mem .memplan/memory/code-map.mem
  echo "code-map.mem: compacted"
else
  echo "code-map.mem: no duplicates"
fi
```

### 4.4: failures.mem

```bash
cat .memplan/memory/failures.mem
```

Dedup by `(cmd, reason)` pair — keep the **last** occurrence (most recent failure):

```bash
awk -F'[: =,]+' '
  /^\~.*\+failure:/ {
    split($0, parts, " ");
    ts = parts[1];
    rest = substr($0, index($0, "+failure:"));

    # Extract cmd and reason
    for (i = 3; i <= NF; i += 2) {
      if ($i == "cmd") cmd = $(i+1);
      if ($i == "reason") reason = $(i+1);
    }

    key = cmd ":" reason;
    entries[key] = ts " " rest;
  }
  END {
    for (key in entries) print entries[key];
  }
' .memplan/memory/failures.mem > /tmp/failures-dedup.mem

if ! cmp -s .memplan/memory/failures.mem /tmp/failures-dedup.mem; then
  mv .memplan/memory/failures.mem .memplan/memory/failures.mem.backup
  mv /tmp/failures-dedup.mem .memplan/memory/failures.mem
  echo "failures.mem: compacted"
else
  echo "failures.mem: no duplicates"
fi
```

### 4.5: questions.mem

```bash
cat .memplan/memory/questions.mem
```

Dedup by `text` field — keep the **first** occurrence (earliest question):

```bash
awk -F'[: =,]+' '
  /^\~.*\+question:/ {
    split($0, parts, " ");
    ts = parts[1];
    rest = substr($0, index($0, "+question:"));

    # Extract text
    for (i = 3; i <= NF; i += 2) {
      if ($i == "text") text = $(i+1);
    }

    if (!(text in seen)) {
      seen[text] = 1;
      entries[NR] = ts " " rest;
    }
  }
  END {
    for (i = 1; i <= NR; i++) {
      if (i in entries) print entries[i];
    }
  }
' .memplan/memory/questions.mem > /tmp/questions-dedup.mem

if ! cmp -s .memplan/memory/questions.mem /tmp/questions-dedup.mem; then
  mv .memplan/memory/questions.mem .memplan/memory/questions.mem.backup
  mv /tmp/questions-dedup.mem .memplan/memory/questions.mem
  echo "questions.mem: compacted"
else
  echo "questions.mem: no duplicates"
fi
```

### 4.6: decisions/log.mem

```bash
cat .memplan/decisions/log.mem
```

Dedup by `(choice, because)` pair — keep the **last** occurrence:

```bash
awk -F'[: =,]+' '
  /^\~.*\+decision:/ {
    split($0, parts, " ");
    ts = parts[1];
    rest = substr($0, index($0, "+decision:"));

    # Extract choice and because
    for (i = 3; i <= NF; i += 2) {
      if ($i == "choice") choice = $(i+1);
      if ($i == "because") because = $(i+1);
    }

    key = choice ":" because;
    entries[key] = ts " " rest;
  }
  END {
    for (key in entries) print entries[key];
  }
' .memplan/decisions/log.mem > /tmp/log-dedup.mem

if ! cmp -s .memplan/decisions/log.mem /tmp/log-dedup.mem; then
  mv .memplan/decisions/log.mem .memplan/decisions/log.mem.backup
  mv /tmp/log-dedup.mem .memplan/decisions/log.mem
  echo "decisions/log.mem: compacted"
else
  echo "decisions/log.mem: no duplicates"
fi
```

---

## Phase 5: Merge overflow.mem

If `overflow.mem` exists, merge its entries back into the appropriate files via `memplan-cli.js append`:

```bash
if [ -f .memplan/memory/overflow.mem ]; then
  cat .memplan/memory/overflow.mem

  # Parse each line and route via CLI append
  while IFS= read -r line; do
    # Extract timestamp, key, and value from line (format: ~timestamp +key:value)
    timestamp=$(echo "$line" | awk '{print $1}')
    key=$(echo "$line" | sed -E 's/^~[^ ]+ \+([^:]+):.*/\1/')
    value=$(echo "$line" | sed -E 's/^~[^ ]+ \+[^:]+://')

    case "$key" in
      entity)
        target="memory/entities.mem"
        ;;
      fact)
        target="memory/facts.mem"
        ;;
      file)
        target="memory/code-map.mem"
        ;;
      failure)
        target="memory/failures.mem"
        ;;
      question)
        target="memory/questions.mem"
        ;;
      decision)
        target="decisions/log.mem"
        ;;
      *)
        echo "Unknown overflow key: $key — keeping in overflow.mem" >&2
        echo "$line" >> /tmp/overflow-remainder.mem
        continue
        ;;
    esac

    # Append via CLI (respects cap checks and staleness propagation)
    node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . "$target" "$key" "$value"
  done < .memplan/memory/overflow.mem

  # Replace overflow.mem with unprocessed entries (if any)
  if [ -f /tmp/overflow-remainder.mem ]; then
    mv /tmp/overflow-remainder.mem .memplan/memory/overflow.mem
    echo "overflow.mem: merged, $(wc -l < .memplan/memory/overflow.mem) unprocessed entries remain"
  else
    rm .memplan/memory/overflow.mem
    echo "overflow.mem: merged, all entries processed"
  fi

  # Re-run deduplication on target files (they now contain merged entries)
  # Repeat Phase 4 compaction for affected files
else
  echo "overflow.mem: not present, skipping merge"
fi
```

After merging, repeat the Phase 4 compaction steps for all affected files to dedup
the newly merged entries.

---

## Phase 6: Compact question+answer pairs

Scan `questions.mem` and `checkpoint.mem` for question+answer pairs that can be
converted to decisions:

```bash
cat .memplan/memory/questions.mem
cat .memplan/checkpoint.mem
```

Look for patterns like:
- Question: "Should we use X or Y?"
- Checkpoint `open-questions`: "none" (implies answered)

If questions have been answered (evident from session history or checkpoint state),
convert them to decisions:

```bash
# For each answered question, append to decisions/log.mem
# Format: ~timestamp +decision:choice=<answer>,because=<reason>
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . "decisions/log.mem" "decision" "choice=<answer>,because=<reason>"

# Remove the question from questions.mem (done via Phase 4 deduplication)
```

This phase is **manual** — the agent inspects questions and checkpoint, then decides
which questions have been resolved. No automatic conversion.

---

## Phase 7: Regenerate all .plan.md files

Call `render-all` to regenerate all `.plan.md` counterparts:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" render-all .
```

This is the **only skill** that calls `render-all` — all other skills defer rendering
to `memplan/review`.

Verify that all `.plan.md` files are unlocked, written, and re-locked:

```bash
find .memplan -name '*.plan.md' -ls
```

---

## Phase 8: Produce summary

Generate a human-readable summary of the review:

```bash
echo "memplan/review: completed"
echo ""
echo "Resolved stale entries: $(grep -c '+stale-resolved:' .memplan/stale.mem.backup || echo 0)"
echo "Unresolved stale entries: $(node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" stale-list . | jq 'length')"
echo ""
echo "Compaction results:"
echo "  entities.mem: $([ -f .memplan/memory/entities.mem ] && wc -l < .memplan/memory/entities.mem || echo 0) entries"
echo "  facts.mem: $([ -f .memplan/memory/facts.mem ] && wc -l < .memplan/memory/facts.mem || echo 0) entries"
echo "  code-map.mem: $([ -f .memplan/memory/code-map.mem ] && wc -l < .memplan/memory/code-map.mem || echo 0) entries"
echo "  failures.mem: $([ -f .memplan/memory/failures.mem ] && wc -l < .memplan/memory/failures.mem || echo 0) entries"
echo "  questions.mem: $([ -f .memplan/memory/questions.mem ] && wc -l < .memplan/memory/questions.mem || echo 0) entries"
echo "  decisions/log.mem: $([ -f .memplan/decisions/log.mem ] && wc -l < .memplan/decisions/log.mem || echo 0) entries"
echo ""
echo "Overflow.mem: $([ -f .memplan/memory/overflow.mem ] && wc -l < .memplan/memory/overflow.mem || echo 0) entries"
echo ""
echo "All .plan.md files regenerated via render-all."
echo ""
echo "Backups saved with .backup extension. Review changes, then commit or revert."
```

Print the summary. Do not automatically commit — the user should review the changes
first.

---

## Design Notes

### Architectural exception: shell-based compaction

`memplan/review` is the **only** skill that uses shell commands (`awk`, `mv`, `>`) to rewrite `.mem` files directly instead of routing all writes through `memplan-cli.js`. This breaks the central design invariant documented in `references/memscript-v1.md` and `record/SKILL.md`.

**Why the exception exists:**

Compaction requires reading, deduplicating, and rewriting entire files atomically. The CLI's `append` and `set` commands are designed for incremental writes, not bulk rewrites. Implementing `compact <file>` subcommands in `memplan-cli.js` would duplicate the deduplication logic shown here (awk scripts that parse field-delimited entries) without adding safety — the core risk (concurrent writes during compaction) cannot be solved by routing through the CLI, only by the human-initiated-only constraint.

**Mitigation:**

- Phase 5 (overflow merge) **does** route through `memplan-cli.js append` to preserve cap checks and staleness propagation.
- The human-initiated-only constraint prevents concurrent writes (no hooks trigger during review).
- Backups (`.backup` files) allow rollback if compaction fails.

Future work: if compaction patterns stabilize, add `memplan-cli.js compact <file> <key-fields>` to centralize the logic. For now, the shell-based approach is the simplest correct implementation.

### Why human-initiated only?

`memplan/review` breaks the monotonic-append guarantee that makes concurrent hook writes
safe. If a hook triggers `memplan/act` (which appends to `entities.mem`) while `review`
is rewriting `entities.mem`, one operation will lose its writes. By restricting `review`
to human-initiated runs, we avoid this race condition.

### Why keep `.backup` files?

Compaction is destructive. If the agent makes a mistake (e.g., deduplicates incorrectly),
the user can restore from `.backup` files. After verifying the review, the user can
delete the backups.

### Why not auto-convert questions to decisions?

Questions may be nuanced or require context that isn't captured in the `.mem` file format.
The agent inspects each question manually (Phase 6) and decides whether to convert.
Automatic conversion risks losing information or mis-categorizing open questions as resolved.

---

## Token cost estimate

Reading all files: ~300 tokens. Compaction logic: ~100 tokens. Rendering: ~50 tokens.
Total: ~450 tokens per invocation. This is acceptable for a weekly operation.
