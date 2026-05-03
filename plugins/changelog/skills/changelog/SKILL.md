---
name: changelog
description: Generate or update CHANGELOG.md files by reading git history. Use this skill whenever the user wants to document what changed in their project — whether they say "create a changelog", "update the changelog", "write release notes", "what's new since v1.2", "document changes for this release", "prep the changelog before we ship", or anything else about recording or summarizing code changes for a version or release. Also use it when the user asks to reformat an existing CHANGELOG to Keep a Changelog format. Works for single repos and monorepos. Always prefer this skill over improvising — it handles deduplication, categorization, and format detection correctly.
tools: Bash, Read, Write, Edit, Glob, Grep
model: sonnet
metadata:
    version: 1.0
---

# Changelog

Generate and maintain CHANGELOG.md files by combining committed git history with any staged or unstaged changes. Follows the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format. Works for single-package repos and monorepos alike.

## Prerequisites

Abort immediately if the current directory is not inside a git repository:

```bash
git rev-parse --is-inside-work-tree 2>/dev/null || echo "NOT_GIT"
```

If the output is `NOT_GIT`, stop and tell the user: **"This skill only works inside a git repository."**

## Phase 1: Understand the Repository Layout

### Detect repo root

```bash
git rev-parse --show-toplevel
```

### Detect monorepo structure

Look for workspace files or multiple package manifests one level deep:

```bash
# Common monorepo signals
ls package.json pnpm-workspace.yaml lerna.json rush.json nx.json \
   go.work Cargo.toml pyproject.toml 2>/dev/null

# Count package manifests in subdirectories
find . -maxdepth 3 \( -name "package.json" -o -name "go.mod" \
   -o -name "Cargo.toml" -o -name "pyproject.toml" \) \
   ! -path "*/node_modules/*" ! -path "*/.git/*" | head -30
```

**Monorepo rules:**
- If there are **2+ package manifests** in different subdirectories → monorepo; create one `CHANGELOG.md` per package directory.
- Otherwise → single project; create one `CHANGELOG.md` at the repo root.
- A root `package.json` that only contains a `"workspaces"` key (no `"name"` / `"version"`) counts as an orchestrator, not a real package.

## Phase 2: Determine Scope

For each target directory (root for single, each package dir for monorepo):

1. **Resolve the CHANGELOG.md path** (e.g. `packages/api/CHANGELOG.md`).
2. **If the file exists, read it in full** before doing anything else.
3. **Detect the existing format** (see Phase 2a below).
4. **Find the last-documented commit** to avoid duplicating history already in the file:

```bash
# Extract the most recent SHA that appears in the existing changelog (if any)
grep -oE '[0-9a-f]{7,40}' path/to/CHANGELOG.md 2>/dev/null | head -1
```

   Alternatively, look for version headings (`## [1.2.3]`) and map them to git tags:

```bash
git tag --list | sort -V | tail -5
```

5. **Build the commit range:**
   - If a previous commit SHA or tag was found → use `<sha>..HEAD` as the range.
   - If the changelog is empty or missing → use the full history for that path.

## Phase 2a: Format Detection

Inspect the existing `CHANGELOG.md` (if present) and classify its format **before writing anything**.

**Keep a Changelog signals** (all of the following should be present):
- A `## [Unreleased]` or `## [x.y.z] - YYYY-MM-DD` heading pattern
- Subsection headings like `### Added`, `### Fixed`, `### Changed`, etc.
- A footer with comparison links: `[x.y.z]: https://...`

**Different format signals** (any of the following):
- Free-form prose paragraphs under version headings
- Date-first headings like `## 2024-01-15` or `# v1.2.0`
- Bullet points with no subsection grouping
- RST, TOML, or any non-Markdown structure
- Custom section names that don't match Keep a Changelog categories

