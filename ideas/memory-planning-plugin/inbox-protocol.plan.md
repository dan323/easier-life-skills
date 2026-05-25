# memplan — Inbox Protocol & Plugin Extension Point

## Problem being solved

`.plan.md` files are read-only (see `conventions.plan.md`). The agent reads `.mem`
files. There is no direct path for a human or external tool to influence the plan.

The inbox is that path.

---

## Inbox directory: `.memplan/inbox/`

Any file matching `.memplan/inbox/*.feedback` is a pending feedback batch.
The agent processes all pending files at the start of every session, before reading
any other state.

The feedback file format is FeedScript v1 — see `feedback-language.plan.md`.

---

## Plugin extension point

Any external tool becomes a memplan plugin by following this three-step contract:

1. **Read** `plan.plan.md` (always present, always fresh, human-readable).
   Optionally read any other `.plan.md` for context (`checkpoint`, `risk`, `slice`).
2. **Write** `.memplan/inbox/<tool-name>.feedback` with FeedScript v1 operations.
3. **Do not touch** any `.mem` file directly — those are owned by the agent.

No manifest. No registration. No API. The inbox is the entire interface.
Any tool that writes a valid `.feedback` file is automatically picked up.

---

## Plannotator integration

Plannotator (https://github.com/backnotprop/plannotator) already fits this protocol:

1. It reads `plan.plan.md` → renders a visual annotation UI in the browser.
2. The human approves, rejects, or annotates individual steps.
3. Plannotator writes `.memplan/inbox/plannotator.feedback` with the structured result.
4. On next `memplan/start`, the agent calls `memplan/inbox`, applies the feedback,
   updates `plan.mem`, regenerates `plan.plan.md` (re-locked), deletes the `.feedback` file.

The human never edits a raw file. The agent never sees the browser UI.
The inbox is the contract.

---

## Manual feedback (no external tool)

A human can write a `.feedback` file directly in a text editor — it is plain text
with a simple line format. The generated-file header in `plan.plan.md` tells them where
to put it and points to the language spec.

---

## Inbox processing guarantee

- Files processed oldest-first.
- Ops applied in file order within each file.
- Errors never abort processing (logged to `questions.mem`, skipped).
- Each processed file deleted after application.
- Summary appended to `decisions/log.mem` for traceability.
- All affected `.plan.md` files regenerated and re-locked before the session continues.

---

## Two-channel model (summary)

| Direction | Channel | Format | Who writes |
|-----------|---------|--------|------------|
| Agent → Human | `*.plan.md` (read-only) | Readable markdown | Agent only |
| Human/tool → Agent | `.memplan/inbox/*.feedback` | FeedScript v1 | Human, external tools, plugins |
