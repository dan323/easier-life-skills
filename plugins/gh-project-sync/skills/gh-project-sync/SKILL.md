---
name: gh-project-sync
description: >
  Reconciler between a GitHub Project (v2) board and a task-agent
  unified `tasks.yml`. Use when the user asks to "sync the project
  board with tasks.yml", "reconcile the GitHub project", "pull Todo
  cards into the task queue", "push completed tasks back to the
  board", or supplies both a project URL/number and a tasks file.
  Arguments use `key=value` grammar:
  `tasks=<path>` (required),
  one of `project_url=<url>` OR `project_owner=<owner> project_number=<n>` (required),
  optional `default_repo=<owner/repo>` (for draft cards without a
  linked issue), and optional column name overrides
  `todo_column=…`, `in_review_column=…`, `done_column=…`,
  `wont_do_column=…` (default: `Todo` / `In Review` (falling back to
  `In Progress` if the board has no `In Review` column) / `Done` /
  `Won't Do`). Idempotent — running it any number of times converges
  to the same state.
tools: Bash, PowerShell, Read, Write, Edit, Glob, Grep
---

# GitHub Project ⇄ tasks.yml Reconciler

This skill is a *pure reconciler*. Every run computes the diff between
a GitHub ProjectV2 board and a task-agent unified `tasks.yml`, applies
the four sync rules, and exits. There is no "before run" / "after run"
mode — the skill makes the two sides converge regardless of which
direction state has drifted.

All real work — argument parsing, column resolution, yml IO, plan
computation, and the `gh` calls that mutate the board — lives in
[`scripts/gh_project_sync.py`](../../scripts/gh_project_sync.py). This
SKILL is a thin wrapper that runs the script's `sync` subcommand and
relays its output. Use `python3 …/gh_project_sync.py self-test` to
exercise the pure logic against in-memory fixtures (no `gh` calls,
no network).

## The four rules

For each (card, yml entry) pair, exactly one of these applies:

| Card status                          | yml entry                 | Action                                                                    |
|--------------------------------------|---------------------------|---------------------------------------------------------------------------|
| `Todo`                               | missing                   | **Add** to `tasks.yml` (`status: pending`, `external_ref:`)               |
| `Won't Do`                           | present                   | **Drop** from `tasks.yml` (a human decided not to ship it)                |
| `Done`                               | present                   | **Drop** from `tasks.yml` (a human merged the PR and closed out the card) |
| NOT in `{In Review, Done, Won't Do}` | `status: done` + `pr_url` | **Move card to `In Review`**, post PR link to the card                    |

A `task-agent` completion only means a PR is **open for human review**
— not that the work has shipped. The skill therefore moves the card to
`In Review` (the "agent finished, awaiting human merge" state) and
posts the PR link. The forward-motion rule (rule 4) is intentionally
permissive: it fires whether the card is in `Todo`, `In Progress`,
`Backlog`, or any other non-terminal column, so a human who has
already pulled the card to `In Progress` to babysit the run still
ends up with the card sitting in `In Review` once the PR opens. The
human then moves the card to `Done` themselves once the PR merges;
on the next run, rule 3 above cleans the entry out of the yml.

Boards that don't have an `In Review` column fall back to `In Progress`
automatically — no flag needed. Override with `in_review_column=…` if
your board uses a different name (e.g. `Reviewing`, `Awaiting Review`).

A card with no matching yml entry that is not in `Todo` (e.g. sitting
in `Backlog` or `In Progress`) is left alone — the yml only owns the
"queued for an agent to pick up" subset of the board.

Cards in `Todo` whose linked issue is *closed* are also left alone — a
closed issue is the user's signal that the card is obsolete, and they
just haven't moved it.

This skill never deletes a card, never reopens a closed issue, and
never edits a task's `description`. It only flips `status`, manages
`external_ref`, drops entries, and appends to card bodies / posts
comments.

## Required tools

