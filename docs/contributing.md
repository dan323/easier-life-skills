[← Back to README](../README.md)

# Contributing a Skill

## Setup

Clone the repo, install dependencies, and install the marketplace to test locally:

```bash
git clone https://github.com/dan323/easier-life-skills.git
cd easier-life-skills
npm install
```

Then in Claude Code: `/plugin marketplace add ./`

## Adding a New Skill

### 1. Create the plugin directory

The fastest path is the [`scaffold`](../plugins/scaffold/skills/scaffold/SKILL.md) skill — it generates the directory tree, `plugin.json`, a phase-structured `SKILL.md`, and `evals.json` with 3 placeholder cases:

```text
scaffold name=<your-skill-name> description="What this skill does" category=<category>
```

Optional flags add sub-agents or reference docs in the same pass:

```text
scaffold name=index-audit description="Audit database indexes" category=code-quality agents=index-walker,index-fixer references=postgres,mysql
```

The scaffold refuses to overwrite an existing plugin directory unless you append the bare `force` flag. After it runs, skip to step 2 and start filling in the TODOs.

If you'd rather build the tree by hand, the expected structure is:

```
plugins/<your-skill-name>/
├── .claude-plugin/
│   └── plugin.json          name, description, category, skills[]
├── skills/
│   └── <your-skill-name>/
│       ├── SKILL.md
│       └── evals/
│           └── evals.json
```

> The canonical template strings for both paths live in
> [`plugins/scaffold/references/templates.md`](../plugins/scaffold/references/templates.md).
> If you change the structure of a real plugin, update that file in the
> same PR so newly scaffolded plugins stay in sync.

### 2. Write SKILL.md

Start with the frontmatter:

```yaml
---
name: your-skill-name
description: >
  What this skill does and when Claude should use it.
  Include the specific user phrases that should trigger it
  (e.g. "find unused code", "clean up dead imports").
  Be direct about the trigger context — this is the primary
  matching mechanism.
tools: Bash, Read, Grep   # only list what you actually use
metadata:
  version: 1.0
---
```

Then write the body as numbered phases. See [Architecture](architecture.md) for the full format and design principles. Key rules:

- **Explain the why** behind each instruction — don't just say what to do, say why it matters. The agent has good judgment when it understands intent.
- **Prefer `Edit` over `Write`** for existing files to preserve content.
- **Include bash commands** for every data-gathering step — don't ask the agent to guess.
- **Define the output format explicitly** — show a concrete example of what the report or file should look like.
- **Never create placeholder pages** — only write content that has real information in it.

### 3. Write evals

Add at least 3 test cases to `evals/evals.json`. Each eval needs:

- A realistic **prompt** (what a real user would type)
- A **setup** script that creates a minimal repo for the test
- **Assertions** — plain-language statements that must be true of the output

```json
{
  "skill_name": "your-skill-name",
  "evals": [
    {
      "id": 0,
      "prompt": "Find dead code in this project",
      "description": "Python file with one unused function and one used function",
      "setup": "mkdir -p /tmp/eval-0 && cd /tmp/eval-0 && git init && cat > main.py << 'EOF'\ndef used(): return 1\ndef unused(): return 2\nprint(used())\nEOF",
      "expected_output": "Only unused() is flagged. used() is not.",
      "files": [],
      "assertions": [
        {
          "id": "unused-flagged",
          "text": "unused() appears in the report as a dead code finding"
        },
        {
          "id": "used-not-flagged",
          "text": "used() does not appear as a dead code finding"
        }
      ]
    }
  ]
}
```

Good assertions are:
- **Objectively verifiable** — another agent can check them by reading the output
- **Specific** — not "the output looks right" but "the file contains a '### Added' section"
- **Discriminating** — they should fail on bad output, not pass on anything

### 4. Install and test manually

In Claude Code: `/plugin marketplace add ./` (from the repo root), then `/plugin install easier-life-skills/<your-skill-name>`.

Open a Claude Code session in a suitable test directory and run your trigger phrase. Iterate on the `SKILL.md` until the output matches your expectations, then run the evals with the `skill-creator` skill for a more rigorous check.

### 5. Add category and rebuild

Add a `"category"` field to `plugins/<your-skill-name>/.claude-plugin/plugin.json`, then run `npm run build` to regenerate the derived files. The script will automatically add your plugin to `.claude-plugin/marketplace.json`.

