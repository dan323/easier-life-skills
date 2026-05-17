#!/usr/bin/env python3
"""gh-project-sync — reconciler between a GitHub Project (v2) board
and a task-agent unified `tasks.yml`.

Subcommands:

    gh_project_sync.py sync --args-raw "<USER_ARGS>" [--dry-run]
    gh_project_sync.py self-test

`sync` is the only subcommand the SKILL invokes. It:

    1. Parses the `key=value` arguments string.
    2. Calls `gh project field-list/view/item-list` to read the board.
    3. Resolves the Status field and the column option ids
       (`In Review → In Progress` fallback when not overridden).
    4. Loads the tasks.yml.
    5. Computes the reconciliation plan against the four rules.
    6. Applies the plan: yml first, then board mutations.

`self-test` exercises the pure logic (arg parser, column resolver,
yml loader, plan computer, yml writer) against in-memory fixtures —
no `gh` calls, no network. Exits non-zero on any failure.

The four reconciliation rules:

    Card status      | yml entry                | Action
    -----------------|--------------------------|------------------------------------------
    Todo             | missing                  | add to yml (`status: pending`)
    Won't Do         | present                  | drop from yml
    Done             | present                  | drop from yml
    NOT in           | `status: done` + pr_url  | move card → In Review, post PR link
    {In Review,
     Done, Won't Do} |                          |
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
from typing import Any

try:
    import yaml
except ImportError:
    sys.stderr.write("gh_project_sync.py needs PyYAML (pip install pyyaml)\n")
    sys.exit(2)


# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------


_VALID_KEYS = {
    "tasks", "project_url", "project_owner", "project_number",
    "default_repo",
    "todo_column", "in_review_column", "done_column", "wont_do_column",
}


def parse_args_raw(raw: str) -> dict:
    """Parse the `key=value` arg string into a config dict.

    Returns a dict with an `errors` list — callers should check it
    before using the rest of the fields.
    """
    result: dict[str, Any] = {
        "tasks_path": None,
        "project_owner": None,
        "project_number": None,
        "project_url": None,
        "default_repo": None,
        # `in_review` is left None on default — Phase "resolve columns"
        # treats None as "try In Review then In Progress".
        "columns": {"todo": "Todo", "in_review": None, "done": "Done", "wont_do": "Won't Do"},
        "in_review_explicit": False,
        "errors": [],
    }

    try:
        tokens = shlex.split(raw)
    except ValueError as exc:
        result["errors"].append(f"Could not parse arguments — {exc}.")
        tokens = []

    for tok in tokens:
        if "=" not in tok:
            result["errors"].append(f"Unexpected positional `{tok}` (use key=value).")
            continue
        k, _, v = tok.partition("=")
        if k not in _VALID_KEYS:
            result["errors"].append(f"Unknown argument `{k}`. Known: {sorted(_VALID_KEYS)}.")
            continue
        if k == "tasks":
            result["tasks_path"] = v
        elif k == "project_url":
            result["project_url"] = v
        elif k == "project_owner":
            result["project_owner"] = v
        elif k == "project_number":
            try:
                result["project_number"] = int(v)
            except ValueError:
                result["errors"].append(f"project_number must be an int, got `{v}`.")
        elif k == "default_repo":
            result["default_repo"] = v
        elif k == "todo_column":
            result["columns"]["todo"] = v
        elif k == "in_review_column":
            result["columns"]["in_review"] = v
            result["in_review_explicit"] = True
        elif k == "done_column":
            result["columns"]["done"] = v
        elif k == "wont_do_column":
            result["columns"]["wont_do"] = v

    m = re.match(
        r"https?://github\.com/(?:users|orgs)/([^/]+)/projects/(\d+)/?",
        result["project_url"] or "",
    )
    if m:
        result["project_owner"] = result["project_owner"] or m.group(1)
        result["project_number"] = result["project_number"] or int(m.group(2))

    if not result["tasks_path"]:
        result["errors"].append("Missing `tasks=<path>`.")
    if not result["project_owner"] or not result["project_number"]:
        result["errors"].append(
            "Need either `project_url=<url>` or `project_owner=<o> project_number=<n>`."
        )
    if result["default_repo"] and "/" not in result["default_repo"]:
        result["errors"].append(
            f"default_repo must look like `owner/name`, got `{result['default_repo']}`."
        )

    return result


# ---------------------------------------------------------------------------
# Column resolution
# ---------------------------------------------------------------------------


def resolve_columns(args: dict, fields: list[dict]) -> dict:
    """Find the Status field and the option dicts for each role.

    Raises ValueError with a user-facing message on any miss.
    Returns `{"status_field_id": str, "options": {role: option_dict}}`.
    """
    status_field = next(
        (f for f in fields if (f.get("name") or "").lower() == "status"),
        None,
    )
    if not status_field or "options" not in status_field:
        raise ValueError("Board has no `Status` single-select field — cannot reconcile.")

    in_review_explicit = args.get("in_review_explicit", False)
    in_review_candidates: list[str]
    if in_review_explicit and args["columns"]["in_review"]:
        in_review_candidates = [args["columns"]["in_review"]]
    else:
        # Default chain: prefer the explicit "awaiting human merge"
        # column, fall back to "In Progress" for boards using the
        # default GitHub template.
        in_review_candidates = ["In Review", "In Progress"]

    candidates = {
        "todo":      [args["columns"]["todo"]],
        "in_review": in_review_candidates,
        "done":      [args["columns"]["done"]],
        "wont_do":   [args["columns"]["wont_do"]],
    }

    opt_by_name_lc = {(opt.get("name") or "").lower(): opt for opt in status_field["options"]}
    opt_by_role: dict[str, dict] = {}
    for role, names in candidates.items():
        for name in names:
            if name and name.lower() in opt_by_name_lc:
                opt_by_role[role] = opt_by_name_lc[name.lower()]
                break

    missing = [r for r in ("todo", "in_review", "done", "wont_do") if r not in opt_by_role]
    if missing:
        msg = [f"Status column(s) not found on board: {missing}."]
        if "in_review" in missing and not in_review_explicit:
            msg.append("Tried both 'In Review' and 'In Progress' for the review column.")
        msg.append(
            "Override with todo_column= / in_review_column= / done_column= / wont_do_column=."
        )
        raise ValueError(" ".join(msg))

    return {"status_field_id": status_field["id"], "options": opt_by_role}


# ---------------------------------------------------------------------------
# tasks.yml IO
# ---------------------------------------------------------------------------


def load_yml(path: str) -> dict:
    """Read tasks.yml, refuse legacy format, return `{cfg, by_ref}`.

    Raises ValueError if the file is in legacy two-file format.
    """
    try:
        cfg = yaml.safe_load(open(path, "r", encoding="utf-8")) or {}
    except FileNotFoundError:
        cfg = {"projects": []}

    has_status = False
    for proj in cfg.get("projects") or []:
        for t in proj.get("tasks") or []:
            if isinstance(t, dict) and "status" in t:
                has_status = True
                break

    if (cfg.get("projects") or []) and not has_status:
        raise ValueError(
            "tasks.yml looks like legacy two-file format. "
            "Upgrade to unified mode (entries with `status:`) before running gh-project-sync."
        )

    by_ref: dict[str, dict] = {}
    for proj in cfg.get("projects") or []:
        repo = proj.get("repo")
        for t in proj.get("tasks") or []:
            if isinstance(t, dict) and t.get("external_ref"):
                by_ref[t["external_ref"]] = {"repo": repo, **t}

    return {"cfg": cfg, "by_ref": by_ref}


def write_yml(path: str, cfg: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(cfg, f, default_flow_style=False, allow_unicode=True, sort_keys=False)


# ---------------------------------------------------------------------------
# Plan computation
# ---------------------------------------------------------------------------


def _card_repo(item: dict, default_repo: str | None) -> str | None:
    """Best-effort repo extraction from a project item."""
    c = item.get("content") or {}
    if c.get("type") in ("Issue", "PullRequest"):
        repo = c.get("repository")
        if isinstance(repo, str) and "/" in repo:
            return repo
        # `gh` sometimes returns a structured repository.
        if isinstance(repo, dict):
            owner = (repo.get("owner") or {}).get("login") or repo.get("owner")
            name = repo.get("name")
            if owner and name:
                return f"{owner}/{name}"
        owner = (c.get("repositoryOwner") or {}).get("login")
        name = c.get("repositoryName")
        if owner and name:
            return f"{owner}/{name}"
    return default_repo


def _card_description(item: dict) -> str:
    c = item.get("content") or {}
    title = item.get("title") or c.get("title") or ""
    return title.strip() or "(untitled card)"


def _card_issue_closed(item: dict) -> bool:
    c = item.get("content") or {}
    return (
        c.get("type") in ("Issue", "PullRequest")
        and (c.get("state") or "").upper() == "CLOSED"
    )


def stable_id(repo: str, description: str) -> str:
    return hashlib.md5(f"{repo}\n{description}".encode()).hexdigest()[:6]


def compute_plan(args: dict, columns: dict, items: list[dict], by_ref: dict) -> dict:
    """Three-way diff between board items and yml entries."""
    column_name = {role: (opt.get("name") or "").lower() for role, opt in columns.items()}

    actions: dict[str, list] = {
        "add_to_yml":        [],
        "drop_from_yml":     [],
        "move_to_in_review": [],
        "skipped":           [],
    }

    cards_by_ref = {it["id"]: it for it in items}

    # Rule 1: Todo cards with no yml entry → add.
    for it in items:
        status = (it.get("status") or "").lower()
        if status != column_name["todo"]:
            continue
        if it["id"] in by_ref:
            continue
        if _card_issue_closed(it):
            actions["skipped"].append({"item_id": it["id"], "reason": "linked issue is closed"})
            continue
        repo = _card_repo(it, args.get("default_repo"))
        if not repo:
            actions["skipped"].append({
                "item_id": it["id"],
                "reason": "draft card has no repo and no default_repo set",
            })
            continue
        desc = _card_description(it)
        actions["add_to_yml"].append({
            "item_id": it["id"],
            "repo": repo,
            "description": desc,
            "id": stable_id(repo, desc),
        })

    # Rules 2 + 3: card in Won't Do or Done → drop yml entry.
    for ref, entry in by_ref.items():
        it = cards_by_ref.get(ref)
        if not it:
            actions["drop_from_yml"].append({
                "external_ref": ref, "reason": "card no longer exists"
            })
            continue
        status = (it.get("status") or "").lower()
        if status == column_name["wont_do"]:
            actions["drop_from_yml"].append({
                "external_ref": ref, "reason": "card moved to Won't Do"
            })
        elif status == column_name["done"]:
            actions["drop_from_yml"].append({
                "external_ref": ref, "reason": "card already Done"
            })

    # Rule 4: yml status=done + pr_url, card not yet In Review/Done/Won't Do
    # → move card to In Review and post PR link.
    terminal = {column_name["in_review"], column_name["done"], column_name["wont_do"]}
    for ref, entry in by_ref.items():
        it = cards_by_ref.get(ref)
        if not it:
            continue
        if entry.get("status") != "done" or not entry.get("pr_url"):
            continue
        status = (it.get("status") or "").lower()
        if status in terminal:
            continue
        content = it.get("content") or {}
        actions["move_to_in_review"].append({
            "item_id":         it["id"],
            "pr_url":          entry["pr_url"],
            "content_type":    content.get("type") or "DraftIssue",
            "content_number":  content.get("number"),
            "content_repo":    _card_repo(it, args.get("default_repo")),
        })

    return actions


# ---------------------------------------------------------------------------
# Apply yml changes
# ---------------------------------------------------------------------------


def apply_yml_plan(cfg: dict, plan: dict) -> dict:
    """Return a mutated copy of cfg with the plan's yml actions applied.

    Operations are idempotent: re-running with the same plan against
    the already-mutated cfg is a no-op.
    """
    new_cfg = json.loads(json.dumps(cfg))  # deep-ish clone (yaml-safe scalars)
    new_cfg.setdefault("projects", [])

    drop_refs = {a["external_ref"] for a in plan["drop_from_yml"]}
    for proj in new_cfg["projects"]:
        proj["tasks"] = [
            t for t in (proj.get("tasks") or [])
            if not (isinstance(t, dict) and t.get("external_ref") in drop_refs)
        ]
    new_cfg["projects"] = [p for p in new_cfg["projects"] if p.get("tasks")]

    proj_by_repo = {p.get("repo"): p for p in new_cfg["projects"]}
    for add in plan["add_to_yml"]:
        proj = proj_by_repo.get(add["repo"])
        if proj is None:
            proj = {"repo": add["repo"], "tasks": []}
            new_cfg["projects"].append(proj)
            proj_by_repo[add["repo"]] = proj
        if any(
            isinstance(t, dict) and t.get("external_ref") == add["item_id"]
            for t in proj["tasks"]
        ):
            continue
        proj["tasks"].append({
            "id": add["id"],
            "description": add["description"],
            "status": "pending",
            "external_ref": add["item_id"],
        })

    return new_cfg


# ---------------------------------------------------------------------------
# Apply board changes (touches the network)
# ---------------------------------------------------------------------------


def _gh(*argv: str, capture: bool = False) -> str:
    """Shell out to `gh`. Returns stdout when capture=True."""
    res = subprocess.run(
        ["gh", *argv],
        check=True,
        text=True,
        capture_output=capture,
    )
    return res.stdout if capture else ""


def apply_board_plan(project_id: str, status_field_id: str, in_review_option_id: str,
                     plan: dict) -> list[dict]:
    """Apply move-to-In-Review actions on the live board.

    Returns a list of `{item_id, status: "ok" | "error", error?: str}`.
    """
    results = []
    for mv in plan["move_to_in_review"]:
        try:
            _gh(
                "project", "item-edit",
                "--project-id", project_id,
                "--id", mv["item_id"],
                "--field-id", status_field_id,
                "--single-select-option-id", in_review_option_id,
            )
            note = f"PR open for review — {mv['pr_url']}"

            if mv["content_type"] in ("Issue", "PullRequest") and mv["content_number"]:
                # Comment on the linked issue/PR only if no existing
                # comment already mentions this PR url.
                out = _gh(
                    "issue", "view", str(mv["content_number"]),
                    "--repo", mv["content_repo"],
                    "--json", "comments",
                    capture=True,
                )
                existing = json.loads(out).get("comments") or []
                if not any(mv["pr_url"] in (c.get("body") or "") for c in existing):
                    _gh(
                        "issue", "comment", str(mv["content_number"]),
                        "--repo", mv["content_repo"],
                        "--body", note,
                    )
            else:
                # Draft item — append PR link to body via GraphQL.
                q = _gh(
                    "api", "graphql",
                    "-f", (
                        "query=query($id: ID!) { "
                        "  node(id: $id) { ... on ProjectV2Item { "
                        "    content { ... on DraftIssue { id body } } } } }"
                    ),
                    "-F", f"id={mv['item_id']}",
                    capture=True,
                )
                data = json.loads(q)
                di = (((data.get("data") or {}).get("node") or {}).get("content")) or {}
                di_id = di.get("id")
                body = di.get("body") or ""
                if di_id and mv["pr_url"] not in body:
                    new_body = (body.rstrip() + "\n\n" + note).lstrip()
                    _gh(
                        "api", "graphql",
                        "-f", (
                            "query=mutation($id: ID!, $body: String!) { "
                            "  updateProjectV2DraftIssue(input: "
                            "    {draftIssueId: $id, body: $body}) "
                            "  { draftIssue { id } } }"
                        ),
                        "-F", f"id={di_id}",
                        "-F", f"body={new_body}",
                    )
            results.append({"item_id": mv["item_id"], "status": "ok"})
        except subprocess.CalledProcessError as exc:
            results.append({
                "item_id": mv["item_id"],
                "status": "error",
                "error": str(exc),
            })
    return results


# ---------------------------------------------------------------------------
# Orchestration — the `sync` subcommand
# ---------------------------------------------------------------------------


def _format_report(args: dict, plan: dict, board_results: list[dict] | None) -> str:
    lines = [f"## gh-project-sync — {args['project_owner']}/projects/{args['project_number']}",
             "", f"tasks file: {args['tasks_path']}", ""]
    lines.append(f"  Added to tasks.yml:        {len(plan['add_to_yml'])}")
    for a in plan["add_to_yml"]:
        lines.append(f"    - {a['repo']} {a['id']} \"{a['description']}\" (item {a['item_id']})")
    lines.append(f"  Dropped from tasks.yml:    {len(plan['drop_from_yml'])}")
    for d in plan["drop_from_yml"]:
        lines.append(f"    - {d['external_ref']} — {d['reason']}")
    lines.append(f"  Cards moved to In Review:  {len(plan['move_to_in_review'])}")
    for m in plan["move_to_in_review"]:
        lines.append(f"    - {m['item_id']} ← {m['pr_url']}")
    if plan["skipped"]:
        lines.append(f"  Skipped:                   {len(plan['skipped'])}")
        for s in plan["skipped"]:
            lines.append(f"    - {s['item_id']} — {s['reason']}")
    if board_results is not None:
        errors = [r for r in board_results if r["status"] != "ok"]
        if errors:
            lines.append("")
            lines.append(f"  Board mutation errors:    {len(errors)}")
            for e in errors:
                lines.append(f"    - {e['item_id']}: {e.get('error', 'unknown')}")
    return "\n".join(lines)


def sync(raw: str, dry_run: bool = False) -> int:
    args = parse_args_raw(raw)
    if args["errors"]:
        for e in args["errors"]:
            print(f"ERROR: {e}", file=sys.stderr)
        return 1

    owner = args["project_owner"]
    number = str(args["project_number"])

    try:
        fields_json = _gh("project", "field-list", number,
                          "--owner", owner, "--format", "json", capture=True)
        proj_json   = _gh("project", "view", number,
                          "--owner", owner, "--format", "json", capture=True)
        items_json  = _gh("project", "item-list", number,
                          "--owner", owner, "--limit", "1000", "--format", "json",
                          capture=True)
    except subprocess.CalledProcessError as exc:
        print(f"ERROR: gh call failed — {exc}", file=sys.stderr)
        return 2

    fields = json.loads(fields_json).get("fields", [])
    proj   = json.loads(proj_json)
    items  = json.loads(items_json).get("items", [])

    try:
        columns = resolve_columns(args, fields)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    try:
        yml = load_yml(args["tasks_path"])
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    plan = compute_plan(args, columns["options"], items, yml["by_ref"])

    empty = (
        not plan["add_to_yml"]
        and not plan["drop_from_yml"]
        and not plan["move_to_in_review"]
    )
    if empty and not plan["skipped"]:
        print("Already in sync.")
        return 0

    print(_format_report(args, plan, None))
    if dry_run:
        print("\n(dry-run — no mutations applied.)")
        return 0

    new_cfg = apply_yml_plan(yml["cfg"], plan)
    write_yml(args["tasks_path"], new_cfg)

    board_results = apply_board_plan(
        project_id=proj["id"],
        status_field_id=columns["status_field_id"],
        in_review_option_id=columns["options"]["in_review"]["id"],
        plan=plan,
    )

    print()
    print(_format_report(args, plan, board_results))
    return 0 if all(r["status"] == "ok" for r in board_results) else 3


# ---------------------------------------------------------------------------
# Self-test
# ---------------------------------------------------------------------------


def _self_test() -> int:  # noqa: C901 — single-purpose test runner
    failures: list[str] = []

    def check(cond: bool, msg: str) -> None:
        if not cond:
            failures.append(msg)

    # ---- parse_args_raw ----
    a = parse_args_raw("tasks=tasks.yml project_url=https://github.com/users/acme/projects/7")
    check(a["tasks_path"] == "tasks.yml", "tasks_path not parsed")
    check(a["project_owner"] == "acme" and a["project_number"] == 7,
          "project_url not split into owner+number")
    check(not a["errors"], f"unexpected errors: {a['errors']}")
    check(a["columns"]["in_review"] is None and not a["in_review_explicit"],
          "in_review must default to None (fallback chain)")

    a2 = parse_args_raw("tasks=t.yml project_owner=acme project_number=7 in_review_column=Reviewing")
    check(a2["in_review_explicit"] and a2["columns"]["in_review"] == "Reviewing",
          "explicit in_review_column not recorded")

    a3 = parse_args_raw("tasks=t.yml")
    check(any("project_url" in e for e in a3["errors"]),
          "missing project args must surface as error")

    # ---- resolve_columns ----
    fields_default = [{
        "name": "Status",
        "id": "PVTSSF_1",
        "options": [
            {"id": "opt_todo",        "name": "Todo"},
            {"id": "opt_in_progress", "name": "In Progress"},
            {"id": "opt_done",        "name": "Done"},
            {"id": "opt_wont",        "name": "Won't Do"},
        ],
    }]
    cols = resolve_columns(a, fields_default)
    check(cols["options"]["in_review"]["id"] == "opt_in_progress",
          "fallback to In Progress when no In Review column")

    fields_both = [{
        "name": "Status",
        "id": "PVTSSF_1",
        "options": [
            {"id": "opt_todo",      "name": "Todo"},
            {"id": "opt_in_prog",   "name": "In Progress"},
            {"id": "opt_in_review", "name": "In Review"},
            {"id": "opt_done",      "name": "Done"},
            {"id": "opt_wont",      "name": "Won't Do"},
        ],
    }]
    cols2 = resolve_columns(a, fields_both)
    check(cols2["options"]["in_review"]["id"] == "opt_in_review",
          "In Review must be preferred when both columns exist")

    try:
        resolve_columns(a, [{"name": "Status", "id": "x", "options": [
            {"id": "t", "name": "Todo"}, {"id": "d", "name": "Done"},
            {"id": "w", "name": "Won't Do"},
        ]}])
        check(False, "should have failed: no In Review and no In Progress")
    except ValueError:
        pass

    # ---- load_yml + plan + apply_yml ----
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "tasks.yml")
        with open(path, "w", encoding="utf-8") as f:
            f.write(
                "projects:\n"
                "  - repo: acme/api\n"
                "    tasks:\n"
                "      - id: keep\n"
                "        description: In progress task\n"
                "        status: done\n"
                "        external_ref: PVTI_inprog\n"
                "        pr_url: https://example/1\n"
                "      - id: drop1\n"
                "        description: Already done\n"
                "        status: pending\n"
                "        external_ref: PVTI_done\n"
                "      - id: drop2\n"
                "        description: Cancelled\n"
                "        status: pending\n"
                "        external_ref: PVTI_wont\n"
            )
        loaded = load_yml(path)
        check(set(loaded["by_ref"]) == {"PVTI_inprog", "PVTI_done", "PVTI_wont"},
              "by_ref not built correctly")

        items = [
            # A new Todo card (no yml entry) — should be added.
            {"id": "PVTI_new", "status": "Todo", "title": "Brand new",
             "content": {"type": "Issue", "number": 42,
                         "repository": "acme/api", "state": "OPEN"}},
            # The "In Progress" card with yml status=done + pr_url —
            # under the broadened rule, should move to In Review.
            {"id": "PVTI_inprog", "status": "In Progress",
             "content": {"type": "Issue", "number": 1,
                         "repository": "acme/api", "state": "OPEN"}},
            # A card moved to Won't Do — its yml entry should be dropped.
            {"id": "PVTI_wont", "status": "Won't Do",
             "content": {"type": "DraftIssue"}},
            # A card already Done — drop too.
            {"id": "PVTI_done", "status": "Done",
             "content": {"type": "DraftIssue"}},
        ]

        plan = compute_plan(a, cols2["options"], items, loaded["by_ref"])
        check(len(plan["add_to_yml"]) == 1 and plan["add_to_yml"][0]["item_id"] == "PVTI_new",
              "Todo card not added")
        dropped_refs = {d["external_ref"] for d in plan["drop_from_yml"]}
        check(dropped_refs == {"PVTI_wont", "PVTI_done"},
              f"unexpected drops: {dropped_refs}")
        moved_ids = {m["item_id"] for m in plan["move_to_in_review"]}
        check(moved_ids == {"PVTI_inprog"},
              "In Progress card with status=done+pr_url must move to In Review")

        new_cfg = apply_yml_plan(loaded["cfg"], plan)
        write_yml(path, new_cfg)
        reloaded = load_yml(path)
        refs_after = set(reloaded["by_ref"])
        check("PVTI_new" in refs_after and "PVTI_inprog" in refs_after,
              "added entry and surviving entry must be present after rewrite")
        check("PVTI_wont" not in refs_after and "PVTI_done" not in refs_after,
              "dropped entries must be absent after rewrite")

        # Idempotence: applying the same plan again is a no-op.
        new_cfg_2 = apply_yml_plan(new_cfg, plan)
        check(new_cfg == new_cfg_2, "apply_yml_plan must be idempotent")

    # ---- compute_plan: card already in In Review must be left alone. ----
    a4 = parse_args_raw("tasks=t.yml project_owner=acme project_number=7")
    items_terminal = [
        {"id": "PVTI_review", "status": "In Review",
         "content": {"type": "Issue", "number": 1,
                     "repository": "acme/api", "state": "OPEN"}},
    ]
    by_ref_terminal = {"PVTI_review": {
        "repo": "acme/api", "id": "abc",
        "description": "x", "status": "done", "external_ref": "PVTI_review",
        "pr_url": "https://x/9",
    }}
    plan2 = compute_plan(a4, cols2["options"], items_terminal, by_ref_terminal)
    check(not plan2["move_to_in_review"],
          "card already in In Review must not be re-moved")

    # ---- Legacy mode refusal ----
    with tempfile.TemporaryDirectory() as tmp:
        legacy = os.path.join(tmp, "tasks.yml")
        with open(legacy, "w", encoding="utf-8") as f:
            f.write("projects:\n  - repo: acme/api\n    tasks:\n      - A bare string\n")
        try:
            load_yml(legacy)
            check(False, "legacy file must be rejected")
        except ValueError as exc:
            check("legacy" in str(exc).lower(),
                  f"refusal message should mention legacy: {exc}")

    if failures:
        for f in failures:
            print(f"FAIL: {f}", file=sys.stderr)
        return 1
    print("gh_project_sync self-test: OK")
    return 0


# ---------------------------------------------------------------------------
# CLI entry
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="gh_project_sync.py")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_sync = sub.add_parser("sync", help="run the reconciler end-to-end")
    p_sync.add_argument("--args-raw", required=True,
                        help="raw key=value argument string from the skill caller")
    p_sync.add_argument("--dry-run", action="store_true",
                        help="compute and print the plan but do not mutate yml or board")

    sub.add_parser("self-test", help="exercise the pure logic against in-memory fixtures")

    ns = parser.parse_args(argv)
    if ns.cmd == "sync":
        return sync(ns.args_raw, dry_run=ns.dry_run)
    if ns.cmd == "self-test":
        return _self_test()
    parser.error(f"unknown subcommand {ns.cmd}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
