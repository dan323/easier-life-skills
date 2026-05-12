# Scaffold Templates

This file is the **single source of truth** for the template strings produced
by the `scaffold` skill. When the structure of a real plugin changes in this
repository, update this file in the same PR so newly scaffolded plugins stay
in sync.

The skill body never inlines template strings — it reads them from here. Each
template is given as a fenced code block tagged with a stable id (the heading
slug) so the skill's Implementation phase can extract it deterministically.

---

## `plugin.json`

Used at: `plugins/<name>/.claude-plugin/plugin.json`.

Substitute: `{{NAME}}`, `{{DESCRIPTION}}`, `{{CATEGORY}}`, `{{SKILLS_BLOCK}}`,
`{{AGENTS_BLOCK}}` (the last two are pre-rendered JSON fragments — when no
agents are requested, `{{AGENTS_BLOCK}}` is the empty string and the trailing
comma after `category` is omitted).

```json
{
  "name": "{{NAME}}",
  "description": "{{DESCRIPTION}}",
  "author": { "name": "dan323" },
  "category": "{{CATEGORY}}",
  "skills": ["./skills/{{NAME}}"]{{AGENTS_BLOCK}}
}
```

When the user passes `agents=a,b`, `{{AGENTS_BLOCK}}` becomes:

```text
,
  "agents": ["./agents/a", "./agents/b"]
```

Otherwise `{{AGENTS_BLOCK}}` is the empty string.

---

## `SKILL.md`

Used at: `plugins/<name>/skills/<name>/SKILL.md`.

Substitute: `{{NAME}}`, `{{DESCRIPTION}}`, `{{TITLE}}` (Title Case of the
name, e.g. `find-skills` → `Find Skills`).

```markdown
---
name: {{NAME}}
description: >
  {{DESCRIPTION}}
  TODO: expand this paragraph with the user phrases that should trigger the
  skill (e.g. "find unused code", "audit my logs"). The description is the
  primary matching signal Claude uses, so make it specific.
tools: Bash, Read, Grep, TaskCreate, TaskUpdate
---

# {{TITLE}}

TODO: one-paragraph summary of what this skill does and the value it
delivers. Be concrete — name the artefact it produces or the change it makes.

**This skill is TODO: read-only / mutating.** TODO: describe what it touches.

---

## Task Tracking

Before doing any work, call `TaskCreate` for each phase below. Call
`TaskUpdate` (status `in_progress`) when you begin a phase and `TaskUpdate`
(status `completed`) when you finish it.

- TODO: Phase 1 short name
- TODO: Phase 2 short name
- TODO: Phase 3 short name

---

## Phase 1: TODO

TODO: replace with the first investigation step. Include the bash commands
the agent should run — don't ask it to guess.

```bash
# TODO: example data-gathering command
```

---

## Phase 2: TODO

TODO: replace with the implementation step.

---

## Phase 3: TODO

TODO: replace with the verification / report step. Define the output format
explicitly — show a concrete example below.

### Output format

```
TODO: concrete example of what the report or file should look like.
```
```

---

## `evals.json`

Used at: `plugins/<name>/skills/<name>/evals/evals.json`.

Substitute: `{{NAME}}`.