The skill shells out to `gh` (with the `project` / `read:project`
scopes) and `python3` with PyYAML. If either is missing, halt with a
clear message — do not try to fall back to grep-edits on the YAML file.

```bash
command -v gh         >/dev/null || { echo "Need gh CLI"; exit 1; }
command -v python3    >/dev/null || { echo "Need python3";  exit 1; }
python3 -c "import yaml" 2>/dev/null || { echo "Need PyYAML (pip install pyyaml)"; exit 1; }
gh auth status        >/dev/null 2>&1 || { echo "Run: gh auth login (with project scope)"; exit 1; }
```

See [`references/github-projects.md`](../../references/github-projects.md)
for the GitHub-specific identifiers, GraphQL mutations, and column
vocabulary the script relies on.

---

## Run the reconciler

The skill's whole job is to invoke the orchestrator script with the
user's `key=value` argument string. Substitute the user's arguments
into the `--args-raw` flag:

```bash
SCRIPT="$(dirname "$0")/../../scripts/gh_project_sync.py"
# In production the SKILL caller is given a known repo layout; use the
# absolute path that resolves to plugins/gh-project-sync/scripts/.
python3 "$SCRIPT" sync --args-raw "<<USER_ARGS>>"
```

Pass `--dry-run` to print the plan without mutating yml or the board —
useful for sanity-checking a config change before letting the skill
post to the board.

The script:

1. Parses `--args-raw` (key=value tokens; quote values containing spaces).
2. Calls `gh project field-list / view / item-list` to read the board.
3. Resolves the `Status` field and the option ids for each role,
   applying the `In Review → In Progress` fallback when the user did
   not pass `in_review_column=`.
4. Loads `tasks.yml`, refusing to operate on the legacy two-file
   format (entries without `status:`).
5. Computes the reconciliation plan (the four rules above).
6. Applies yml changes first (cheap, local, easy to roll back via git),
   then board mutations.
7. Prints a Markdown report. Exits non-zero if any `gh` mutation fails.

If the plan is entirely empty *and* there are no skipped diagnostics,
the script prints `Already in sync.` and exits 0.

---

## Report

The script prints a Markdown summary that the skill should relay
verbatim — do not paraphrase it. Shape:

```
## gh-project-sync — <owner>/projects/<n>

tasks file: <path>

  Added to tasks.yml:        N
    - <repo> <id> "<desc>" (item <PVTI_…>)
  Dropped from tasks.yml:    M
    - <external_ref> — <reason>
  Cards moved to In Review:  K
    - <PVTI_…> ← <pr_url>
  Skipped:                   S
    - <item> — <reason>

  Board mutation errors:     E   (only if any gh call failed)
    - <PVTI_…>: <error>
```

If any `gh` call exited non-zero the script exits with code 3 —
partial progress is fine (the yml is already saved), the next run
will re-attempt the board mutations because the idempotence checks
(card status, comment text, draft body) will see the same "needs
mutation" state.

---

## Do not

- **Do not** create cards on the board. New work originates from the
  human; the skill is downstream of the board's Todo column.
- **Do not** ever move a card to `Done`. A `task-agent` completion
  means a PR is open for human review — not that the work shipped.
  Moving to `In Review` (or its `In Progress` fallback) is the
  strongest forward motion this skill is allowed to take; the human
  moves the card to `Done` when the PR merges.
- **Do not** edit a task's `description` after it has been added to
  yml. If the user retitles a card, leave the yml entry as-is — the
  `external_ref` is the durable binding key.
- **Do not** delete cards or close issues. "Won't Do" handling is
  drop-from-yml only; the card stays on the board for the user's
  records.
- **Do not** operate on legacy two-file `tasks.yml` + `tasks-state.yml`
  setups. The script will reject them with a clear upgrade message;
  do not try to work around it.
- **Do not** reimplement the script's logic in shell when invoking
  the skill. Always delegate to `gh_project_sync.py sync` — that is
  the place all the idempotence and column-resolution edge cases are
  tested.
