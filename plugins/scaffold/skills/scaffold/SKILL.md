---
name: scaffold
description: >
  Generate a complete plugin skeleton (directory tree, plugin.json,
  phase-structured SKILL.md, evals.json with 3 placeholder cases, and
  optional agents/references) from a single prompt. Use when the user
  asks to "scaffold a plugin", "create a new skill", "generate a plugin
  skeleton", "bootstrap a skill", "start a new plugin", or anything
  about creating a fresh plugin in this marketplace. Arguments follow
  a key=value grammar — see the Investigation phase for the full
  syntax. The generator is idempotent: it refuses to overwrite an
  existing plugin directory unless the `force` flag is passed.
tools: Bash, Read, Write, Glob, Grep, TaskCreate, TaskUpdate
---

# Scaffold

Generate a new plugin skeleton in `plugins/<name>/` that compiles
straight away. The output passes `npm run build && npm test` without
edits, leaving the contributor only the actual content work
(filling in TODOs in `SKILL.md`, replacing placeholder evals).

**This skill writes files** — it creates a new plugin directory and
its contents. It never modifies any existing plugin.

The canonical template strings live in `references/templates.md`. Read
that file once at the start of the Implementation phase and use it as
the single source of truth. If the structure of a real plugin in this
repository changes, `references/templates.md` is what to update — never
hard-code template strings into this SKILL.md body.

---

## Task Tracking

Before doing any work, call `TaskCreate` for each phase below. Call
`TaskUpdate` (status `in_progress`) when you begin a phase and
`TaskUpdate` (status `completed`) when you finish it.

- Parse arguments
- Validate and check collisions
- Read template strings
- Write plugin files
- Print next-step checklist

---

## Phase 1: Parse arguments

The user invokes the skill with a single line of `key=value` pairs.
Every value is a single token unless surrounded by double quotes, in
which case spaces are allowed inside.

### Grammar

| Key           | Required | Format                                                                         | Example                                |
|---------------|----------|--------------------------------------------------------------------------------|----------------------------------------|
| `name`        | yes      | kebab-case — matches `^[a-z][a-z0-9-]*[a-z0-9]$`                               | `name=index-audit`                     |
| `description` | yes      | free text; quote with `"…"` if it contains spaces                              | `description="Audit database indexes"` |
| `category`    | no       | free-form string; defaults to `productivity`                                   | `category=code-quality`                |
| `agents`      | no       | comma-separated kebab-case slugs                                               | `agents=index-walker,index-fixer`      |
| `references`  | no       | comma-separated kebab-case slugs                                               | `references=postgres,mysql`            |
| `force`       | no       | bare flag or `force=true` — required to overwrite an existing plugin directory | `force`                                |

The recommended `category` values are `productivity`, `documentation`,
`code-quality`, `testing`, `security`, `performance`, `automation`,
`devops`, `development`, and `design`. The build doesn't enforce this
list (the field is a free-form string), but if the user supplies
something outside the list, mention this in the next-step checklist so
they can pick the closest fit.

### Parser

Run the parser with `python3` so the quoting + comma-splitting + flag
handling is unambiguous. The parser writes its result to a JSON file
in `/tmp` so subsequent phases can consume it without re-parsing.

```bash
python3 - <<'EOF'
import json, re, shlex, sys

# The user's invocation text — substitute this with what they actually said.
RAW = """<<USER_ARGS>>"""

allowed_keys = {"name", "description", "category", "agents", "references", "force"}
result = {"name": None, "description": None, "category": "productivity",
          "agents": [], "references": [], "force": False, "errors": [], "warnings": []}

try:
    tokens = shlex.split(RAW)
except ValueError as e:
    result["errors"].append(f"Could not parse arguments — {e}. Quote values with spaces in double quotes.")
    tokens = []

for tok in tokens:
    if tok == "force":
        result["force"] = True
        continue
    if "=" not in tok:
        result["errors"].append(f"Token '{tok}' is not key=value. Use key=value pairs only.")
        continue
    key, _, value = tok.partition("=")
    if key not in allowed_keys:
        result["errors"].append(f"Unknown key '{key}'. Allowed: {', '.join(sorted(allowed_keys))}.")
        continue
    if key == "force":
        result["force"] = value.lower() in {"1", "true", "yes"}
    elif key in {"agents", "references"}:
        result[key] = [s.strip() for s in value.split(",") if s.strip()]
    else:
        result[key] = value

# Validation
slug_re = re.compile(r"^[a-z][a-z0-9-]*[a-z0-9]$")
if not result["name"]:
    result["errors"].append("Missing required `name=<kebab-case>`.")
elif not slug_re.match(result["name"]):
    result["errors"].append(f"Name '{result['name']}' is not kebab-case (^[a-z][a-z0-9-]*[a-z0-9]$).")

if not result["description"]:
    result["errors"].append("Missing required `description=\"…\"`.")

