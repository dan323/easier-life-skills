# 0001 — Compaction moved from shell scripts in SKILL.md into memplan-cli.js

**Status:** Accepted
**Date:** 2026-06-12

## Context

Until memplan v2.1.0, `review/SKILL.md` embedded six near-identical awk scripts (one
per append-only file) plus a jq/shell loop for rewriting `stale.mem`. This was
documented as a deliberate architectural exception to the rule that all `.mem` writes
route through `memplan-cli.js`, on the grounds that the CLI only supported incremental
writes and that duplicating dedup logic in the CLI "would not add safety".

The exception had real costs:

- `review/SKILL.md` was 17.5KB (~4.4k tokens), loaded into context on every
  invocation — the skill's own footer estimated its cost at ~450 tokens, off by 10×.
- The awk scripts printed surviving entries in hash order, destroying the
  chronological ordering of append-only logs.
- They silently dropped every line that didn't match the expected `+key:` pattern
  (e.g. `+cap-warning:` entries in `questions.mem`).
- Each agent run re-interpreted ~300 lines of shell, with the usual risk of
  transcription errors.

## Decision

Implement compaction in the CLI: `memplan-cli.js compact [file]` (table-driven specs
in `bin/lib/compact.js`) and `memplan-cli.js stale-compact`. The SKILL.md invokes one
command per phase instead of embedding the logic.

The concurrency argument for the old exception is unchanged and still mitigated the
same way: compaction breaks the monotonic-append guarantee, so `memplan/review`
remains human-initiated only. `.backup` files are still written before every rewrite,
now by the CLI itself.

## Consequences

- `review/SKILL.md` shrinks ~17.5KB → ~4KB; per-invocation token cost drops ~75%.
- Compaction preserves original entry order and passes through non-dedupable lines —
  both bugs in the awk version are fixed and covered by `bin/memplan-cli.test.js`.
- Dedup identities are now defined in exactly one place (`COMPACT_SPECS`); the
  overflow-merge phase can re-run compaction cheaply after merging.
- The "architectural exception: shell-based compaction" Design Note in SKILL.md is
  retired; this ADR replaces it as the record of why the exception existed and why
  it was removed.
