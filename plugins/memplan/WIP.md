# WIP — memplan token-cost reduction

Working notes for an in-progress overhaul. Delete this file when all phases are done.

## Diagnosis (2026-06-12)

The memory format is cheap; the machinery around it is expensive. Four sinks:

1. **Always-on cost**: 12 skills × verbose frontmatter descriptions ≈ 1,200–1,500 tokens
   in *every* session's system prompt, even in projects without `.memplan/`. `update-mem`
   triggered on generic phrases ("note that", "I prefer", "from now on") and fired in
   unrelated conversations.
2. **Per-invocation cost**: SKILL.md bodies are huge — `review` 17.5KB (~4.4k tokens),
   `act` 9.6KB. Mechanical procedure (awk compaction scripts, step-parsing walkthroughs)
   lives in prose instead of the CLI.
3. **Round-trip overhead**: one Bash call per datum (`plan` ≈ 25 CLI calls, `record` ≈ 15).
   The "propagate staleness" phase is duplicated in five skills and makes the agent do
   what the CLI could do internally on every write.
4. **Dead weight**: `record` writes `budget.mem` estimates nothing reads; the PreToolUse
   hook printed `inbox: 0 ops applied` into context every session; `docs/usage.md`
   references a nonexistent `steps.mem` and understates orient cost.

## Phase 1 — cut the always-on tax ✅ (done 2026-06-12, v2.0.0)

- [x] Rewrite all frontmatter descriptions to 1–2 sentences, trim trigger-phrase lists.
- [x] Narrow `update-mem` triggers to memplan-explicit phrasing.
- [x] Merge `ask` + `decide` into `update-mem` (they were strict subsets of its routing
      table); fold `inbox` into `start` (it was a thin CLI wrapper `start` already calls).
      12 skills → 9.
- [x] PreToolUse hook: only print inbox output when ops were actually applied.
- [x] Rename `init` → `bootstrap` (clashed with Claude Code's built-in `/init`).
      The `memplan-cli.js init` subcommand keeps its name.

## Phase 2 — move mechanics from SKILL.md into the CLI ✅ (done 2026-06-12, v2.1.0)

- [x] `memplan-cli.js compact [file]` (table-driven specs in `bin/lib/compact.js`) and
      `stale-compact`. `review` shrank 17.5KB → ~4KB; Design Notes moved to
      `skills/review/adr/0001-compaction-moved-into-cli.md`. Fixes two awk bugs:
      hash-order output and dropped non-matching lines.
- [x] `set` / `append` / `progress` auto-propagate staleness via `deps-closure.mem`
      (deduplicated against already-unresolved entries). "Propagate staleness" phases
      deleted from `plan`, `act`, `record`, `update-mem`, `refine`.
- [x] Batch commands: `plan-write` (JSON via stdin — plan + progress + slice + risk in
      1 call instead of ~25), `checkpoint <last> <next> <questions>`, `digest <summary>`
      (bullets via stdin).
- [x] `status` command: one compact JSON snapshot (progress, plan steps, checkpoint,
      unresolved stale) replacing `act`'s repeated full-file `cat`s.
- [x] Bug fixes found along the way: `hot-bump` wrote `.memplan/hot.mem` while every
      reader uses `.memplan/memory/hot.mem`; `append` failed with EPERM on files locked
      by a prior `set`.

## Phase 3 — delete dead weight, fix docs ✅ (done 2026-06-12, v2.2.0)

- [x] Drop `record` Phase 5 (`budget.mem`) — no consumer. Also removed from the CLI:
      `INITIAL_DEPS`, `SCHEMAS`, `PAIRED`, and the custom `renderBudget` in render.js.
- [x] Fix `docs/usage.md`: `steps.mem` → `plan.mem`; honest token numbers (3-line
      summary ≈40–80 tokens, hard cap 200 with warnings — `start` SKILL aligned);
      removed duplicated "External tool integration" section; PostToolUse hook
      description corrected (invokes the CLI, not `memplan/act`).
- [x] Fix stale `steps.mem` references in the act/gaps/start evals and remove the
      budget assertion + root `hot.mem` paths from the record evals.
- [x] Gitignore `.memplan/` and untrack the dogfooding dirs that had leaked into git
      (repo root and `plugins/memplan/`).

Estimated impact: Phase 1 ≈ 1k tokens saved per session globally; Phases 2–3 cut
per-invocation cost ~50–70% for `plan`, `act`, `record`, `review`.

## Cost-savings measurement plan ⏳ (harness implemented 2026-06-12 — runs pending)

Harness + runbook live in `scripts/`: `measure-session.mjs` (per-session metrics
from a transcript JSONL, plus `--overhead` for metric 4; tested in
`measure-session.test.mjs`) and `experiment.md` (step-by-step run protocol).
What remains is executing the runs and filling in `## Measured results`.

Goal: measure whether memplan **pays for itself** — the same set of actions performed
with the plugin vs without it. (Not a comparison between plugin versions: that only
shows our refactor made memplan cheaper, not that memplan is worth installing.)

### The experiment — with vs without

Two arms, identical fixture repo (copy of a small real project), identical task,
identical prompts wherever the arms allow:

- **Arm A (memplan)**: plugin installed. Session 1: `bootstrap` → `plan` the task →
  `act` the first ~half of the steps → `record`. Session 2 (fresh context):
  hook/`start` orients → `act` the remaining steps → `record`.
- **Arm B (vanilla)**: plugin not installed. Session 1: same task prompt, implement
  the first half, end session. Session 2 (fresh context): "continue the task" —
  Claude must re-orient from the code, git log, and its own devices.

The task must span **two sessions** — cross-session continuity is memplan's value
proposition. A single-session comparison only shows memplan's overhead (bootstrap +
plan ceremony) with no chance for the payoff (cheap re-orientation).

