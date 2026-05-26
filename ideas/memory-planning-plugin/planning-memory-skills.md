# Planning & Memory Skill Ideas

Inspired by backnotprop/plannotator and the goal of minimal token use.

---

## Planning — minimal token overhead

**1. inline-plan**
Writes a single `.plan` file at the repo root: a flat numbered checklist, one line per step, no prose. The agent ticks items with `[x]` in-place. Total context cost: ~5–20 lines per load.

**2. scratchpad**
Appends a `## Scratchpad` fenced block to the bottom of `CLAUDE.md`. Survives compaction because it's in the always-loaded instructions file. Max 20 lines; agent trims oldest entries when full.

**3. decision-log**
Writes decisions to `.decisions` (one line: `YYYY-MM-DD | choice | why`). Read-only after writing. Gives the agent causal history without narrative prose.

**4. micro-adr**
Generates a 3-field ADR in one line: `status | decision | because`. Stored in `adr/.micro` as append-only TSV. No headers, no prose, ~30 chars per record.

**5. task-slice**
Takes a large task description and produces a `slice.md` with at most 5 atomic steps, each tagged `[ready|blocked|done]`. Forces decomposition before coding starts.

**6. risk-flag**
Before any multi-file change, writes a `risks.txt` with at most 3 bullets: what could break, what's irreversible, what to verify first. Discarded after the task completes.

**7. branch-intent**
On `git checkout -b`, writes a one-line `.branch-intent` file: what this branch is for. Loaded by hooks to remind the agent of scope before any tool call.

**8. progress-dot**
Maintains a single `.progress` file: `n/N done | current: <step>`. Updated after each step. The agent loads only this file to orient itself after compaction.

**9. context-budget**
At the start of a session, estimates token cost of loading each major file (CLAUDE.md, plan, schema, etc.) and writes a `budget.txt` ranked list. Helps the agent decide what to skip loading.

**10. checkpoint**
After every N tool calls, writes a `checkpoint.md` with: last action, next action, open questions. Compact resumption point if the context window fills.

---

## Memory — local, file-based

**11. entity-store**
Maintains `memory/entities.tsv` — name, type, one-line description. Agent appends rows; never rewrites. Looked up by grep, not by loading the whole file.

**12. session-digest**
At end of session, distils the conversation into ≤10 bullet points and writes `memory/sessions/YYYY-MM-DD.md`. Future sessions load only the digest, not the raw transcript.

**13. code-map**
Writes `memory/code-map.md`: a flat list of `file | purpose | last-touched`. Updated incrementally, never regenerated from scratch. Replaces expensive full-repo scans.

**14. learned-facts**
Append-only `memory/facts.md`, one fact per line, prefixed with a tag (`[user]`, `[codebase]`, `[tool]`). Agent greps by tag when it needs a specific category.

**15. failure-log**
Writes `memory/failures.log` with failed commands and why. The agent reads this before retrying similar operations to avoid repeating known dead-ends.

**16. alias-map**
Stores `memory/aliases.tsv`: short project-specific abbreviations → full meaning (e.g. `PDU → PaymentDetailsUpdate`). Loaded once; saves re-explaining domain vocabulary every session.

**17. hot-context**
Maintains `memory/hot.md` — the 5 files most frequently touched in recent sessions. Used to prime the agent's first Read calls without a full codebase scan.

**18. dependency-snapshot**
Writes `memory/deps.json`: a hand-curated (not auto-scanned) map of which modules call which. Updated by the agent only when it discovers a new dependency. Read by search, not full load.

**19. open-questions**
`memory/questions.md` — append-only list of things the agent doesn't know yet and has flagged for the human. Cleared by the human when answered. Prevents the same question being asked twice.

**20. persona-notes**
`memory/persona.md` — the user's preferred style, tone, and non-obvious constraints (e.g. "never use ternaries", "always write tests before code"). 10 lines max. Loaded at session start as a cheap substitute for re-explaining preferences.

---

## Common pattern across all of these

- Files are append-only or in-place-update — no regeneration from scratch
- Loaded on demand (by grep or targeted Read), not bulk-loaded
- Hard line-count caps enforced by the skill itself
- Human-readable plain text or TSV — no JSON parsing overhead
- Single responsibility: one file per concern
