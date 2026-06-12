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

## Phase 3 — delete dead weight, fix docs ⏳

- [ ] Drop `record` Phase 5 (`budget.mem`) — no consumer.
- [ ] Fix `docs/usage.md`: `steps.mem` → `plan.mem`; honest token numbers; align
      `start`'s 500-token output cap with the advertised 50–80.
- [ ] Gitignore the stray `.memplan/` dogfooding dirs (repo root and `plugins/memplan/`).

Estimated impact: Phase 1 ≈ 1k tokens saved per session globally; Phases 2–3 cut
per-invocation cost ~50–70% for `plan`, `act`, `record`, `review`.

## Cost-savings measurement plan ⏳

Goal: verify each phase's savings with numbers, not estimates. Three measurements,
cheapest first.

### M1 — Static footprint (no sessions needed)

What the plugin costs before any skill runs.

- **Always-on cost**: token-count every skill's frontmatter `description` (+ name)
  across versions. Approximate tokens as `chars / 4`, or exactly via
  `npx tiktoken` / the Anthropic `count_tokens` API.
- **Per-invocation cost**: token-count each SKILL.md body (loaded on every invocation).
- Script idea: `node scripts/measure-footprint.js <git-ref>` — checks out the plugin at
  a ref, prints a table `skill | description tokens | body tokens`. Run for `v1.4.0`
  (commit 98909b1), Phase 1, and Phase 2 refs; record the table here.

### M2 — Scenario benchmark (controlled A/B)

Fixed scripted scenario run against both plugin versions in a throwaway project:

1. `bootstrap` → 2. `plan` a fixed 6-step task (same prompt verbatim) →
3. `act` ×3 → 4. one `update-mem` note → 5. `record`.

For each run capture, per skill invocation:
- **Total tokens**: sum `usage.input_tokens` + `usage.output_tokens` from the session
  transcript JSONL under `~/.claude/projects/<project-slug>/` (each assistant message
  carries a `usage` block). Cache reads/writes counted separately.
- **Bash round-trips**: count of Bash tool_use blocks (proxy for CLI-call overhead —
  Phase 2's batch commands should cut this hardest: plan ~25 → ~2, record ~15 → ~4).
- Repeat ×3 per version and average — agent runs are nondeterministic.

### M3 — In-the-wild telemetry (optional, longer term)

Enable Claude Code OTEL metrics (`CLAUDE_CODE_ENABLE_TELEMETRY=1`) and compare
`claude_code.token.usage` across a week of real sessions before/after upgrading the
plugin. Only worth it if M2 results look surprising.

### Report

Add a `## Measured results` section here with one table per measurement:
`metric | v1.4.0 | phase 1 | phase 2 | Δ%`. Done-when: M1 and M2 tables filled in.