**Decision:**
- If the file does **not** exist yet → proceed with Keep a Changelog format, no prompt needed.
- If the file exists and **matches** Keep a Changelog → proceed silently.
- If the file exists and uses a **different format** → **stop and ask the user:**

  > "Your existing `CHANGELOG.md` uses a different format than Keep a Changelog. How would you like to proceed?
  >
  > 1. **Keep your current format** — I'll append new entries matching your existing style.
  > 2. **Switch to Keep a Changelog** — I'll reformat the file and add new entries in that format.
  >
  > Please reply with 1 or 2."

  Wait for the answer before continuing. Apply the chosen strategy to **all** changelog files in the same run (don't ask again for each package in a monorepo).

## Phase 3: Collect Changes

For each target, gather **committed** and **uncommitted** changes separately. Skip things like .gitignore, README.md, or other non-code files unless they are relevant to the package directory. The changelog should never self-document its own changes (i.e. ignore commits that only change the CHANGELOG.md file itself).

### Committed changes (in scope)

```bash
# Commits touching files under this package directory
git log --no-merges --pretty=format:"%H %s" [<range>] -- <package-dir>/

# For the root / single project
git log --no-merges --pretty=format:"%H %s" [<range>]
```

Fetch the diff stat per commit to understand which files changed:

```bash
git show --stat --no-patch <sha>
```

**Improving vague commit messages:** If a commit subject is too generic to be useful in a changelog (e.g. "wip", "fix", "stuff", "updates", "misc", "changes", single words, or anything under ~15 characters), don't use it as-is. Instead, look at what actually changed:

```bash
git show --stat <sha>          # which files changed
git diff <sha>^ <sha> -- <file>  # what changed in a specific file (for small diffs)
```

Use this context to write a short, informative entry describing *what* changed rather than copying the commit message. For example, "wip" on `src/auth.js` might become "Add JWT token validation". Keep entries concise (one line), written from the user's perspective.

### Uncommitted changes

```bash
# Staged changes
git diff --cached --stat

# Unstaged tracked changes
git diff --stat

# Untracked new files
git ls-files --others --exclude-standard
```

Group these under a special `## [Unreleased]` section.

### Deduplication

Before adding any entry, verify it does **not** already appear in the existing changelog:
- Check if the commit SHA prefix (first 7 chars) is present in the existing file.
- Check if the commit subject line (trimmed) is present.
Skip any entry that matches either check.

## Phase 4: Categorise Changes

Map commit messages (and diff summaries for uncommitted work) to changelog categories using the following heuristics:

| Keywords / Patterns                                           | Category       |
|---------------------------------------------------------------|----------------|
| `feat`, `add`, `new`, `implement`                             | **Added**      |
| `fix`, `bug`, `patch`, `correct`, `resolve`                   | **Fixed**      |
| `change`, `update`, `improve`, `refactor`, `perf`, `optimise` | **Changed**    |
| `deprecat`                                                    | **Deprecated** |
| `remov`, `delet`, `drop`                                      | **Removed**    |
| `secur`, `vuln`, `CVE`                                        | **Security**   |
| anything else                                                 | **Changed**    |

For Conventional Commits (`feat:`, `fix:`, `chore:`, etc.) use the prefix directly.

## Phase 5: Determine Version

- If the repo uses tags, find the latest semver tag: `git describe --tags --abbrev=0 2>/dev/null`
- If no tags exist, use `Unreleased` for all committed changes as well.
- Uncommitted changes always go under `[Unreleased]`.

## Phase 6: Write / Update the Changelog

**Golden rule: never discard existing content.** Every write must be an append/prepend operation on top of what is already there. Use the Edit tool (not Write) when the file already exists.

### Path A — Keep a Changelog format (new file or user chose option 2)

Template for a **new** file:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Short description of new feature (abc1234)

### Fixed
- Short description of fix (def5678)

## [1.2.0] - 2026-01-15

### Added
- ...

### Changed
- ...

[Unreleased]: https://github.com/owner/repo/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/owner/repo/compare/v1.1.0...v1.2.0
```

**Rules for Keep a Changelog:**
- Each entry: `- <description> (<7-char-sha>)` for committed work; no SHA for uncommitted.
- Omit empty sections (don't write `### Fixed` if there are no fixes).
- **Existing file:** use Edit to insert new version blocks immediately after the top-level `# Changelog` header (and its blurb lines, if present), before any existing `## [...]` section. Never replace existing sections.
- If an `## [Unreleased]` section already exists in the file, add entries inside it rather than creating a duplicate.
- Update the comparison-link footer by prepending the new link without removing old ones.
- For monorepos, include the package name in the header: `# Changelog — <package-name>`.

### Path B — User's existing format (user chose option 1)

Study the existing file to infer its conventions:
- How are version/date headings written?
- Are entries grouped by category or listed flat?
- What bullet or numbering style is used?
- Is there a footer or legend section?

Reproduce those conventions exactly for new entries. Prepend the new block at the top of the entry list (after any document title/intro), preserving everything below it verbatim.

If the format uses categories but different names (e.g. "New Features" instead of "Added"), continue using those names.

### Remote URL for comparison links

```bash
git remote get-url origin 2>/dev/null
```

Convert SSH URLs (`git@github.com:owner/repo.git`) to HTTPS for the comparison links.

## Phase 7: Output Summary

After writing the file(s), print a brief summary:

```
Updated CHANGELOG.md files:
  ✓ CHANGELOG.md          — 3 new entries (2 committed, 1 uncommitted)
  ✓ packages/api/CHANGELOG.md  — 5 new entries (all committed)

No new changes detected in:
  — packages/ui/CHANGELOG.md   (already up to date)
```

If no files needed updating, say so clearly rather than creating empty changelogs.