for agent in result["agents"]:
    if not slug_re.match(agent):
        result["errors"].append(f"Agent slug '{agent}' is not kebab-case.")
for ref in result["references"]:
    if not slug_re.match(ref):
        result["errors"].append(f"Reference slug '{ref}' is not kebab-case.")

allowed_categories = {"productivity", "documentation", "code-quality", "testing",
                      "security", "performance", "automation", "devops",
                      "development", "design"}
if result["category"] not in allowed_categories:
    result["warnings"].append(
        f"Category '{result['category']}' is outside the recommended vocabulary "
        f"({', '.join(sorted(allowed_categories))}). The build accepts it, but "
        f"please pick the closest fit if there is one."
    )

with open("/tmp/scaffold-args.json", "w") as f:
    json.dump(result, f, indent=2)

print(json.dumps(result, indent=2))
EOF
```

If the parser writes any `errors`, stop and surface them to the user
verbatim — do not proceed to Phase 2. If there are only `warnings`,
surface them and continue.

---

## Phase 2: Validate and check collisions

Read the parsed args from `/tmp/scaffold-args.json` (or carry them in
context from Phase 1).

### 2.1 — Directory collision

```bash
NAME=$(python3 -c "import json; print(json.load(open('/tmp/scaffold-args.json'))['name'])")
FORCE=$(python3 -c "import json; print(json.load(open('/tmp/scaffold-args.json'))['force'])")
TARGET="plugins/$NAME"

if [ -e "$TARGET" ]; then
  if [ "$FORCE" = "True" ]; then
    echo "COLLISION_OVERRIDE: $TARGET exists and force=true was passed — proceeding to overwrite."
  else
    echo "COLLISION: $TARGET already exists. Re-run with the bare flag 'force' (e.g. 'scaffold name=... force') to overwrite."
    exit 1
  fi
else
  echo "OK: $TARGET does not exist — safe to create."
fi
```

If the collision check fails and `force` was not passed, stop and tell
the user. Suggest two options:

1. Pick a different `name`.
2. Re-run with `force` if they intend to overwrite.

Do **not** invent a different name yourself — let the user choose.

### 2.2 — Existing-plugin sanity check

Confirm there is at least one existing plugin in `plugins/` so we know
we're running in the right repo:

```bash
ls plugins/.claude-plugin 2>/dev/null
ls plugins/*/skills/*/SKILL.md 2>/dev/null | head -3
```

If `plugins/` is missing entirely, abort with a message explaining the
skill only runs inside the easier-life-skills marketplace repo.

---

## Phase 3: Read template strings

Read `references/templates.md` (relative to this skill — the path is
`plugins/scaffold/references/templates.md` from the repo root). Extract
each fenced code block following the headings `plugin.json`, `SKILL.md`,
`evals.json`, `agent.md`, and `reference.md`.

The template-extraction below uses a small Python helper so it works
regardless of whitespace inside the templates:

```bash
python3 - <<'EOF'
import re, json, pathlib

src = pathlib.Path("plugins/scaffold/references/templates.md").read_text()

# Match: a `## ` heading whose first inline-code token is the template id,
# followed by the first fenced block (any language tag) after it.
blocks = {}
heading_re = re.compile(r"^##\s+`([^`]+)`\s*$", re.M)
fence_re = re.compile(r"^```[^\n]*\n(.*?)^```\s*$", re.M | re.S)

positions = [(m.group(1), m.end()) for m in heading_re.finditer(src)]
for i, (name, start) in enumerate(positions):
    end = positions[i + 1][1] if i + 1 < len(positions) else len(src)
    section = src[start:end]
    m = fence_re.search(section)
    if m:
        blocks[name] = m.group(1).rstrip("\n")

required = ["plugin.json", "SKILL.md", "evals.json", "agent.md", "reference.md"]
missing = [t for t in required if t not in blocks]
if missing:
    raise SystemExit(f"templates.md is missing template(s): {missing}")

with open("/tmp/scaffold-templates.json", "w") as f:
    json.dump(blocks, f)
