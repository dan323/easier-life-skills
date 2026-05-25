# memplan — Overview

## Goal

A single plugin that gives Claude Code a persistent, low-token-cost working memory
and a structured planning discipline. Every session picks up exactly where the last
one left off. Every plan is informed by what was tried before and what is known about
the codebase. Token overhead stays flat regardless of project size.

---

## Core insight: memory and planning are the same loop

```
orient → plan → act → record → orient → …
```

Most tools treat memory and planning as separate concerns. Here they are one cycle:
- Memory feeds the plan (what do I know? what failed? what's hot?)
- The plan drives action
- Action updates memory (what did I decide? what broke? what did I learn?)

The files are the protocol. The agent doesn't need to "remember" — it reads files.

---

## Phases

### Phase 1 — Core loop (MVP)
`init`, `start`, `inbox`, `plan`, `act`, `record`, `gaps`

Get the orient → plan → act → record cycle working end-to-end. `init` bootstraps
the directory. The inbox protocol ships in Phase 1 — it is the only human feedback
path and must exist before any human uses the tool. `gaps` ships in Phase 1 so it
can be run before implementation proceeds.

### Phase 2 — Memory depth
`entities`, `aliases`, `code-map`, `facts`, `failures`, `questions`

Give the agent accumulated codebase knowledge that survives across sessions.

### Phase 3 — Planning quality
`slice`, `risk`, `decide`, `budget`, `refine`

Improve planning precision and decision traceability. `refine` is optional —
it decomposes coarse steps into atomic sub-steps using divide-and-conquer.

### Phase 4 — Hygiene and hooks
`review`, PostToolUse/PreToolUse hooks, `deps.json`

Make the system self-maintaining and automatic.

---

## Done when

- A fresh session on a project with `.memplan/` takes ≤500 tokens to orient
- After 10 sessions, the agent never asks the same question twice
- A task interrupted mid-way resumes correctly from `checkpoint.mem`
- `memplan/review` runs weekly and all `.mem` files stay under their caps
- All `.plan.md` files are read-only on disk; the agent is the only writer
- A plannotator `.feedback` file dropped into `inbox/` is correctly applied before the session resumes
- A third-party tool can integrate with memplan by writing a valid `.feedback` file — no other coupling required
