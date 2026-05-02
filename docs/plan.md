[← Back to README](../README.md)

# Plan: Transform easier-life-skills into an Interactive Marketplace

> **Status: All phases complete.** See [CHANGELOG.md](../CHANGELOG.md) for what shipped. The sections below are preserved as the original design rationale.

## What We're Building

Four independent layers on top of the existing repo:

1. `skills_index.json` — machine-readable source of truth
2. GitHub Pages interactive website — searchable, filterable skill catalog
3. `npx` installer CLI — install skills from the terminal
4. Role-based bundles + `CATALOG.md`

---

## Phase 1 — Data Foundation ✓

**Files:** `scripts/build-index.ts` → generates `skills_index.json` + `CATALOG.md`

- Node.js script, zero dependencies (built-ins only)
- Reads `.claude-plugin/marketplace.json` + each `plugins/<name>/skills/<name>/SKILL.md` frontmatter
- Produces `skills_index.json` at root (consumed by website and CLI)
- Produces `CATALOG.md` at root (human-readable table by category and bundle)

Each skill entry in the index includes: `name`, `version`, `description`, `category`, `keywords`, `tools`, `readOnly`, `rawSkillUrl`, `installCommand`, `triggerPhrases`, `bundles`.

---

## Phase 2 — Role-Based Bundles ✓

Four bundles for the current 8 skills:

| Bundle                     | Skills                                                                     |
|----------------------------|----------------------------------------------------------------------------|
| **Backend Developer**      | `find-breaking-rest-api`, `find-dead-code`, `improve-logging`, `changelog` |
| **Open Source Maintainer** | `changelog`, `document-project`, `brainstorm`, `find-skills`               |
| **Code Quality Reviewer**  | `find-dead-code`, `improve-logging`, `find-breaking-rest-api`              |
| **Full Stack**             | all 8                                                                      |

---

## Phase 3 — GitHub Pages Website ✓

**Tech stack:** Vanilla HTML + CSS + TypeScript — single `index.html`, esbuild bundles `assets/src/app.ts` to `assets/bundle.js`. Fetches `skills_index.json` at runtime via `fetch()`.

**Features:**
- Skill cards with category badge, description, readOnly tag, copy-to-clipboard install command
- Live search filtering across name / description / keywords
- Category toggle buttons (`documentation`, `code-quality`, `productivity`, `automation`)
- Bundle view — bundle cards with skill checklist and copyable multi-line install block

---

## Phase 4 — `npx` Installer CLI ✓

**Package:** `@dan323/easier-life-skills` published on npm  
**Location:** `installer/` directory in the repo

```bash
npx @dan323/easier-life-skills --list
npx @dan323/easier-life-skills --skill changelog
npx @dan323/easier-life-skills --bundle backend-developer
npx @dan323/easier-life-skills --bundle backend-developer --dry-run
```

Fetches `skills_index.json` from raw GitHub, copies SKILL.md files into `~/.claude/plugins/easier-life-skills/`.

**Flags:**

| Flag             | Description                                  |
|------------------|----------------------------------------------|
| `--skill <name>` | Install a single skill                       |
| `--bundle <id>`  | Install all skills in a bundle               |
| `--list`         | Print available skills and bundles           |
| `--dry-run`      | Show what would be installed without writing |
| `--yes`          | Skip confirmation prompt                     |

---

## Phase 5 — GitHub Actions ✓

**File:** `.github/workflows/pages.yml`

Deploys the repo to GitHub Pages on every push to `master`. No build step required — the website is static and reads `skills_index.json` at runtime.

---

## New Files

Existing files are untouched. Ten new files:

```
skills_index.json                  ← generated registry
CATALOG.md                         ← generated human catalog
index.html                         ← GitHub Pages website
assets/style.css                   ← website styles
assets/app.js                      ← website JS
scripts/build-index.js             ← index + CATALOG generator
installer/package.json             ← npx CLI package manifest
installer/bin/install.js           ← npx CLI entry point
installer/README.md                ← CLI usage docs
.github/workflows/pages.yml        ← GitHub Pages deployment
```

---

## Implementation Order

| Day | Work                                                                   |
|-----|------------------------------------------------------------------------|
| 1   | `scripts/build-index.js` → generate `skills_index.json` + `CATALOG.md` |
| 2   | `index.html` + `assets/style.css` + `assets/app.js` → website          |
| 3   | `installer/` → npx CLI + `.github/workflows/pages.yml` → deploy Pages  |

---

## See Also

- [Architecture](architecture.md) — plugin and skill file format
- [Getting Started](getting-started.md) — install and first use
- [Contributing a Skill](contributing.md) — how to write a new skill
