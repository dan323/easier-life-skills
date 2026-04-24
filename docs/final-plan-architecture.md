[← Back to README](../README.md)

# Final Architecture: easier-life-skills as an Interactive Marketplace

This document describes the **complete target state** of the repo — what it looks like when all phases of the plan are done. Use this as the reference for what we're building toward.

---

## What the Repo Becomes

A fully interactive Claude Code skill marketplace with four entry points:

| Entry Point               | Who uses it            | How                                            |
|---------------------------|------------------------|------------------------------------------------|
| **GitHub Pages website**  | Anyone browsing        | Search, filter, copy install commands          |
| **`npx` CLI**             | Developers in terminal | Install skills directly from command line      |
| **Claude Code `/plugin`** | Claude Code users      | `/plugin install changelog@easier-life-skills` |
| **`CATALOG.md`**          | GitHub readers         | Markdown table of all skills                   |

---

## Final File Structure

```
easier-life-skills/
│
├── .claude-plugin/
│   └── marketplace.json            ← Claude Code marketplace catalog (existing)
│
├── plugins/                        ← All skill plugins (existing, untouched)
│   ├── brainstorm/
│   ├── changelog/
│   ├── document-project/
│   ├── find-breaking-rest-api/
│   ├── find-dead-code/
│   ├── find-skills/
│   ├── improve-logging/
│   └── task-agent/
│       each contains:
│         .claude-plugin/plugin.json
│         skills/<name>/SKILL.md
│         evals/evals.json
│
├── scripts/
│   └── build-index.js              ← NEW: generates skills_index.json + CATALOG.md
│
├── installer/                      ← NEW: npx CLI package
│   ├── package.json                ← published as @dan323/easier-life-skills on npm
│   ├── bin/
│   │   └── install.js              ← CLI entry point
│   └── README.md
│
├── assets/                         ← NEW: website static assets
│   ├── style.css
│   └── app.js
│
├── .github/
│   └── workflows/
│       └── pages.yml               ← NEW: GitHub Pages deployment
│
├── docs/
│   ├── getting-started.md          ← existing
│   ├── architecture.md             ← existing
│   ├── contributing.md             ← existing
│   ├── plan.md                     ← existing
│   └── final-plan-architecture.md  ← this file
│
├── index.html                      ← NEW: GitHub Pages website entry point
├── skills_index.json               ← NEW: machine-readable skill registry (generated)
├── CATALOG.md                      ← NEW: human-readable skill catalog (generated)
├── CHANGELOG.md                    ← existing
└── README.md                       ← existing
```

---

## How the Pieces Connect

```
marketplace.json  ──┐
SKILL.md files    ──┤──▶  build-index.js  ──▶  skills_index.json  ──┬──▶  index.html (website)
plugin.json files ──┘                      └──▶  CATALOG.md          └──▶  install.js (CLI)
```

- `build-index.js` is the **only** script that reads plugin source files
- `skills_index.json` is the **single source of truth** consumed by everything else
- The website and CLI never read `SKILL.md` files directly — they read the index

---

## `skills_index.json` Schema

```json
{
  "meta": {
    "generated": "2026-04-19T00:00:00Z",
    "owner": "dan323",
    "repo": "easier-life-skills",
    "skillCount": 8,
    "baseUrl": "https://raw.githubusercontent.com/dan323/easier-life-skills/master"
  },
  "skills": [
    {
      "name": "changelog",
      "version": "1.0",
      "description": "Generate or update CHANGELOG.md files by reading git history.",
      "category": "documentation",
      "keywords": ["changelog", "git", "documentation", "release-notes"],
      "tools": ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
      "readOnly": false,
      "skillPath": "plugins/changelog/skills/changelog/SKILL.md",
      "rawSkillUrl": "https://raw.githubusercontent.com/dan323/easier-life-skills/master/plugins/changelog/skills/changelog/SKILL.md",
      "installCommand": "/plugin install changelog@easier-life-skills",
      "bundles": ["open-source-maintainer", "full-stack"]
    }
  ],
  "bundles": [
    {
      "id": "backend-developer",
      "name": "Backend Developer",
      "description": "API compatibility, code hygiene, observability, and release docs",
      "skills": ["find-breaking-rest-api", "find-dead-code", "improve-logging", "changelog"]
    },
    {
      "id": "open-source-maintainer",
      "name": "Open Source Maintainer",
      "description": "Docs, release notes, roadmap decisions, and skill discovery",
      "skills": ["changelog", "document-project", "brainstorm", "find-skills"]
    },
    {
      "id": "code-quality",
      "name": "Code Quality Reviewer",
      "description": "Read-only analysis skills for code review and CI gating",
      "skills": ["find-dead-code", "improve-logging", "find-breaking-rest-api"]
    },
    {
      "id": "full-stack",
      "name": "Full Stack",
      "description": "All skills — for solo developers and small teams",
      "skills": ["brainstorm", "changelog", "document-project", "find-breaking-rest-api", "find-dead-code", "find-skills", "improve-logging", "task-agent"]
    }
  ]
}
```

---

## Website (`index.html`)

Hosted at `https://dan323.github.io/easier-life-skills/`

- Single HTML file, no framework, no build step
- Fetches `skills_index.json` at runtime
- **Skills view:** grid of cards — name, category badge, description, readOnly tag, copy-to-clipboard install command
- **Bundles view:** bundle cards with skill checklist and copyable multi-line install block
- **Search:** live filter across name / description / keywords
- **Category filter:** toggle buttons for `documentation`, `code-quality`, `productivity`, `automation`

---

## CLI (`npx @dan323/easier-life-skills`)

```bash
# List everything
npx @dan323/easier-life-skills --list

# Install a single skill
npx @dan323/easier-life-skills --skill changelog

# Install a bundle
npx @dan323/easier-life-skills --bundle backend-developer

# Preview without writing
npx @dan323/easier-life-skills --bundle backend-developer --dry-run
```

Fetches `skills_index.json` from raw GitHub → copies SKILL.md files into `~/.claude/plugins/easier-life-skills/`.

---

## Data Flow: Adding a New Skill

When a new plugin is added to the repo, the update process is:

1. Create `plugins/<new-skill>/` with `SKILL.md`, `plugin.json`, `evals.json`
2. Add entry to `.claude-plugin/marketplace.json`
3. Run `node scripts/build-index.js` — regenerates `skills_index.json` + `CATALOG.md`
4. Commit all four changed files
5. Push → GitHub Actions deploys updated website automatically

The CLI and website pick up the new skill immediately after deploy — no code changes needed.

---

## See Also

- [Plan](plan.md) — phased implementation steps
- [Architecture](architecture.md) — plugin and skill file format
- [Contributing a Skill](contributing.md) — how to write a new skill
