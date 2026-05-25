# memplan — Implementation Steps

Ordered by phase. Each step is atomic and independently committable.
Reference files: `overview.plan.md`, `skills.plan.md`, `file-layout.plan.md`,
`conventions.plan.md`, `mem-language.plan.md`, `feedback-language.plan.md`,
`inbox-protocol.plan.md`, `token-budget.plan.md`, `scripting-layer.plan.md`.

---

## Bootstrap (prerequisite — do this once before Phase 1)

- [ ] 0a. Create `.memplan/deps.mem` defining the dependency graph (from `dependencies.plan.md`)
- [ ] 0a2. Extend `memplan/init` to compute `deps-closure.mem` (transitive closure of `deps.mem`) at init time; `memplan/act` reads `deps-closure.mem` for staleness propagation (not `deps.mem`)
- [ ] 0b. Create `.memplan/steps.mem` from this file (`steps.plan.md`) using MemScript v1.
  Each step becomes a `+step:id=#N,text=TEXT,status=todo` append line.
  Create `.memplan/steps.plan.md` with the generated-file header.
  These files are optional during orientation but REQUIRED before `memplan/act` runs.
  `memplan/start` will warn if they are absent; `memplan/act` will hard-halt.
- [ ] 0c. Write `plugins/memplan/bin/memplan-cli.js` — the scripting layer (from `scripting-layer.plan.md`).
  Implements: `init`, `set`, `clear`, `append`, `render`, `render-all`, `lock`, `unlock`,
  `apply`, `inbox`, `deps-closure`, `deps-closure-append`, `stale-mark`, `stale-resolve`,
  `stale-list`, `overflow-check`, `progress`.
  All mechanical file operations in every skill MUST delegate to this CLI; the agent
  provides only arguments (reasoning), the CLI does the I/O.
- [ ] 0d. Write `plugins/memplan/bin/memplan-cli.test.js` — Node `--test` unit tests for the CLI.
  Cover: init idempotency; `set`/`clear`/`append`; canonical `render` output; FeedScript
  `apply` (all op types + error paths); `deps-closure` correctness; `stale-list` resolution
  filtering; `overflow-check` redirection; `progress` format.
  Run with: `node --test plugins/memplan/bin/memplan-cli.test.js`

---

## Phase 1 — Core loop (MVP)

- [ ] 1. Scaffold plugin: `/scaffold name=memplan description="Persistent low-token working memory and structured planning for Claude Code" category=productivity`
- [ ] 2. Write `plugins/memplan/references/memscript-v1.md` — MemScript v1 spec (from `mem-language.plan.md`); loaded by skills at runtime
- [ ] 3. Write `plugins/memplan/references/feedscript-v1.md` — FeedScript v1 spec (from `feedback-language.plan.md`)
- [ ] 4. ~~Write `plugins/memplan/references/dual-file-write.md`~~ — SUPERSEDED by the scripting layer.
  Skills no longer contain a manual unlock→write→lock procedure; they call
  `memplan-cli.js set/append/render` instead. This step is dropped.
- [ ] 5. Write `SKILL.md` for `memplan/init` — instructs agent to run `memplan-cli.js init .`;
  the CLI creates all dirs, stub files, `deps.mem`, and `deps-closure.mem`.
  Agent adds only project-specific content (branch-intent, initial persona entries).
- [ ] 6. Write `SKILL.md` for `memplan/start` — orient; runs `memplan-cli.js inbox .` first
  (CLI processes all `.feedback` files); reads `.mem` files for reasoning;
  runs `memplan-cli.js stale-list .` to surface stale warnings; warns on missing `steps.mem`.
  Agent performs: reading, reasoning, printing the 3-line summary. No file writes.
- [ ] 7. Write `SKILL.md` for `memplan/plan` — agent reasons about the plan and determines
  step texts and deps; writes each step via `memplan-cli.js append . plan.mem step id=N,text=T,deps=D`;
  sets progress via `memplan-cli.js progress . 0 N "not started"`;
  writes slice via `memplan-cli.js set . slice.mem ready-steps ...`;
  CLI handles all locking and `.plan.md` rendering.
- [ ] 8. Write `SKILL.md` for `memplan/act` — pre-flight uses CLI outputs (stale-list, step
  status from plan.mem read); agent executes the step; post-write ops all use CLI:
  `progress`, `append` for code-map/entities/failures, `stale-mark` for dependents,
  `deps-closure-append` for new files. Agent halts on non-zero CLI exit codes.