print("Loaded templates:", list(blocks.keys()))
EOF
```

If this step fails, do **not** fall back to inlined template strings —
the failure means `templates.md` is broken, and silently writing stale
templates would defeat the single-source-of-truth design. Surface the
error and stop.

---

## Phase 4: Write plugin files

Substitute the placeholders in each template, then use the `Write` tool
to create each file. For the `agents/` and `references/` directories,
loop once per requested slug.

### Substitutions

| Placeholder         | Source                                                                                |
|---------------------|---------------------------------------------------------------------------------------|
| `{{NAME}}`          | parsed `name`                                                                         |
| `{{DESCRIPTION}}`   | parsed `description` (escape `"` for JSON contexts)                                   |
| `{{CATEGORY}}`      | parsed `category`                                                                     |
| `{{TITLE}}`         | Title Case of `name` (e.g. `index-audit` → `Index Audit`)                             |
| `{{SKILLS_BLOCK}}`  | always `["./skills/<name>"]` — pre-rendered in the plugin.json template               |
| `{{AGENTS_BLOCK}}`  | empty string if no agents; otherwise `,\n  "agents": ["./agents/a", "./agents/b"]`    |
| `{{AGENT_NAME}}`    | each agent slug (per-file)                                                            |
| `{{PARENT_NAME}}`   | parsed `name` (used inside `agent.md`)                                                |
| `{{TOPIC}}`         | each reference slug (per-file)                                                        |
| `{{TOPIC_TITLE}}`   | Title Case of the reference slug                                                      |

Helper for `Title Case`:

```python
def title_case(slug: str) -> str:
    return " ".join(p.capitalize() for p in slug.split("-"))
```

### Files to write

1. `plugins/<name>/.claude-plugin/plugin.json` — from the `plugin.json` template.
2. `plugins/<name>/skills/<name>/SKILL.md` — from the `SKILL.md` template.
3. `plugins/<name>/skills/<name>/evals/evals.json` — from the `evals.json` template.
4. For each agent slug `a` in `agents`:
   `plugins/<name>/agents/<a>.md` — from the `agent.md` template.
5. For each reference slug `t` in `references`:
   `plugins/<name>/references/<t>.md` — from the `reference.md` template.

Use the `Write` tool for every file. Do not pipe content through `cat`
or `echo` — the tool is the right granularity and is reviewable.

If `force` was passed and the target directory already existed, you may
overwrite existing files; do **not** delete files that exist in the old
directory but aren't in the new template — leave them in place and warn
in the checklist.

---

## Phase 5: Print next-step checklist

After all files are written, print exactly the report format below.
Substitute concrete paths and numbers; keep the section ordering.

### Report format

```
## Scaffold — Done

✓ Plugin scaffolded at plugins/<name>/

Files written:
  - plugins/<name>/.claude-plugin/plugin.json
  - plugins/<name>/skills/<name>/SKILL.md
  - plugins/<name>/skills/<name>/evals/evals.json
  - plugins/<name>/agents/<a>.md             (one line per agent, omit section if none)
  - plugins/<name>/references/<t>.md         (one line per reference, omit section if none)

Next steps:
  1. Fill in the TODOs in plugins/<name>/skills/<name>/SKILL.md.
  2. Replace the placeholder evals in plugins/<name>/skills/<name>/evals/evals.json
     with at least 3 realistic scenarios (happy path + edge case + idempotent re-run).
  3. Run: npm run build && npm test
  4. Add a `### Added` entry to CHANGELOG.md.
  5. Add the new plugin to the "Current Plugins" table in .claude/CLAUDE.md
     and the README.md plugin table.

{Warnings (optional section):
  - <warning text from Phase 1, e.g. category outside recommended vocabulary>
  - <warning if force overwrote an existing directory>
}
```

If `force` overwrote an existing directory, include a line under
Warnings stating which directory was overwritten and remind the user
that no files were deleted — old files still on disk may need manual
cleanup.

### Do **not**:

- Run `npm run build` or `npm test` for the user — surface the commands
  in the checklist instead. Running them blindly could mask issues the
  user wants to see in their own terminal.
- Modify `CHANGELOG.md`, `README.md`, or `.claude/CLAUDE.md` automatically.
  Those updates are part of the user's normal PR workflow and depend on
  decisions the scaffold can't make (which section, which order, etc.).
- Suggest a different `name` if the collision check fails. The user
  picks the name; the scaffold only obeys.
