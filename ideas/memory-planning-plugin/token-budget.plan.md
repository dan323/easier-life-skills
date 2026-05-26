# memplan — Token Budget, Synergies & Hook Integration

## Token budget

Each `.mem` file has a hard line cap enforced by the skill on every write.
`.plan.md` files have no cap — they are never loaded by the agent.

| `.mem` file | Line cap | Typical agent load cost |
|-------------|----------|-------------------------|
| `progress` | 1 | ~10 tokens |
| `checkpoint.mem` | 15 | ~50 tokens |
| `persona.mem` | 10 | ~35 tokens |
| `hot.mem` | 5 | ~20 tokens |
| `plan.mem` | 20 | ~70 tokens |
| `slice.mem` | 8 | ~30 tokens |
| `risk.mem` | 3 | ~20 tokens |
| `budget.mem` | 10 | ~25 tokens |
| **Full orient load** | | **~260 tokens** |

Inbox processing adds ~30 tokens when feedback is present.

Compare to loading `CLAUDE.md` + a README + a schema: typically 3,000–8,000 tokens.

Append-only files (`failures.mem`, `facts.mem`, `entities.mem`, `decisions/log.mem`,
`sessions/`) are not loaded during orient — only grepped on demand.

### Cap overflow behaviour

When a skill attempts to append to a file already at its line cap:
1. Write the new entry to `memory/overflow.mem` instead, prefixed with the target filename:
   `~DATETIME +overflow:target=FILENAME,entry=ENTRY`
2. Append `~DATETIME +cap-warning:file=FILENAME` to `questions.mem` (once per file per session — deduped)

`memplan/start` warns if `overflow.mem` is non-empty: "⚠ overflow.mem has entries — run `memplan/review` to compact."
`memplan/review` merges `overflow.mem` entries into their target files after pruning old entries to make room, then clears `overflow.mem`.

---

## Synergies

| Pair                                             | Synergy                                                               |
|--------------------------------------------------|-----------------------------------------------------------------------|
| `hot.mem` + `budget.mem`                         | Agent loads only the files most likely needed, in cost order          |
| `failures.mem` + `risk.mem`                      | Past failures directly populate current risk assessment               |
| `entities.mem` + `aliases.mem`                   | Domain vocabulary known before planning — no mid-task re-explanations |
| `sessions/YYYY-MM-DD.mem` + `checkpoint.mem`     | Seamless continuation after compaction or multi-day gaps              |
| `progress` + `plan.mem`                          | Single-glance orientation: where are we, what's the full picture      |
| `slice.mem` + `plan.mem`                         | Two zoom levels: full plan stays stable, slice is the current sprint  |
| `decisions/log.mem` + `questions.mem`            | Closed loop: questions get answered and become decisions              |
| `code-map.mem` + `deps.json`                     | Structural awareness without scanning                                 |
| `persona.mem` + `facts.mem`                      | User preferences + codebase facts = no repeated onboarding            |
| `checkpoint.mem` + `sessions/YYYY-MM-DD.plan.md` | Checkpoint for agent (next step), digest for human (what happened)    |
| `inbox/*.feedback` + `plan.mem`                  | Human/tool feedback applied atomically before session resumes         |
| `*.plan.md` (read-only) + `inbox/`               | Hard boundary: humans read one channel, write the other               |

---

## Hook integration

**PostToolUse hook on `Write`/`Edit`**
Calls `memplan/act` automatically to keep `code-map.mem`, `hot.mem`, and `progress`
in sync after every file change, without the agent having to remember.

**PreToolUse hook on first tool call of a session**
Calls `memplan/start` so orientation (including inbox processing) is always fresh
before any work begins.

Both hooks are optional. The skills work without them with slightly more manual discipline.