- [ ] 9. Write `SKILL.md` for `memplan/inbox` — skill is now a thin wrapper:
  runs `memplan-cli.js inbox .` and reports the summary from decisions/log.mem.
  Agent is not involved in FeedScript parsing or file manipulation.
- [ ] 10. Write `SKILL.md` for `memplan/record` — agent decides content (checkpoint text,
  session bullets, new facts/aliases discovered); writes each via CLI append/set commands;
  CLI handles locking and rendering; `render-all` not called here (deferred to review).
- [ ] 11. Write `SKILL.md` for `memplan/gaps` — read-only; agent reads plan files and runs
  checks; outputs numbered gap list. No CLI writes needed (gaps produces no output files).
- [ ] 12. Write evals for Phase 1 skills (happy path + interrupted resume + inbox round-trip
  via CLI + gaps detects known issue). Evals verify CLI is invoked correctly (stdout/stderr).
- [ ] 13. `npm run build` — verify plugin appears in marketplace

---

## Phase 2 — Memory depth

- [ ] 14. Extend `memplan-cli.js init` to create `memory/entities`, `memory/aliases`,
  `memory/code-map`, `memory/facts`, `memory/failures`, `memory/questions` stubs and their
  paired `.plan.md` files. Add these files to the per-file renderer schema in the CLI.
- [ ] 15. Extend `memplan/act` SKILL.md to append entities via
  `memplan-cli.js append . memory/entities.mem entity name=X,type=T,desc=D` and failures via
  `memplan-cli.js append . memory/failures.mem failure cmd=C,reason=R`.
- [ ] 16. Extend `memplan/start` SKILL.md to read `aliases.mem` (agent does grep reasoning;
  no CLI write needed here — orient is read-only).
- [ ] 17. Extend `memplan/record` SKILL.md to append new aliases/facts via CLI append commands.
- [ ] 18. Write `SKILL.md` for `memplan/ask` — agent dedupes by reading `questions.mem`;
  appends via `memplan-cli.js append . memory/questions.mem question id=TIMESTAMP,text=T,status=open`.
- [ ] 19. Write evals for Phase 2 (entities accumulate; same question not asked twice; aliases
  resolved; answer round-trip via CLI inbox)

---

## Phase 3 — Planning quality

- [ ] 20. Write `SKILL.md` for `memplan/decide` — agent determines choice+reason text;
  writes via `memplan-cli.js append . decisions/log.mem decision choice=C,because=B`.
- [ ] 21. Write `SKILL.md` for `memplan/refine` — agent reasons about atomicity and generates
  sub-step texts; writes sub-steps via CLI append; updates parent step `refined=true` via
  `memplan-cli.js set`; updates progress denominator via `memplan-cli.js progress`.
- [ ] 22. Extend `memplan/act` SKILL.md to handle `refined=true` steps — execute sub-steps in
  order; mark parent complete when all sub-steps done (CLI progress updates throughout).
- [ ] 23. Add `risk` file generation to `memplan/plan` SKILL.md — agent writes risk bullets via
  CLI set commands; `memplan/record` deletes `risk.mem` on clean close via Bash `rm`.
- [ ] 24. Add `budget.mem` tracking to `memplan/record` SKILL.md — agent observes load costs
  and appends via `memplan-cli.js append . budget.mem session date=D,files=F,tokens=T`.
- [ ] 25. Write evals for Phase 3 (refine decomposes correctly; act executes sub-steps; idempotent re-run; risk file lifecycle; decide round-trip)

---

## Phase 4 — Hygiene and hooks

- [ ] 24. Write `SKILL.md` for `memplan/review` — agent reads all `.mem` files for reasoning
  (which entries to compact, what to prune); delegates all writes to the CLI:
  `stale-resolve`, `append` for compacted decisions, `render-all` for final `.plan.md`
  regeneration, `deps-closure` if `deps.mem` changed. The CLI's `render-all` ensures
  canonical output — agent never hand-writes a `.plan.md`.
- [ ] 25. Add PostToolUse hook definition: calls `memplan/act` on every `Write`/`Edit`
- [ ] 26. Add PreToolUse hook definition: calls `memplan/start` on first tool call of a session
- [ ] 27. Document `deps.json` format and how the agent uses it for structural awareness without scanning
- [ ] 28. Write evals for Phase 4 (review compacts without data loss; overflow.mem merged
  correctly via CLI redirect; hooks fire and invoke CLI; idempotent re-runs)
- [ ] 29. Final `npm run build` + update `CHANGELOG.md`