The vocabulary currently in use is `productivity`, `documentation`, `code-quality`, `testing`, `security`, `performance`, `automation`, `devops`, `development`, and `design`. The build doesn't enforce this list — the field is a free-form string — but please pick the closest fit rather than coining a new label. `mixed` is reserved for plugin bundles with no single goal; do not apply it to an individual skill, agent, or command.

The plugin's category also propagates to its agents, hooks, commands, and MCP servers — they appear in the same filter group in the web UI. To override a specific sub-entity, add a `category:` field to that agent/hook/command's YAML frontmatter, or list it under the matching entity type in `.claude-plugin/external-overrides.json` (for external repos).

If your skill only reads files (no `Write`, `Edit`, or `NotebookEdit` in its `tools` list), it will automatically be tagged as read-only in the index — no extra marker needed.

Submit a pull request:
- One skill per PR
- Include at least 3 evals
- Update `CHANGELOG.md` under `## [Unreleased] > ### Added`

## Authoring a Workflow

A workflow chains multiple skills into a multi-step pipeline. Workflows are
YAML files consumed by the `workflow` runner skill. They are plugin-internal
config — not a separate marketplace entity — so authoring one is a one-step
job: write the YAML and hand the path to the runner.

### Write the YAML

```yaml
name: document-and-deploy
description: Brainstorm features, document the top ones, and open a PR.

inputs:
  - name: feature_count
    default: 3

steps:
  - id: ideas
    skill: brainstorm
    args:
      count: ${{ inputs.feature_count }}

  - id: docs
    skill: document-project
    inputs:
      ideas: ${{ steps.ideas.output }}

  - id: pr
    skill: task-agent
    inputs:
      tasks: "Open a PR adding the docs produced in step `docs`."
```

Required fields are `name`, `description`, and a non-empty `steps:` list.
Each step needs an `id` (kebab-case, unique) and a `skill` (the name of an
installed skill — it does not have to come from the same plugin).
Interpolation reads from `inputs.<name>` and `steps.<id>.output`.

The full schema lives in
[`plugins/workflow/references/format.md`](../plugins/workflow/references/format.md);
the canonical example is
[`plugins/workflow/examples/document-and-deploy.yaml`](../plugins/workflow/examples/document-and-deploy.yaml).

### Run it

```text
workflow path/to/<name>.yaml feature_count=5
```

The runner writes step outputs and a `workflow-output.json` summary to
`.workflow-runs/<name>-<timestamp>/`. The workflow YAML itself is never
modified.

## Adding Hooks to a Plugin

Hooks let a plugin run code automatically in response to Claude Code lifecycle events (e.g. `Stop`, `SubagentStop`, `PreToolUse`). The required layout is:

```
plugins/<your-plugin>/
└── hooks/
    ├── hooks.json          ← hook manifest (Claude-native format)
    └── <hook-name>.py      ← script invoked by the manifest
```

### `hooks.json` format

```json
{
  "description": "One-line description shown in /doctor and plugin listings",
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ${CLAUDE_PLUGIN_ROOT}/hooks/<hook-name>.py"
          }
        ]
      }
    ]
  }
}
```

`${CLAUDE_PLUGIN_ROOT}` is resolved by Claude Code to the installed plugin's root directory — use it instead of hardcoded paths so the hook works regardless of where the plugin is cached.

Supported event names: `Stop`, `SubagentStop`, `PreToolUse`, `PostToolUse`, `Notification`. See the [Claude Code hooks documentation](https://docs.anthropic.com/en/docs/claude-code/hooks) for the full schema and the environment variables available to hook scripts.

After adding `hooks.json`, run `npm run build` so the hook appears in `skills_index.json` and the web UI. The build discovers hooks exclusively from `hooks.json` files — do not put hook definitions in Markdown files inside `hooks/`.

## Improving an Existing Skill

1. Edit the relevant `plugins/<name>/skills/<name>/SKILL.md` and/or `evals/evals.json`
2. `/plugin update easier-life-skills/<name>` in Claude Code
3. Test the change manually, then run evals
4. Add a `### Changed` entry to `CHANGELOG.md`

---

## See Also

- [Architecture](architecture.md) — skill file format and design principles
- [Getting Started](getting-started.md) — install and first use
