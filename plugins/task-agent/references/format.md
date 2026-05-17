# task-agent tasks-file format

task-agent reads tasks from a YAML file. Two layouts are supported; the helper script
`scripts/tasks_io.py` auto-detects which one you have and normalizes both into the same
in-memory shape before any other phase looks at the data.

## Unified mode (recommended)

A single file with task objects. Each task carries a `status` that flips in place when
task-agent finishes it.

```yaml
projects:
  - repo: owner/repo-name
    tasks:
      - id: abc123                       # 6-char hex; auto-generated if omitted
        description: Short task title    # required
        status: pending                  # pending | done | failed | skipped
        # Completion fields (written by task-agent when status flips to done):
        branch: task/abc-123             # set on done
        pr_url: https://github.com/...   # set on done (may be absent if nothing to commit)
        date: "2026-05-17"               # ISO date, set on done | failed | skipped
        # Failure / skip metadata:
        error: short reason              # set on failed
        reason: short reason             # set on skipped
        # Free-form passthrough (preserved verbatim across rewrites):
        external_ref: PVTI_kwDOA_example # e.g. a GitHub Project item id
        labels: [bug, quick]
        priority: 2
```

Detection rule: **any task object containing a `status:` field puts the file in unified
mode.** The whole file then operates as unified, even if other tasks are bare strings —
those are normalized in-memory to `{description, id, status: pending}` on read, but their
on-disk form is preserved on rewrite (only the task being completed gets rewritten).

No state file is read or written in unified mode.

## Legacy mode (backwards-compatible)

Two files:

`agent-tasks.yml` (tasks to do, as bare strings):

```yaml
projects:
  - repo: owner/repo-name
    tasks:
      - "Add unit tests for the authentication module"
      - "Fix the typo in README.md"
```

`agent-tasks-state.yml` (completion log, sibling file):

```yaml
completed:
  - repo: owner/repo-name
    task: "Add unit tests for the authentication module"
    status: done
    branch: task/add-unit-tests-abc123
    pr_url: https://github.com/owner/repo-name/pull/42
    date: "2026-03-20"
```

Detection rule: the tasks file has **no** task with a `status:` field. The state file
path is whatever `state=<path>` argument was passed, or — if absent — the tasks file's
stem with `-state.yml` appended (so `agent-tasks.yml` looks for
`agent-tasks-state.yml`, `my-board.yml` looks for `my-board-state.yml`).

On completion in legacy mode, the task is removed from the tasks file and a new entry is
appended under `completed:` in the state file. If a project's task list becomes empty,
the project is dropped from the tasks file entirely.

## Status enum

| Status    | Meaning                                                     | Required completion fields            |
|-----------|-------------------------------------------------------------|---------------------------------------|
| `pending` | Not yet attempted. Picked by `tasks_io.next_pending`.       | —                                     |
| `done`    | Completed successfully (PR opened or no changes needed).    | `branch`, `date`; `pr_url` if a PR    |
| `failed`  | Attempted but could not finish. Skipped by future runs.     | `error`, `date`                       |
| `skipped` | Intentionally not run (e.g. repo gone, task obsolete).      | `reason`, `date`                      |

`failed` and `skipped` are terminal — the picker steps past them, so a stuck task never
blocks the queue.

## Passthrough metadata contract

Unknown keys on any task entry — `external_ref`, `labels`, `priority`, vendor-specific
ids, anything — are preserved verbatim across every read/write cycle. This is the
contract that downstream sync skills (e.g. `gh-project-sync`) depend on: they can
attach a stable id to a task and trust task-agent will never drop it.

The script tests this in its self-test (`python3 tasks_io.py self-test`).

## Stable task ids

If a task has no `id`, one is synthesized as `md5(repo + "\n" + description)[:6]`. The
same algorithm is used for the branch-name suffix in Phase 3, so the on-disk id and
the branch hash always match. Editing a task's description **changes** its synthesized
id; if you want id stability across edits, set `id:` explicitly.
