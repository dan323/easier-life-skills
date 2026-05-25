# memplan — Implementation Steps

Ordered by phase. Each step is atomic and independently committable.
Reference files: `overview.plan.md`, `skills.plan.md`, `file-layout.plan.md`,
`conventions.plan.md`, `mem-language.plan.md`, `feedback-language.plan.md`,
`inbox-protocol.plan.md`, `token-budget.plan.md`.

---

## Bootstrap (prerequisite — do this once before Phase 1)

- [ ] 0a. Create `.memplan/deps.mem` defining the dependency graph (from `dependencies.plan.md`)
- [ ] 0b. Create `.memplan/steps.mem` from this file (`steps.plan.md`) using MemScript v1.
  Each step becomes a `+step:id=#N,text=TEXT,status=todo` append line.
  Create `.memplan/steps.plan.md` with the generated-file header.
  These files are optional during orientation but REQUIRED before `memplan/act` runs.
  `memplan/start` will warn if they are absent; `memplan/act` will hard-halt.

---

## Phase 1 — Core loop (MVP)

- [ ] 1. Scaffold plugin: `/scaffold name=memplan description="Persistent low-token working memory and structured planning for Claude Code" category=productivity`
- [ ] 2. Write `plugins/memplan/references/memscript-v1.md` — MemScript v1 spec (from `mem-language.plan.md`); loaded by skills at runtime
- [ ] 3. Write `plugins/memplan/references/feedscript-v1.md` — FeedScript v1 spec (from `feedback-language.plan.md`)
- [ ] 4. Write `plugins/memplan/references/dual-file-write.md` — shared procedure: unlock → write `.mem` → derive `.plan.md` with generated-file header → re-lock
- [ ] 5. Write `SKILL.md` for `memplan/init` — bootstraps `.memplan/` from scratch; creates dirs, stub files, default `deps.mem`, writes `progress` → `0/0 | not started`
- [ ] 6. Write `SKILL.md` for `memplan/start` — orient; processes inbox first; warns on missing `steps.mem` and stale entries
- [ ] 7. Write `SKILL.md` for `memplan/plan` — creates `plan.mem` + `plan.plan.md`, `slice.mem`, writes `progress` → `0/N | not started`
- [ ] 8. Write `SKILL.md` for `memplan/act` — pre-flight (steps + stale), execute, update progress + code-map, propagate staleness, inline stale resolution
- [ ] 9. Write `SKILL.md` for `memplan/inbox` — processes FeedScript v1; handles ANSWER (appends question-answer), CLEAR-STALE, all other ops
- [ ] 10. Write `SKILL.md` for `memplan/record` — end-of-session close; writes checkpoint, session digest, propagates staleness for files written
- [ ] 11. Write `SKILL.md` for `memplan/gaps` — reads all plan/skill files; runs 7 gap checks; outputs numbered list
- [ ] 12. Write evals for Phase 1 skills (happy path + interrupted resume + inbox round-trip + gaps detects known issue)
- [ ] 13. `npm run build` — verify plugin appears in marketplace

---

## Phase 2 — Memory depth

- [ ] 14. Add `memory/entities`, `memory/aliases`, `memory/code-map`, `memory/facts`, `memory/failures`, `memory/questions` to files created by `memplan/init`
- [ ] 15. Extend `memplan/act` to append to `entities.mem` and log to `failures.mem`
- [ ] 16. Extend `memplan/start` to grep `aliases.mem` for terms in the user's first message
- [ ] 17. Extend `memplan/record` to append new aliases and facts discovered during the session
- [ ] 18. Write `SKILL.md` for `memplan/ask` — appends `+question:id=TIMESTAMP,text=TEXT,status=open`; dedupes against open questions
- [ ] 19. Write evals for Phase 2 (entities accumulate; same question not asked twice; aliases resolved; answer round-trip via inbox)

---

## Phase 3 — Planning quality

- [ ] 20. Write `SKILL.md` for `memplan/decide` — appends to `decisions/log.mem` + `decisions/log.plan.md`
- [ ] 21. Add `risk` file generation to `memplan/plan` — writes `risk.plan.md` + `risk.mem`; deleted by `memplan/record` on clean close
- [ ] 22. Add `budget.mem` tracking to `memplan/record` — record observed load costs per session
- [ ] 23. Write evals for Phase 3 (risk file present and deleted correctly; decide round-trip)

---

## Phase 4 — Hygiene and hooks

- [ ] 24. Write `SKILL.md` for `memplan/review` — resolves stale entries; compacts append-only files (incl. overflow.mem); compacts question+answer pairs into decisions; regenerates all `.plan.md`; enforces line caps
- [ ] 25. Add PostToolUse hook definition: calls `memplan/act` on every `Write`/`Edit`
- [ ] 26. Add PreToolUse hook definition: calls `memplan/start` on first tool call of a session
- [ ] 27. Document `deps.json` format and how the agent uses it for structural awareness without scanning
- [ ] 28. Write evals for Phase 4 (review compacts without data loss; overflow.mem merged correctly; hooks fire; idempotent re-runs)
- [ ] 29. Final `npm run build` + update `CHANGELOG.md`