### Metrics, per arm

From the session transcript JSONL under `~/.claude/projects/<project-slug>/`
(each assistant message carries a `usage` block):

1. **Total tokens, both sessions** — input + output; cache reads/writes tallied
   separately. The headline number.
2. **Re-orientation cost** — session 2 tokens spent before the first productive edit
   (first Edit/Write to a project file). This is where arm A should win.
3. **Tool-call counts** — total, and Bash specifically (memplan's CLI ceremony shows
   up here; vanilla's exploration shows up as Read/Grep).
4. **Standing overhead (arm A only)** — the skill descriptions in the system prompt
   (≈ chars/4 of all frontmatter descriptions) are paid in *every* session, including
   ones that never touch memplan. Report it alongside, since the break-even depends
   on it.
5. **Outcome check** — did both arms actually complete the task correctly? A cheaper
   wrong answer doesn't count.

Repeat ×3 per arm (agent runs are nondeterministic) and average.

### How to measure token cost (harness)

The raw data is the session transcript: Claude Code writes one JSONL file per session
under `~/.claude/projects/<project-path-slug>/<session-uuid>.jsonl` (the slug is the
project path with separators replaced by `-`). Every assistant message line carries
`message.usage` with `input_tokens`, `output_tokens`, `cache_creation_input_tokens`,
and `cache_read_input_tokens`; tool calls appear as `tool_use` content blocks with
`name` and `input`.

Implemented: a small read-only script, `plugins/memplan/scripts/measure-session.mjs
<transcript.jsonl> [--project-root <path>]`, that emits one JSON row per session:

- `inputTokens`, `outputTokens`, `cacheWriteTokens`, `cacheReadTokens` — straight sums
  over all assistant messages.
- `weightedCost` — single comparable number using API price ratios relative to input:
  `input×1 + output×~5 + cacheWrite×1.25 + cacheRead×0.1`. Raw sums alone mislead:
  arm A and arm B have very different cache profiles, and output tokens cost ~5×.
- `toolCalls` — `{ total, byName: { Bash: n, Read: n, Edit: n, … } }`.
- `tokensBeforeFirstEdit` — cumulative weighted cost of all messages up to (and
  including) the first `Edit`/`Write` tool_use whose `file_path` is inside
  `--project-root` and not under `.memplan/`. This is the re-orientation metric
  for session 2.

Procedure per run: note the session UUID after each of the four sessions (2 arms ×
2 sessions; `/status` shows it, or take the newest file in the project's transcript
dir), run the script on each, and paste the rows into the results table. The script
sums what the harness logged — it never needs API access — and lives outside the
plugin's skill payload, so it adds zero tokens to memplan itself.

Static overhead (metric 4) needs no transcript: `measure-session.mjs --overhead
plugins/memplan` sums the byte count of all nine frontmatter `description` blocks
÷ 4 — currently ≈455 tokens — reported as a standing per-session tax in arm A's
column.

Two transcript-format gotchas the script handles (worth knowing if it ever reads
a future format): the harness writes one JSONL line **per content block**, all
sharing one `message.id` and carrying the *same* `usage` object, so usage must be
deduplicated by id or totals inflate ~3–10×; and `file_path` values mix `C:\…`,
`/c/…`, and `/mnt/c/…` spellings, which the script normalises before the
project-root check.

### Report

Add a `## Measured results` section here:
`metric | vanilla | memplan | Δ` per session and total, plus the break-even note
(how many memplan-using sessions are needed to amortise the standing overhead).
Done-when: the table is filled in and the conclusion (worth it / not / only for
long-running projects) is written down.

Secondary (already-implemented optimisation): the same harness run against memplan
v1.4.0 (commit 98909b1) vs v2.1.0 quantifies phases 1–2, but that is a nice-to-have,
not the question this plan answers.
