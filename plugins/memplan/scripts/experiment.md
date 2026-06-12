# memplan cost experiment — runbook

Executable procedure for the "with vs without" experiment described in `../WIP.md`
(§ Cost-savings measurement plan). Read that section first for the rationale; this
file is only the mechanics.

## 0. One-time setup

1. **Fixture repo.** Pick a small real project (a few hundred lines, with tests) and
   make two identical copies *outside* this repo, e.g.:

   ```bash
   git clone --depth 1 <small-project> /c/exp/fixture-memplan
   git clone --depth 1 <small-project> /c/exp/fixture-vanilla
   ```

   Two separate directories are required because the transcript dir is keyed by
   project path, and because arm A leaves a `.memplan/` behind.

2. **Task.** Write one task prompt that (a) needs ~6–10 implementation steps and
   (b) can be split mid-way — e.g. "add feature X across these three modules, with
   tests". Save it verbatim; both arms get the same words.

3. **Plugin state.** Arm A: memplan installed and enabled. Arm B: run in
   `fixture-vanilla` with memplan uninstalled or disabled (`claude plugin uninstall
   memplan@…` or a `--strict-mcp-config`-style clean profile) — the standing skill
   descriptions must not be in arm B's system prompt.

## 1. Run protocol (one run = 4 sessions)

| # | Arm | Session | Prompts |
|---|-----|---------|---------|
| 1 | A (memplan) | 1 | `/memplan:bootstrap` → `/memplan:plan <task>` → "do the first half of the plan" (`act`) → `/memplan:record` |
| 2 | A (memplan) | 2 (fresh: `claude` new session) | `/memplan:start` → "continue: do the remaining steps" (`act`) → `/memplan:record` |
| 3 | B (vanilla) | 1 | `<task>` + "implement roughly the first half, then stop" |
| 4 | B (vanilla) | 2 (fresh) | "Continue the task from the previous session: <task restated>. Finish the remaining work." |

After **each** session, record its UUID (`/status`, or the newest
`~/.claude/projects/<slug>/*.jsonl`). Reset both fixtures to the same git commit
between runs (`git reset --hard && git clean -fd` — in arm A also delete
`.memplan/`). Repeat the whole protocol ×3 per arm.

**Outcome check (metric 5):** after each session-2, run the fixture's test suite and
note pass/fail. A cheaper wrong answer doesn't count.

## 2. Measure

Per session:

```bash
node plugins/memplan/scripts/measure-session.mjs \
  ~/.claude/projects/<slug>/<session-uuid>.jsonl \
  --project-root /c/exp/fixture-memplan        # or fixture-vanilla
```

Emits one JSON row: `inputTokens` / `outputTokens` / `cacheWriteTokens` /
`cacheReadTokens`, `weightedCost` (input×1 + output×5 + cacheWrite×1.25 +
cacheRead×0.1), `toolCalls` (total + byName), and `tokensBeforeFirstEdit` (weighted
cost up to and including the first `Edit`/`Write` inside the project root,
**excluding** writes under `.memplan/` — the session-2 re-orientation metric).
If `firstProductiveEditFound` is `false`, the session never edited the project and
the metric equals the full session cost.

Standing overhead (arm A only, no transcript needed):

```bash
node plugins/memplan/scripts/measure-session.mjs --overhead plugins/memplan
```

## 3. Report

Average the 3 runs per arm and fill in `## Measured results` in `../WIP.md`:

```
metric                          | vanilla | memplan | Δ
total weightedCost, session 1   |         |         |
total weightedCost, session 2   |         |         |
tokensBeforeFirstEdit, session 2|         |         |
toolCalls total (Bash)          |         |         |
standing overhead / session     |   0     | ~455 tok|
outcome (tests pass, n/3)       |         |         |
```

Break-even note: sessions-to-amortise = standing overhead ÷ per-session-2 saving.
Write down the conclusion (worth it / not / only for long-running projects).
