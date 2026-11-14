---
name: release
description: >
  Cut a release: derive the semver bump (patch/minor/major) from conventional
  commits since the last tag, bump version files (plugin.json / package.json),
  update the changelog via the changelog skill, then commit, tag and create a
  GitHub release after explicit confirmation. Use when the user asks to
  "cut a release", "release a new version", "bump the version and tag",
  "publish a release", or "tag and release". Idempotent: stops if the tag or
  release already exists. Degrades gracefully without the gh CLI.
tools: Bash, PowerShell, Read, Edit, Glob, Grep, Skill, TaskCreate, TaskUpdate
---

# Release

Chain: semver bump -> version files -> changelog -> commit -> tag -> GitHub release.
Local edits are cheap; **pushing a tag and creating a GitHub release are outward-facing** and
happen only after explicit user confirmation.

## Task Tracking

Call `TaskCreate` for each phase, `TaskUpdate` to `in_progress` / `completed` as you go.

- Phase 1: Determine the bump
- Phase 2: Bump versions and changelog
- Phase 3: Commit, tag, release

---

## Phase 1: Determine the bump

1. Run `git status --short`. If the working tree is dirty with unrelated changes, tell the user and ask whether to continue.
2. Find the last tag: `git describe --tags --abbrev=0` (semver tags `vX.Y.Z` / `X.Y.Z`). No tag: use the root commit and treat the current version file value as the baseline.
3. List commits: `git log <last-tag>..HEAD --format=%s%n%b---`.
4. **No new commits since the last tag: stop** and report "nothing to release". Do not modify anything.
5. Derive the bump, highest wins:
   - `BREAKING CHANGE:` in the body or `!` after the type (`feat!:`) -> **major**
   - any `feat` -> **minor**
   - `fix`, `perf`, `refactor`, others -> **patch**
   - While the version is `0.x`, still report the bump as computed and mention the 0.x convention.
   - Non-conventional commits: classify as patch and list them so the user can override.
6. Compute the new version. **Idempotency check:** if tag `v<new>` already exists (`git tag -l`) or a release exists (`gh release view v<new>`), stop and report it.
7. Show: last tag, commit summary grouped by type, proposed bump and new version. **Ask the user to confirm or override the bump.** Do not continue without an answer.

## Phase 2: Bump versions and changelog

1. Locate version files: `package.json` (and workspace packages), `plugins/*/.claude-plugin/plugin.json`, `pyproject.toml`, `Cargo.toml`. In a monorepo, bump only the packages whose files changed since the last tag, and say so.
2. Use `Edit` to set the new version (never rewrite whole files). If a file already has the new version, leave it.
3. Invoke the `changelog` skill with the Skill tool to add the entries for the new version. If it is unavailable, edit `CHANGELOG.md` directly (Keep a Changelog: rename `[Unreleased]` to `[X.Y.Z] - date`, add a fresh `[Unreleased]`), skipping if the heading already exists.
4. If the repo has a build step that regenerates files from versions (see CLAUDE.md / CONTRIBUTING), run it.
5. Show `git diff --stat`.

## Phase 3: Commit, tag, release

**Ask for explicit confirmation** listing exactly what will happen: commit message `chore(release): vX.Y.Z`, tag `vX.Y.Z`, push of branch and tag, GitHub release. Without a clear "yes", stop and leave the local edits in place.

On confirmation:
1. `git add -- <the version files and CHANGELOG.md>` (by path) and commit `chore(release): vX.Y.Z`.
2. `git tag -a vX.Y.Z -m "vX.Y.Z"`.
3. `git push` and `git push origin vX.Y.Z`.
4. If `gh` is installed and authenticated (`gh auth status`): `gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <notes>` using the changelog section for this version.
5. **Without `gh`:** skip step 4, and print the release notes plus the URL `https://github.com/<owner>/<repo>/releases/new?tag=vX.Y.Z` for manual creation.

Finish with a summary: version, tag, release URL (or the manual steps).

## Rules

- Never force-push, delete or move an existing tag.
- Never push or create a release without confirmation in this run.
- Re-running after a completed release stops in Phase 1 (tag exists / no new commits).
