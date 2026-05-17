#!/usr/bin/env python3
"""task-agent's YAML reader / writer.

Two subcommands:

    tasks_io.py load   <tasks_path> [--state <state_path>]
    tasks_io.py record <tasks_path> --mode <unified|legacy> --task-id <id>
                                    --repo <repo> --description <desc>
                                    --status <done|failed|skipped>
                                    [--state <state_path>]
                                    [--completion-json <json>]

`load` prints a JSON document:
    {
      "mode": "unified" | "legacy",
      "tasks_path": "...",
      "state_path": "..." or null,
      "tasks": [ { "repo", "id", "description", "status", ...preserved-keys } ]
    }

`record` flips a task's status (unified mode) or moves it from the tasks
file into the state file (legacy mode), preserving every unknown key on
the task entry across the rewrite.

Run with `--self-test` to exercise both subcommands against in-memory
fixtures; exits non-zero on any failure.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
from typing import Any

try:
    import yaml
except ImportError:
    sys.stderr.write("tasks_io.py needs PyYAML (pip install pyyaml)\n")
    sys.exit(2)


def stable_id(repo: str, description: str) -> str:
    return hashlib.md5(f"{repo}\n{description}".encode()).hexdigest()[:6]


def _detect_mode(cfg: dict) -> str:
    for project in cfg.get("projects", []) or []:
        for task in project.get("tasks", []) or []:
            if isinstance(task, dict) and "status" in task:
                return "unified"
    return "legacy"


def _derived_state_path(tasks_path: str) -> str:
    stem, _ = os.path.splitext(tasks_path)
    return stem + "-state.yml"


def load(tasks_path: str, state_path: str | None = None) -> dict:
    with open(tasks_path, "r", encoding="utf-8") as fh:
        cfg = yaml.safe_load(fh) or {}

    mode = _detect_mode(cfg)

    state_entries: dict[tuple[str, str], dict] = {}
    resolved_state_path: str | None = None
    if mode == "legacy":
        resolved_state_path = state_path or _derived_state_path(tasks_path)
        if os.path.exists(resolved_state_path):
            with open(resolved_state_path, "r", encoding="utf-8") as fh:
                raw = yaml.safe_load(fh) or {}
            for entry in raw.get("completed", []) or []:
                state_entries[(entry["repo"], entry["task"])] = entry

    normalized: list[dict] = []
    for project in cfg.get("projects", []) or []:
        repo = project.get("repo")
        for task in project.get("tasks", []) or []:
            if isinstance(task, str):
                obj: dict[str, Any] = {"description": task}
            else:
                obj = dict(task)
                desc = obj.get("description") or obj.pop("task", "")
                obj["description"] = desc
            obj.setdefault("id", stable_id(repo, obj["description"]))
            if "status" not in obj:
                done = state_entries.get((repo, obj["description"]))
                if done:
                    obj["status"] = "done"
                    for k in ("branch", "pr_url", "date"):
                        if k in done and k not in obj:
                            obj[k] = done[k]
                else:
                    obj["status"] = "pending"
            normalized.append({"repo": repo, **obj})

    return {
        "mode": mode,
        "tasks_path": tasks_path,
        "state_path": resolved_state_path,
        "tasks": normalized,
    }


def next_pending(normalized: list[dict]) -> dict | None:
    for task in normalized:
        if task.get("status") == "pending":
            return task
    return None


def record_outcome(
    tasks_path: str,
    mode: str,
    task_id: str,
    repo: str,
    description: str,
    status: str,
    completion: dict | None = None,
    state_path: str | None = None,
) -> None:
    completion = completion or {}
    if mode == "unified":
        _record_unified(tasks_path, task_id, status, completion)
    elif mode == "legacy":
        _record_legacy(
            tasks_path,
            state_path or _derived_state_path(tasks_path),
            repo,
            description,
            status,
            completion,
        )
    else:
        raise ValueError(f"unknown mode: {mode}")


def _record_unified(tasks_path: str, task_id: str, status: str, completion: dict) -> None:
    with open(tasks_path, "r", encoding="utf-8") as fh:
        cfg = yaml.safe_load(fh) or {}
    found = False
    for project in cfg.get("projects", []) or []:
        for task in project.get("tasks", []) or []:
            if isinstance(task, dict) and task.get("id") == task_id:
                task["status"] = status
                for k, v in completion.items():
                    task[k] = v
                found = True
                break
        if found:
            break
    if not found:
        raise LookupError(f"task id {task_id} not in {tasks_path}")
    with open(tasks_path, "w", encoding="utf-8") as fh:
        yaml.dump(cfg, fh, default_flow_style=False, allow_unicode=True, sort_keys=False)


def _record_legacy(
    tasks_path: str,
    state_path: str,
    repo: str,
    description: str,
    status: str,
    completion: dict,
) -> None:
    with open(tasks_path, "r", encoding="utf-8") as fh:
        cfg = yaml.safe_load(fh) or {}
    for project in cfg.get("projects", []) or []:
        if project.get("repo") != repo:
            continue
        project["tasks"] = [
            t
            for t in (project.get("tasks") or [])
            if (isinstance(t, str) and t != description)
            or (
                isinstance(t, dict)
                and (t.get("description") or t.get("task")) != description
            )
        ]
    cfg["projects"] = [p for p in (cfg.get("projects") or []) if p.get("tasks")]
    with open(tasks_path, "w", encoding="utf-8") as fh:
        yaml.dump(cfg, fh, default_flow_style=False, allow_unicode=True, sort_keys=False)

    state = {}
    if os.path.exists(state_path):
        with open(state_path, "r", encoding="utf-8") as fh:
            state = yaml.safe_load(fh) or {}
    state.setdefault("completed", []).append(
        {"repo": repo, "task": description, "status": status, **completion}
    )
    with open(state_path, "w", encoding="utf-8") as fh:
        yaml.dump(state, fh, default_flow_style=False, allow_unicode=True, sort_keys=False)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _cmd_load(args: argparse.Namespace) -> int:
    print(json.dumps(load(args.tasks_path, args.state), indent=2))
    return 0


def _cmd_record(args: argparse.Namespace) -> int:
    completion = json.loads(args.completion_json) if args.completion_json else {}
    record_outcome(
        tasks_path=args.tasks_path,
        mode=args.mode,
        task_id=args.task_id,
        repo=args.repo,
        description=args.description,
        status=args.status,
        completion=completion,
        state_path=args.state,
    )
    return 0


def _cmd_self_test(_: argparse.Namespace) -> int:
    failures: list[str] = []

    def check(cond: bool, msg: str) -> None:
        if not cond:
            failures.append(msg)

    with tempfile.TemporaryDirectory() as tmp:
        # Unified mode: load → pick → record → unknown keys survive.
        unified = os.path.join(tmp, "tasks.yml")
        with open(unified, "w", encoding="utf-8") as fh:
            fh.write(
                "projects:\n"
                "  - repo: o/r\n"
                "    tasks:\n"
                "      - id: keep01\n"
                "        description: stays pending\n"
                "        status: pending\n"
                "        external_ref: PVTI_xyz\n"
                "        labels: [bug]\n"
                "      - id: do001\n"
                "        description: do me\n"
                "        status: pending\n"
                "        external_ref: PVTI_abc\n"
            )
        loaded = load(unified)
        check(loaded["mode"] == "unified", "unified mode not detected")
        check(loaded["state_path"] is None, "unified mode must not derive a state path")
        nxt = next_pending(loaded["tasks"])
        check(nxt and nxt["id"] == "keep01", "picker should return first pending entry")
        record_outcome(
            unified,
            mode="unified",
            task_id="do001",
            repo="o/r",
            description="do me",
            status="done",
            completion={"branch": "task/do-me-do001", "pr_url": "https://x/1", "date": "2026-05-17"},
        )
        with open(unified, "r", encoding="utf-8") as fh:
            after = yaml.safe_load(fh)
        do001 = next(t for t in after["projects"][0]["tasks"] if t["id"] == "do001")
        keep01 = next(t for t in after["projects"][0]["tasks"] if t["id"] == "keep01")
        check(do001["status"] == "done", "status not flipped to done")
        check(do001["pr_url"] == "https://x/1", "pr_url not written")
        check(do001["external_ref"] == "PVTI_abc", "external_ref dropped on completed task")
        check(keep01["external_ref"] == "PVTI_xyz", "external_ref dropped on untouched task")
        check(keep01["labels"] == ["bug"], "labels dropped on untouched task")

        # Legacy mode: bare strings, sibling state file, mode detection by absence of status.
        legacy = os.path.join(tmp, "agent-tasks.yml")
        legacy_state = os.path.join(tmp, "agent-tasks-state.yml")
        with open(legacy, "w", encoding="utf-8") as fh:
            fh.write(
                "projects:\n"
                "  - repo: o/r\n"
                "    tasks:\n"
                "      - Already done legacy task\n"
                "      - New legacy task\n"
            )
        with open(legacy_state, "w", encoding="utf-8") as fh:
            fh.write(
                "completed:\n"
                "  - repo: o/r\n"
                "    task: Already done legacy task\n"
                "    branch: task/already-abc\n"
                "    pr_url: https://x/0\n"
                "    date: '2026-05-01'\n"
            )
        loaded2 = load(legacy)
        check(loaded2["mode"] == "legacy", "legacy mode not detected")
        check(loaded2["state_path"] == legacy_state, "legacy state path not derived")
        check(loaded2["tasks"][0]["status"] == "done", "completed entry not merged from state")
        check(loaded2["tasks"][1]["status"] == "pending", "new legacy task not pending")
        check(
            loaded2["tasks"][1]["id"] == stable_id("o/r", "New legacy task"),
            "legacy task id not synthesized from (repo, description)",
        )
        record_outcome(
            legacy,
            mode="legacy",
            task_id=loaded2["tasks"][1]["id"],
            repo="o/r",
            description="New legacy task",
            status="done",
            completion={"branch": "task/new-leg-001", "pr_url": "https://x/2", "date": "2026-05-17"},
            state_path=legacy_state,
        )
        with open(legacy, "r", encoding="utf-8") as fh:
            tasks_after = yaml.safe_load(fh)
        remaining = (tasks_after.get("projects") or [{}])[0].get("tasks") or []
        check("New legacy task" not in remaining,
              "legacy: completed task should be removed from tasks file")
        check("Already done legacy task" in remaining,
              "legacy: untouched task should remain in tasks file")
        with open(legacy_state, "r", encoding="utf-8") as fh:
            state_after = yaml.safe_load(fh)
        check(len(state_after["completed"]) == 2, "legacy state file not appended to")

    if failures:
        for f in failures:
            print(f"FAIL: {f}", file=sys.stderr)
        return 1
    print("tasks_io self-test: OK")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="tasks_io.py")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_load = sub.add_parser("load", help="parse a tasks file and print normalized JSON")
    p_load.add_argument("tasks_path")
    p_load.add_argument("--state", default=None)
    p_load.set_defaults(func=_cmd_load)

    p_rec = sub.add_parser("record", help="write back a task outcome")
    p_rec.add_argument("tasks_path")
    p_rec.add_argument("--mode", choices=("unified", "legacy"), required=True)
    p_rec.add_argument("--task-id", required=True)
    p_rec.add_argument("--repo", required=True)
    p_rec.add_argument("--description", required=True)
    p_rec.add_argument("--status", choices=("done", "failed", "skipped"), required=True)
    p_rec.add_argument("--state", default=None)
    p_rec.add_argument("--completion-json", default=None)
    p_rec.set_defaults(func=_cmd_record)

    p_self = sub.add_parser("self-test", help="run internal smoke tests")
    p_self.set_defaults(func=_cmd_self_test)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
