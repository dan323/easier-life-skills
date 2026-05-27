# memplan — Scripting Layer (`memplan-cli.js`)

## Motivation

Every `.mem` file write involves the same mechanical steps:
1. Unlock the paired `.plan.md`
2. Parse the MemScript file
3. Apply the operation (replace mutable key / append line)
4. Re-lock `.plan.md`
5. Render `.mem` → `.plan.md` (deterministic, canonical)

When the AI agent does these steps manually, it costs ~150–300 tokens per write and can
produce inconsistent output (wrong canonical order, missed lock, wrong timestamp format).
A script does the same work in 0 tokens and 10 ms, deterministically, every time.

**Rule**: The AI agent performs _reasoning_ (what to write). A script performs _mechanics_
(how to write it). Skills delegate every file operation to `memplan-cli.js`.

---

## Location

```
plugins/memplan/bin/memplan-cli.js
```

Plain-JavaScript (CommonJS or ESM), no compilation step. Node.js is already required by
the project; no additional dependency needed. The file is installed as part of the plugin.

Skills reference the script via the env var `CLAUDE_PLUGIN_ROOT` (set by the Claude Code
harness when a skill runs). Typical invocation from a skill:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" <command> [options]
```

---

## Command Reference

All commands take `<dir>` as their first positional argument — the absolute or relative
path to the project root (`.memplan/` is resolved as `<dir>/.memplan/`). Passing `.` works
from the project root.

### Init

```
memplan-cli.js init <dir>
```

Bootstrap `.memplan/` from scratch. Idempotent — prints "Already initialised" and exits 0
if `.memplan/` already exists.

Creates:
- All subdirectories: `memory/`, `decisions/`, `inbox/`, `sessions/`
- `progress` → `0/0 | not started`
- `branch-intent` → `(not set)`
- `deps.mem` from the embedded initial template (see `dependencies.plan.md`)
- Empty stubs for all Phase 1 `.mem` files
- Generates and locks all `.plan.md` counterparts
- Computes `deps-closure.mem` from the initial `deps.mem`

---

### Mutable key operations

```
memplan-cli.js set <dir> <file> <key> <value>
```

Sets a mutable key in `<dir>/.memplan/<file>`. Removes all existing lines matching `^<key>:`,
appends `<key>:<value>`, unlocks+writes+re-locks the `.plan.md` counterpart.

`<value>` is written verbatim — the caller constructs the full MemScript value string
(scalar, list with `|`, map with `=` and `,`).

```
memplan-cli.js clear <dir> <file> <key>
```

Clears a mutable key (writes `<key>:` — explicit null). Equivalent to `set ... ""`.

---

### Append-only operations

```
memplan-cli.js append <dir> <file> <key> <value>
```

Appends `~<ISO8601> +<key>:<value>` to `<dir>/.memplan/<file>`. Never reads the file first
(preserves concurrent-write safety). The timestamp is the current UTC time. Does not touch
the paired `.plan.md` (append-only files are not rendered to `.plan.md` during the append;
render is deferred to `memplan/record` or `memplan/review`).

Exception: `plan.mem`, `steps.mem`, `slice.mem`, `checkpoint.mem` — these have paired
`.plan.md` that must stay in sync. For these files, `append` also calls `render` automatically.

---

### Rendering

```
memplan-cli.js render <dir> <file>
```

Reads `<dir>/.memplan/<file>.mem`, applies the canonical render algorithm (see
`conventions.plan.md`), unlocks + writes + re-locks `<file>.plan.md`.

Canonical render algorithm (deterministic):
1. Write generated-file header
2. Mutable keys — fixed per-file section order (declared in the CLI as a per-file schema)
3. Append-only entries — sorted by timestamp ascending; ties broken by line order
4. Step entries — sorted numerically by id (1, 2, 3, 3.1, 3.2, 3.3, 4 …)
5. Omit mutable keys with empty value

```
memplan-cli.js render-all <dir>
```

Re-renders every `.mem` file that has a `.plan.md` counterpart. Used by `memplan/review`.

---

### File locking

```
memplan-cli.js lock <dir> <file>
memplan-cli.js unlock <dir> <file>
```

`lock`: sets read-only on `<dir>/.memplan/<file>` (chmod 444 on Unix, `attrib +R` on Windows).
`unlock`: removes read-only (`chmod u+w` / `attrib -R`).

These are rarely called directly by skills; most write operations call lock/unlock internally.

---

### FeedScript processing

```
memplan-cli.js apply <dir> <feedback-file>
```

Parses `<feedback-file>` (a FeedScript v1 `.feedback` file), applies all operations to the
relevant `.mem` files, regenerates affected `.plan.md` files, deletes `<feedback-file>`, and
appends a summary to `decisions/log.mem`. Error lines are appended to `questions.mem`; errors
never abort processing (matches the FeedScript error-handling spec in `feedback-language.plan.md`).

Operations handled entirely in script (no agent involvement):
- `SET`, `FACT`, `APPROVE`, `CLEAR-STALE`, `ANSWER`, `COMMENT`
- `REWRITE step=N text="TEXT"` — find step line with `id=N`, replace `text=` field
- `DELETE step=N` — remove step line with `id=N`, renumber subsequent steps
- `INSERT after=N|before=N text="TEXT"` — find insertion point, shift step ids, insert
- `REPLACE-PLAN text="..."` — parse pipe-separated numbered list, rewrite `plan.mem` steps

```
memplan-cli.js inbox <dir>
```

Processes all `.feedback` files in `<dir>/.memplan/inbox/`, oldest-first (by mtime).
Equivalent to calling `apply` for each file in order.

---

### Dependency closure

```
memplan-cli.js deps-closure <dir>
```

Reads `deps.mem`, computes the full transitive closure, writes `deps-closure.mem`.
Used by `memplan/init` and `memplan/review`.

```
memplan-cli.js deps-closure-append <dir> <new-file> <direct-deps>
```

Incremental update: adds one new entry to `deps-closure.mem` for `<new-file>` with
`<direct-deps>` (pipe-separated). Does not recompute the full closure.
Used by `memplan/act` when the user requests a new `.mem` file be created.

---

### Staleness tracking

```
memplan-cli.js stale-mark <dir> <file> <because>
```

Appends `~<ISO8601> +stale:file=<file>,because=<because>,session=~<DATE>` to `stale.mem`.

```
memplan-cli.js stale-resolve <dir> <file>
```

Appends `~<ISO8601> +stale-resolved:file=<file>,session=~<DATE>` to `stale.mem`.

```
memplan-cli.js stale-list <dir>
```

Reads `stale.mem`, outputs unresolved entries (those without a matching `+stale-resolved`
line) as JSON to stdout. Used by skills to check stale status without parsing MemScript.

---

### Overflow handling

```
memplan-cli.js overflow-check <dir> <file> <cap>
```

Counts lines in `<dir>/.memplan/<file>`. If count ≥ `<cap>`: exits 1 (file at capacity).
If count < `<cap>`: exits 0. Used by `append` internally to gate writes.

When `append` detects overflow, it automatically redirects the entry to `memory/overflow.mem`
and appends a cap-warning to `questions.mem` (deduped per session file).

---

### HTML export

```
memplan-cli.js html <dir> [--out <output-dir>]
```

Converts every `.plan.md` file under `<dir>/.memplan/` into a self-contained
`.plan.html` file and writes an `index.html` dashboard.

Output location:
- Default (`--out` omitted): `.plan.html` files are written as siblings of their
  `.plan.md` sources (e.g. `plan.plan.md` → `plan.plan.html`). `.plan.html` files
  are **not** read-only — they are disposable build output, regenerated on each run.
- `--out <dir>`: all HTML files are written under `<dir>/` instead (useful for CI
  publish or a docs folder). Directory is created if it does not exist.

The command:
1. Discovers all `*.plan.md` files recursively under `.memplan/` (including
   `sessions/`, `decisions/`, `memory/`).
2. Parses the Markdown into sections using the canonical render schema (same
   schema used by `render`). It does not use a general-purpose Markdown parser —
   it uses the schema so it can apply semantic CSS classes (status badges, callout
   types) that a generic parser cannot infer.
3. Writes each `.plan.html` as a self-contained document with embedded CSS
   (no CDN, no external fonts — see `plan-html.plan.md` for palette and structure).
4. Writes `index.html` (or `<output-dir>/index.html`) — a dashboard listing every
   `.plan.md` with its `status` badge and `title` or `next-action` subtitle,
   sorted by file path with `plan`, `checkpoint`, `slice` pinned to the top.

`html` is intentionally separate from `render` — it is never called automatically
during a session. It is a human-facing export command, not a session step.

```
memplan-cli.js html <dir> --file <relative-path>
```

Single-file variant: converts one `.plan.md` to `.plan.html` (and regenerates
`index.html` to keep the dashboard consistent). Used for quick preview of a single
file without a full export pass.

---

### Progress

```
memplan-cli.js progress <dir> <m> <n> <text>
```

Writes `<m>/<n> | <text>` to `<dir>/.memplan/progress`. `progress` is a mutable
single-line file with no `.plan.md` counterpart — this is a direct write, no locking needed.
Examples: `0/N | not started` (after planning), `3/12 | implement-feedscript-parse-loop` (mid-session).

---

## How skills use the CLI

Before the CLI, a skill step like "update progress" required the agent to:
1. Read `progress` (to get the current value)
2. Decide on the new value
3. Write the file
4. Handle the OS locking dance

With the CLI, the skill says:
```
Run: node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" progress . 3 12 "implement-feedscript-parse-loop"
```

The agent provides only the reasoning (which step, what text). The CLI does the rest.

### Pattern for every `.mem` write in a SKILL.md

```
# Decide: [agent reasoning about what to write]
# Act:
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" <command> . <args>
```

The agent's role is to determine the arguments. The CLI's role is to apply them correctly.

---

## Renderer schema (per-file section order for `.plan.md`)

The canonical section order for each file type is baked into the CLI (not the SKILL.md),
so it cannot drift between skills. Each file type has a schema entry:

| File | Mutable keys rendered in order |
|------|-------------------------------|
| `plan.mem` | title, step-count, current, status — then step entries numerically |
| `checkpoint.mem` | last-action, next-action, open-questions |
| `persona.mem` | style, test-policy, test-reason, commit-format, lang — then fact entries |
| `hot.mem` | hot-files (list), last-updated |
| `slice.mem` | title, ready-steps — then step entries numerically |
| `risk.mem` | what-could-break, irreversible, verify-first |
| `budget.mem` | ranked list of file + cost entries |
| `memory/entities.mem` | append-only only (entity entries, sorted by timestamp) |
| `memory/aliases.mem` | mutable key per alias — rendered alphabetically by key |
| `memory/facts.mem` | append-only only (fact entries, sorted by timestamp) |
| `memory/failures.mem` | append-only only (failure entries, sorted by timestamp) |
| `memory/questions.mem` | append-only only (question + answer entries, sorted by timestamp) |
| `decisions/log.mem` | append-only only (decision entries, sorted by timestamp) |

Any file not in the schema falls back to: mutable keys in insertion order, then append-only
entries by timestamp.

---

## Testing the CLI

`plugins/memplan/bin/memplan-cli.test.js` — Node `assert`-based unit tests, no framework.
Tests cover:
- `init` idempotency
- `set` removes all prior occurrences of key
- `append` never reads the file (mock fs)
- `render` produces byte-for-byte canonical output
- FeedScript `apply`: each op type, error paths, delete-on-success
- `deps-closure` correctness on the initial graph and on an incremental append
- `stale-list` correctly excludes resolved entries
- `overflow-check` redirects to overflow.mem when cap exceeded
- `progress` writes correct format

Run with: `node --test plugins/memplan/bin/memplan-cli.test.js`