```json
{
  "skill_name": "{{NAME}}",
  "evals": [
    {
      "id": 0,
      "prompt": "TODO: a realistic user prompt that should trigger this skill",
      "description": "TODO: one or two sentences describing the test scenario and why it is interesting",
      "setup": "mkdir -p /tmp/eval-{{NAME}}-0 && cd /tmp/eval-{{NAME}}-0 && git init && echo 'TODO: write files that simulate a realistic project for this skill' > README.md && git add . && git commit -m 'init'",
      "expected_output": "TODO: plain-English description of what the skill must produce for this scenario",
      "files": [],
      "assertions": [
        {
          "id": "todo-assertion-1",
          "text": "TODO: an objectively verifiable claim about the skill's output"
        },
        {
          "id": "todo-assertion-2",
          "text": "TODO: a second, discriminating claim"
        }
      ]
    },
    {
      "id": 1,
      "prompt": "TODO: a second realistic prompt (consider an edge case)",
      "description": "TODO: describe the edge case",
      "setup": "mkdir -p /tmp/eval-{{NAME}}-1 && cd /tmp/eval-{{NAME}}-1 && git init && echo 'TODO' > README.md && git add . && git commit -m 'init'",
      "expected_output": "TODO",
      "files": [],
      "assertions": [
        {
          "id": "todo-edge-case",
          "text": "TODO"
        }
      ]
    },
    {
      "id": 2,
      "prompt": "TODO: a third prompt — consider idempotent re-run or a degenerate case",
      "description": "TODO",
      "setup": "mkdir -p /tmp/eval-{{NAME}}-2 && cd /tmp/eval-{{NAME}}-2 && git init && echo 'TODO' > README.md && git add . && git commit -m 'init'",
      "expected_output": "TODO",
      "files": [],
      "assertions": [
        {
          "id": "todo-idempotent",
          "text": "TODO"
        }
      ]
    }
  ]
}
```

---

## `agent.md`

Used at: `plugins/<name>/agents/<agent-name>.md`. Written once per requested agent.

Substitute: `{{AGENT_NAME}}`, `{{PARENT_NAME}}` (the plugin's name).

```markdown
---
name: {{AGENT_NAME}}
description: TODO: one sentence describing what this sub-agent does and when {{PARENT_NAME}} should spawn it.
tools: Bash, Read, Edit, Grep
---

You are TODO: a one-sentence role description.

**Context (substituted by the caller):**
- TODO: list the variables the parent skill will fill in (e.g. `REPO`, `BRANCH`, `LOCAL_PATH`).

## Step 1 — TODO

TODO: first concrete action this agent takes. Be specific about which tool calls and which inputs.

## Step 2 — TODO

TODO: second action.

## Step 3 — Report

Print a brief summary:

```
## {{AGENT_NAME}} — Done

TODO: bullet points the parent skill can parse or surface to the user.
```
```

---

## `reference.md`

Used at: `plugins/<name>/references/<topic>.md`. Written once per requested
reference topic.

Substitute: `{{TOPIC}}` (the topic slug), `{{TOPIC_TITLE}}` (Title Case).

```markdown
# {{TOPIC_TITLE}}

TODO: concise, non-obvious notes the skill needs at runtime. Keep this minimal
— do not document things any LLM already knows. Useful kinds of content:

- Build / run commands specific to this stack
- Naming conventions or invariants the agent would otherwise violate
- Known traps (versions, flags, edge cases) and how to avoid them
```

---

## Argument grammar

The skill's Investigation phase parses arguments using the rules below.
This section is informational — it documents the grammar so future updates
keep parser and templates consistent.

| Key           | Required | Format                                                             | Example                                                                    |
|---------------|----------|--------------------------------------------------------------------|----------------------------------------------------------------------------|
| `name`        | yes      | kebab-case (`^[a-z][a-z0-9-]*[a-z0-9]$`)                           | `name=index-audit`                                                         |
| `description` | yes      | free text; quote with `"…"` if it contains spaces                  | `description="Audit database indexes"`                                     |
| `category`    | no       | free-form string; defaults to `productivity` if omitted            | `category=code-quality`                                                    |
| `agents`      | no       | comma-separated kebab-case slugs                                   | `agents=index-walker,index-fixer`                                          |
| `references`  | no       | comma-separated kebab-case slugs                                   | `references=postgres,mysql`                                                |
| `force`       | no       | bare flag (`force`) or `force=true`; overrides collision detection | `force`                                                                    |

Unknown keys cause the skill to abort and ask the user to retry — the
grammar is intentionally minimal.
