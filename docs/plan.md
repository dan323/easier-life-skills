[← Back to README](../README.md)

# Roadmap & Plans

Two parts. The **Prioritised plans** section below contains the next
features to ship, each with an actionable implementation plan. The
**Backlog** section is a longer list of unranked ideas grouped by area,
ranked roughly by value-to-effort within each section.

---

## Prioritised plans

Four features scoped to be shippable in a single PR (or a small series of
PRs), grounded in the current codebase. See [Sequencing
recommendation](#sequencing-recommendation) at the end for the suggested
order.

| # | Feature                                                                        | Effort   | Type    |
|---|--------------------------------------------------------------------------------|----------|---------|
| 1 | [Skill Rating & Review System](#1-skill-rating--review-system)                 | 2–3 days | Feature |
| 2 | [Skill Composition & Workflow Format](#2-skill-composition--workflow-format)   | 3–4 days | Feature |
| 3 | [Usage Analytics & Insights Dashboard](#3-usage-analytics--insights-dashboard) | 3–4 days | Feature |
| 4 | [Skill Scaffold Generator](#4-skill-scaffold-generator)                        | 2–3 days | Feature |

### 1. Skill Rating & Review System

#### Goal

Let users rate and review skills directly in the marketplace browser. Surface
the aggregate score and most-helpful reviews on each card and in the detail
panel. Add `rating` as a sortable dimension alongside `A→Z` / `Z→A`.

#### Why now

Adoption is currently bottlenecked on trust — a user scrolling 11+ local
plugins and an unknown number of external plugins has no signal about which
ones are reliable. Ratings and reviews are the cheapest, most effective trust
mechanism, and the UI already has the panel/card structure to host them.

#### Constraints / non-goals

- **No backend server.** Ratings must live in the repo (a static JSON file)
  to keep the marketplace deployable as static GitHub Pages.
- **No anonymous spam vector.** Reviewing requires GitHub auth — we delegate
  to GitHub Discussions or the GitHub API, not a free-form form.
- **External marketplaces** (e.g. `anthropics/skills`) cannot be rated in this
  iteration. We only collect ratings for items local to this repo. Cross-repo
  ratings are a v2 problem.

#### Architecture

Two halves:

1. **Submission flow** — opens a GitHub Discussions thread per skill.
   - First time anyone rates a skill, a Discussions thread is auto-created
     (`Ratings: <skill-name>`).
   - Subsequent ratings are posted as replies in a structured comment format
     (`★★★★☆ — body…`).
   - A scheduled GitHub Action parses replies into `ratings.json`.

2. **Display flow** — the web UI reads `ratings.json` at build time.
   - The build script merges ratings into `skills_index.json` so the runtime
     code stays a pure read.

#### File-level plan

| File                                                | Change                                                                                                               |
|-----------------------------------------------------|----------------------------------------------------------------------------------------------------------------------|
| `ratings.json` (new, repo root)                     | Source of truth: `{ "<skill-id>": { "avg": 4.3, "count": 12, "reviews": [...] } }`.                                  |
| `.github/workflows/ingest-ratings.yml` (new)        | Hourly cron — runs `scripts/ingest-ratings.ts`.                                                                      |
| `scripts/ingest-ratings.ts` (new)                   | Walks `Ratings: *` Discussion threads via `gh api`, parses the structured body of each reply, writes `ratings.json`. |
| `scripts/lib/types.ts`                              | Add `rating?: { avg: number; count: number; reviews: Review[] }` to the relevant entity types.                       |
| `scripts/build-index.ts`                            | Read `ratings.json` and merge into the generated `skills_index.json`.                                                |
| `assets/src/components/cards/SkillCard.tsx`         | Render a compact `★ 4.3 (12)` badge in the card footer.                                                              |
| `assets/src/components/EntityPanel.tsx`             | Add a Reviews section: aggregate stars, individual reviews, "Rate this skill" button linking to the Discussion.      |
| `assets/src/components/Controls.tsx`                | Add `Rating` to the sort options.                                                                                    |
| `assets/src/url-state.ts`                           | Allow `sort=rating` in the URL hash.                                                                                 |
| `tests/sort.test.ts` / `tests/entity-panel.test.ts` | Cover the new sort option and the rating display.                                                                    |
| `tests/fixtures/skills_index.json`                  | Add ratings to a couple of fixture skills.                                                                           |
| `docs/architecture.md`                              | New section: "Ratings & Reviews".                                                                                    |
| `CHANGELOG.md`                                      | Unreleased entry.                                                                                                    |

#### Phases

1. **Schema & fixtures** (½ day) — define the `rating` shape, update types,
   add fixtures, get tests passing with hardcoded ratings.
2. **UI rendering** (½ day) — `SkillCard` badge + `EntityPanel` reviews
   section. Tests for both.
3. **Sort dimension** (¼ day) — add to `Controls.tsx` + `url-state.ts` +
   tests.
4. **Build merge** (¼ day) — extend `build-index.ts` to merge `ratings.json`.
5. **Ingestion pipeline** (1 day) — `scripts/ingest-ratings.ts`, the
   workflow, and a structured reply template stored in the Discussion's
   first post.

#### Risks

- **Discussions API rate limits.** Mitigation: cache last-seen comment IDs in
  `ratings.json`, paginate, and skip threads we've already fully ingested.
- **Spam / abuse.** Mitigation: require ≥ 1 public commit history on the
  reviewer's account (cheap filter in the ingestion script).
- **External marketplaces don't get ratings.** Accepted for v1 — the UI
  should render the rating section only when `entity.rating` is present, not
  blow up otherwise.

#### Done when

- `npm test` passes.
- A skill with ≥ 1 rating renders the badge on its card.
- Sorting by `Rating` orders skills by `avg` desc, with `count = 0` last.
- The detail panel shows aggregate stars and a "Rate this" link.
- `docs/architecture.md` describes the pipeline.

### 2. Skill Composition & Workflow Format

#### Goal

A declarative YAML format for chaining skills into multi-step workflows.
Workflows are first-class artefacts in the marketplace — discoverable,
shareable, and installable just like skills.

#### Why now

Skills are powerful in isolation but stop short of the real user goal. A user
who wants "brainstorm 3 features, write README sections for each, open a PR"
currently has to run three skills manually and copy intermediate output by
hand. Workflows close that loop. `task-agent` already orchestrates multi-step
agent execution; this generalises it into a reusable format.

#### Format

```yaml
# workflow.yaml
name: Document and Deploy
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
      tasks: "Open a PR adding the docs from step `docs`."
```

Notes on the design:

- **`${{ … }}`** interpolation — familiar from GitHub Actions, avoids a
  custom DSL.
- **`steps[].output`** — every skill must serialise a JSON blob to a
  conventional path (`$WORKFLOW_DIR/<step-id>/output.json`) at the end of its
  run. The workflow runner reads from there.
- **No conditionals / parallelism in v1.** Linear execution only. Branching
  and fan-out are a v2 problem.

#### Architecture

- A new plugin `plugins/workflow/` with a single skill that:
  1. Parses `workflow.yaml`.
  2. Resolves inputs and step ordering.
  3. For each step, spawns a sub-agent via the Agent tool with the
     corresponding skill's `subagent_type`.
  4. Captures stdout / output file, exposes it to subsequent steps via the
     interpolation engine.
  5. Writes a final `workflow-output.json` summarising what each step
     produced.

- A new entity type `workflow` surfaced in the marketplace browser, sitting
  alongside `skill`, `agent`, `command`, `hook`, `mcpServer`.

#### File-level plan

| File                                                 | Change                                                                 |
|------------------------------------------------------|------------------------------------------------------------------------|
| `plugins/workflow/.claude-plugin/plugin.json`        | New plugin manifest.                                                   |
| `plugins/workflow/skills/workflow/SKILL.md`          | Phase-structured skill: parse → validate → execute → report.           |
| `plugins/workflow/skills/workflow/evals/evals.json`  | ≥ 4 evals: happy path, missing input, failing step, idempotent re-run. |
| `plugins/workflow/references/format.md`              | Authoritative spec of the YAML schema.                                 |
| `plugins/workflow/examples/document-and-deploy.yaml` | Example workflow used in the README.                                   |
| `scripts/lib/types.ts`                               | New `Workflow` entity type.                                            |
| `scripts/lib/fetch-marketplace.ts`                   | Discover `workflows/*.yaml` files inside each plugin and surface them. |
| `scripts/build-index.ts`                             | Include workflows in `skills_index.json`.                              |
| `assets/src/components/cards/WorkflowCard.tsx` (new) | Mirrors `SkillCard` but with a list of step skills.                    |
| `assets/src/components/Grid.tsx` / `Filters.tsx`     | Add `workflow` as a filterable entity.                                 |
| `assets/src/components/EntityPanel.tsx`              | Render the step list for workflows.                                    |
| `tests/fixtures/skills_index.json`                   | Add a fixture workflow.                                                |
| `tests/filters.test.ts`                              | Filtering by workflow type.                                            |
| `docs/architecture.md`                               | New section: "Workflows".                                              |
| `docs/contributing.md`                               | How to author a workflow.                                              |
| `CLAUDE.md` (project)                                | Document the workflow entity in the repository-structure section.      |
| `README.md`                                          | Mention workflows in the plugin table.                                 |
| `CHANGELOG.md`                                       | Unreleased entry.                                                      |

#### Phases

1. **Format spec** (½ day) — write `references/format.md`, define types, agree
   on interpolation grammar and the output-file convention.
2. **Runner** (1½ days) — implement the `workflow` skill itself: YAML parse,
   variable substitution, sequential step execution with Agent spawns.
   Hardest part: deciding how a parent skill marshals output to its child.
3. **Marketplace surfacing** (1 day) — types, build script, web UI card and
   filter.
4. **Example + evals** (½ day) — `document-and-deploy.yaml` end-to-end, evals
   covering the failure modes.
5. **Docs** (¼ day) — README, architecture, contributing.

#### Risks

- **Output-passing contract.** Skills currently don't write structured
  output. Mitigation: the runner provides a `$WORKFLOW_OUTPUT` env var; if a
  step doesn't write to it, its `output` is the captured stdout. Skills that
  want to participate "well" in workflows opt into writing JSON; older skills
  still compose, just with stringy output.
- **Error handling.** If step 2 fails, step 3 must not run. Mitigation:
  agent exit codes propagate; the runner stops on first non-zero.
- **Surface area creep.** Mitigation: explicitly defer conditionals,
  parallelism, retries, secrets — list them in `docs/architecture.md` as
  "Future work" with a one-line reason for deferral.

#### Done when

- `plugins/workflow/` builds and appears in the marketplace.
- The `document-and-deploy.yaml` example runs end-to-end in an eval.
- A workflow entity is filterable in the web UI and shows its step list.
- `npm test` passes including new fixtures.

### 3. Usage Analytics & Insights Dashboard

#### Goal

Skills emit anonymous, opt-in telemetry. Aggregate metrics are surfaced both
to the maintainer (which skills work, which fail, which are popular) and to
users (`Used 5.2k times this month`, `98% success rate`) — but never expose
PII or any per-user identifier.

#### Why now

You're flying blind on which skills are valuable. Aggregate usage data drives
roadmap decisions, and visible adoption metrics drive trust the same way
ratings do. Implementing both 1 and 3 together is intentional — ratings are
opinion, telemetry is behaviour, and they reinforce each other.

#### Privacy model

- **Opt-in only.** A user must run `claude-skills telemetry on` (added to
  the installer CLI) once. Default state: off. No telemetry is sent until
  explicit opt-in.
- **No identifiers.** No user ID, no hostname, no IP, no path on disk.
  Payload is `{ skill, version, success, duration_ms, language?, claude_model? }`.
- **Public reporting only.** All ingested data is published as a public
  rollup file; there is no private dataset. Users can audit exactly what
  is collected by reading the source.
- **`docs/privacy.md`** documents all of the above as the user-facing
  privacy commitment.

#### Architecture

- **Emit**: a tiny shared helper in the skill template that, when telemetry
  is on, POSTs a single JSON line to an ingest endpoint at the end of the
  skill's run. Skills opt in by calling the helper at their final phase.
- **Ingest**: a serverless function (Cloudflare Workers free tier or Vercel)
  that appends to a `telemetry.jsonl` in a private GitHub Gist. Reasoning:
  no infrastructure to maintain, generous free tier, can be replaced.
- **Aggregate**: a daily GitHub Action pulls the gist, computes
  per-skill/per-month rollups, and writes `analytics.json` to the repo.
- **Display**: the build script merges `analytics.json` into
  `skills_index.json`; the web UI adds a small badge and a sortable
  `Popularity` dimension.

#### File-level plan

| File                                              | Change                                                                                                              |
|---------------------------------------------------|---------------------------------------------------------------------------------------------------------------------|
| `analytics.json` (new, repo root)                 | Per-skill rollups: `{ "<skill>": { "month": "2026-05", "runs": 5234, "success_rate": 0.98, "p50_ms": 4200 } }`.     |
| `telemetry/ingest.ts` (new)                       | Serverless function — validates payload shape, drops anything with extra fields, appends to the gist.               |
| `telemetry/aggregate.ts` (new)                    | Pulls gist, computes monthly rollups, writes `analytics.json`.                                                      |
| `.github/workflows/aggregate-telemetry.yml` (new) | Daily cron.                                                                                                         |
| `installer/bin/install.js`                        | New subcommands `telemetry on` / `off` / `status` writing `~/.claude/easier-life-skills/telemetry.json`.            |
| Each `plugins/*/skills/*/SKILL.md`                | Add a "Telemetry" phase at the end that conditionally calls the helper.                                             |
| `scripts/lib/types.ts`                            | Add `analytics?: { runs: number; success_rate: number; p50_ms: number }` to entity types.                           |
| `scripts/build-index.ts`                          | Merge `analytics.json` into `skills_index.json`.                                                                    |
| `assets/src/components/cards/SkillCard.tsx`       | Compact `5.2k runs` indicator next to the rating badge.                                                             |
| `assets/src/components/EntityPanel.tsx`           | Add an Analytics section: runs, success rate, p50 duration, trend sparkline.                                        |
| `assets/src/components/Controls.tsx`              | Add `Popularity` sort option.                                                                                       |
| `docs/privacy.md` (new)                           | What is collected, how to opt in/out, how to audit.                                                                 |
| `docs/architecture.md`                            | New "Telemetry pipeline" section.                                                                                   |
| `README.md`                                       | Link to `docs/privacy.md` and explain how the trust badges work.                                                    |
| `tests/`                                          | Fixture skills with analytics; test the sort and panel rendering.                                                   |
| `CHANGELOG.md`                                    | Unreleased entry.                                                                                                   |

#### Phases

1. **Privacy doc & CLI flags first** (½ day) — write `docs/privacy.md` and
   ship the installer's `telemetry on|off|status` subcommand. This sets the
   social contract before any code emits anything.
2. **Ingest endpoint** (½ day) — minimal serverless function with a strict
   JSON schema validator. Reject any payload with unexpected fields.
3. **Aggregation** (½ day) — `aggregate.ts` + daily action.
4. **Skill instrumentation** (½ day) — telemetry helper, add the call to
   each existing skill's final phase. Each addition is one line.
5. **UI surfacing** (1 day) — badge, panel section, sort option, tests.
6. **Sparkline** (½ day, optional) — small 6-month trend rendering in the
   detail panel.

#### Risks

- **Opt-in rate is low → noisy data.** Acceptable for v1. The maintainer
  view of telemetry is *directional*, not statistically rigorous. We'll
  document this caveat in `docs/privacy.md` (and on the maintainer
  dashboard).
- **A vendor change kills the ingest.** Mitigation: the schema is portable,
  payloads are append-only JSON lines, the function is < 50 lines of code.
  Re-hosting is a one-afternoon job.
- **Perceived snooping.** Mitigation: opt-in, public dataset, signed-in-blood
  in `docs/privacy.md` and the README. Make the opt-in command obvious in
  the CLI's first run.

#### Done when

- `claude-skills telemetry on` records consent locally and skills emit
  events.
- `analytics.json` is regenerated daily.
- The web UI shows runs / success rate / popularity badges on at least
  three fixture skills, and tests cover the new sort + display.
- `docs/privacy.md` exists and is linked from the README and the CLI's
  consent prompt.

### 4. Skill Scaffold Generator

#### Goal

A `scaffold` skill that generates a complete plugin skeleton from a single
prompt — directory structure, `plugin.json`, a phase-structured `SKILL.md`,
`evals.json` with three placeholder cases, and optional `agents/` and
`references/` folders.

#### Why now

Adding a new plugin currently requires copying an existing one and replacing
the relevant fields. It works, but it's a 30–45-minute task and an
error-prone one (forgetting evals, mis-naming a directory, leaving stale
content from the template). A scaffold reduces it to a 5-minute task and is
the single biggest lever for contribution velocity.

#### Usage

```text
/scaffold name=index-audit description="Audit database indexes" category=code-quality agents=index-walker
```

Generates:

```
plugins/index-audit/
  .claude-plugin/
    plugin.json                  ← Filled with the inputs
  skills/index-audit/
    SKILL.md                     ← Phase template with TODO markers
    evals/
      evals.json                 ← 3 placeholder evals
  agents/
    index-walker.md              ← YAML frontmatter + system-prompt template
```

The generator finishes by printing a checklist:

```
✓ Plugin scaffolded at plugins/index-audit/
Next steps:
  1. Fill in TODOs in skills/index-audit/SKILL.md
  2. Replace placeholder evals in skills/index-audit/evals/evals.json
  3. Run: npm run build && npm test
```

#### Architecture

- A standard skill (not a CLI binary) so it lives in the marketplace and is
  installable like everything else.
- Reads inputs from the prompt arguments (parsed by the SKILL.md
  Investigation phase using simple key=value parsing).
- Uses the Write tool exclusively — no shell scripting required, every file
  has a templated string in the skill body.
- Idempotent: refuses to overwrite an existing plugin directory unless
  `--force` is passed.

#### File-level plan

| File                                                | Change                                                                                                     |
|-----------------------------------------------------|------------------------------------------------------------------------------------------------------------|
| `plugins/scaffold/.claude-plugin/plugin.json`       | New plugin manifest (category: productivity).                                                              |
| `plugins/scaffold/skills/scaffold/SKILL.md`         | Phase-structured skill: parse args → check collisions → write files → print next steps.                    |
| `plugins/scaffold/skills/scaffold/evals/evals.json` | ≥ 4 evals: basic scaffold, scaffold-with-agent, collision error, scaffold-with-references.                 |
| `plugins/scaffold/references/templates.md`          | Canonical template strings (`plugin.json`, `SKILL.md`, `evals.json`, `agent.md`) — single source of truth. |
| `plugins/scaffold/examples/scaffolded-output/`      | Expected output of a known invocation, used by evals.                                                      |
| `docs/contributing.md`                              | Replace the "manually copy an existing plugin" instructions with `/scaffold …`.                            |
| `README.md`                                         | Add `scaffold` to the plugins table.                                                                       |
| `CHANGELOG.md`                                      | Unreleased entry.                                                                                          |

#### Phases

1. **Template extraction** (¼ day) — copy the canonical template strings
   from existing plugins into `references/templates.md`. This is the
   single source of truth; the skill body composes them.
2. **Argument parser** (¼ day) — define the prompt grammar (`name=… category=…
   agents=a,b references=c`) and the validation rules (kebab-case name,
   category is one of the allowed values, agents/references are optional
   comma-separated lists).
3. **Skill body** (½ day) — Investigation, Implementation (Write the files),
   Verification (print the checklist) phases.
4. **Collision behaviour** (¼ day) — refuse if the directory exists, surface
   `--force` to override.
5. **Evals** (½ day) — write 4 evals including the collision case and one
   with both agents and references.
6. **Docs** (¼ day) — rewrite the relevant section of `docs/contributing.md`.

#### Risks

- **Template drift.** If existing plugins change their structure, the
  scaffold output will lag. Mitigation: `references/templates.md` is the
  authoritative version — when changing the structure of a real plugin,
  update the references file in the same PR. Add a checklist line to the
  contributing guide.
- **Args parsing edge cases.** Mitigation: keep the grammar minimal
  (key=value, space-separated, comma-separated lists for repeated keys).
  Reject anything ambiguous and ask the user to retry.

#### Done when

- Running the skill with valid arguments produces a plugin that passes
  `npm run build && npm test`.
- Re-running on an existing plugin name errors cleanly.
- `docs/contributing.md` recommends `/scaffold` as the canonical path.
- All four evals pass.

### Sequencing recommendation

If shipping serially:

1. **Feature 4 (Scaffold)** first — small, self-contained, immediately
   useful for everything that follows. Adding three new plugins (workflow,
   rating ingestion, telemetry endpoint) is a great real-world test for it.
2. **Feature 1 (Ratings)** — bounded surface area, exercises the build
   pipeline's "merge external data into the index" pattern, which Feature 3
   reuses.
3. **Feature 3 (Analytics)** — reuses the merge pattern from Feature 1 and
   benefits from the privacy/consent discussion happening before too many
   skills are written.
4. **Feature 2 (Workflows)** last — biggest design surface, benefits from
   having scaffold + telemetry already in place so authored workflows can
   inherit them.

---

## Backlog

Unranked ideas grouped by area. Items are roughly ranked by value-to-effort
within each section.

### Web UI

#### 1. Custom bundle builder  ·  Days
A "Add to bundle" button on every card. A persistent drawer shows the current selection with a generated install script and a "Copy all" button. Replaces the need to browse bundles separately and serves the core use case — getting a curated set of skills installed — better than static bundles.

#### 2. GitHub stars on source tags  ·  Hours
Fetch star counts from the GitHub API for each marketplace repo and display them on the source tags (e.g. `dan323/easier-life-skills ★ 42`). Makes the relative popularity of marketplaces visible at a glance.

#### 3. SKILL.md preview in panel  ·  Days
For skills and plugins, show a truncated rendering of the raw SKILL.md in the detail panel — the first 1000 chars or the first phase heading. Gives users a sense of what the skill actually does before installing it, without leaving the page.

#### 4. Remaining keyboard shortcuts  ·  Hours
`j`/`k` moves between visible cards, `Enter` opens the detail panel for the focused card. (`/` to focus search and `Escape` to close the panel are already implemented.)

### Installer CLI (`npx @dan323/easier-life-skills`)

#### 1. `--search <query>`  ·  Hours
Filter skills by name/description/keywords before installing. Currently the user must run `--list` and scan manually. A simple `skills.filter(s => ...)` on the already-fetched index.

#### 2. `--update`  ·  Hours
Re-download and overwrite already-installed skills. Currently there is no way to update without manually deleting the install directory. Checks installed `plugin.json` version against the index and reports what changed.

#### 3. `--uninstall <name>`  ·  Hours
Remove an installed skill directory from `~/.claude/plugins/easier-life-skills/<name>`. Simple `rm -rf` with a confirmation prompt.

#### 4. `--marketplace <owner/repo>`  ·  Days
Pull from any compatible `skills_index.json`, not just the hardcoded `dan323` URL. Lets power users install from `mattpocock/skills` or any other marketplace directly from the terminal without touching the web UI.

#### 5. Check for updates on run  ·  Hours
When the user runs any install command, quietly compare their installed skill versions against the index and print a summary (`2 skills have updates — run --update to refresh`).

#### 6. Interactive mode (no flags)  ·  Days
When run with no flags, show a terminal UI with checkboxes to browse and select skills to install — instead of dropping to the usage text. Uses the built-in `readline` already imported.

### Skills

#### 1. `security-review`  ·  Days
Scan a codebase for OWASP Top-10 vulnerabilities, hardcoded secrets, insecure dependencies, and unsafe patterns. Read-only output (report of findings ranked by severity). Complements `find-dead-code` and `improve-logging` in a "code health" bundle.

#### 2. `generate-tests`  ·  Days
Given a file or function, generate unit and integration test cases. Detects the test framework in use (Jest, Vitest, pytest, JUnit…), follows existing test conventions, and writes tests alongside the source. Idempotent — won't overwrite existing tests.

#### 3. `pr-description`  ·  Hours
Generate a pull request title and description from the current branch's diff and commit history. Follows the repo's PR template if one exists. Much faster than the `changelog` skill for the single-PR case.

#### 4. `explain-codebase`  ·  Days
Produce an onboarding guide for a new contributor: entry points, data flow, key abstractions, module map, and "where to start" for common tasks. Writes to `docs/onboarding.md` or prints to stdout.

#### 5. `dependency-audit`  ·  Hours
Check all dependencies for outdated versions and known vulnerabilities (using `npm audit`, `pip-audit`, `cargo audit`, etc. with grep fallback). Read-only report ranked by severity.

#### 6. `performance-audit`  ·  Days
Identify performance bottlenecks: N+1 queries, unindexed DB columns, unnecessary re-renders, large bundle sizes, synchronous I/O in hot paths. Language and framework aware. Read-only report.

### Agents

#### 1. `pr-reviewer`  ·  Days
A background agent that polls open PRs and posts a structured code review comment: summary of changes, potential bugs, style issues, and suggested improvements. Complements the existing `copilot-review-fixer` (which fixes comments) by generating the comments in the first place.

#### 2. `dependency-updater`  ·  Days
A background agent that runs on a schedule, checks for outdated dependencies, opens a PR per package manager with the bumped version, and fills in the PR description with the changelog diff. Combines `dependency-audit` with the task-agent PR-opening pattern.

#### 3. `issue-triager`  ·  Days
Reads new GitHub issues, labels them by type (bug/feature/question), checks for duplicates, and posts a triage comment with reproduction steps requested or a pointer to existing issues. Runs as a background agent triggered by webhook or schedule.

### Commands

#### 1. `commit-message`  ·  Hours
Generate a conventional commit message (`feat:`, `fix:`, `chore:`, etc.) from the current staged diff. Copies it to the clipboard or prints it. The most-used one-shot command in a developer's day.

#### 2. `new-issue`  ·  Hours
Create a GitHub issue from the current conversation context — title, description, labels, and assignee inferred from what was discussed. Wraps `gh issue create`.

#### 3. `explain-error`  ·  Hours
Paste a stack trace or compiler error; the command explains what went wrong, why, and the most likely fix in plain language. Useful as a quick lookup without context-switching.

#### 4. `standup`  ·  Hours
Summarise today's git commits and open PRs into a standup-ready paragraph. Wraps `git log --since=midnight` and `gh pr list`.

### Hooks

Claude Code hooks are shell commands wired to events (`PreToolUse`, `PostToolUse`, `Stop`, `SubagentStop`). The marketplace already has the `Hook` type, `events[]` field, and `hooks-grid` rendered in the UI, and the first hook plugins (`cost-tracker`, `site-audit`) are shipping. The items below are the next ones to add.

#### 1. `notify-on-stop`  ·  Hours  ·  Feature
Fire a desktop notification (or terminal bell) when Claude finishes a long task. Hooks into the `Stop` and `SubagentStop` events; shell command is `notify-send` on Linux, `osascript` on macOS, `powershell … New-BurntToastNotification` on Windows. No project dependency — works everywhere, immediately useful without configuration.

#### 2. `no-main-push`  ·  Hours  ·  Feature
`PreToolUse` hook on Bash calls containing `git push`. Inspects the command for a `main` or `master` target and exits non-zero to block it, printing a message like `"Direct push to main blocked — open a PR instead."` Simple pattern match, high safety value for any team using Claude to write and commit code.

#### 3. `secret-scanner`  ·  Days  ·  Feature
`PreToolUse` hook on `Write` and `Edit`. Reads the incoming file content from the hook's stdin JSON, runs a regex sweep for high-entropy strings, AWS/GCP/GitHub token patterns, and common secret field names (`password`, `api_key`, `secret`). Blocks the write and prints the offending line if a match is found. Prevents Claude from accidentally persisting credentials.

#### 4. `auto-format`  ·  Days  ·  Feature
`PostToolUse` hook on `Write` and `Edit`. Detects the project formatter from config files (`prettier`, `.prettierrc`, `pyproject.toml [tool.black]`, `.golangci.yml`, etc.) and runs it on the file Claude just wrote. Keeps formatting consistent without requiring the user to remember to run it — particularly valuable when Claude generates large files in a single write.

### MCPs

#### 1. GitHub Issues MCP  ·  Days
An MCP server wrapping `gh` commands for creating, listing, updating, and commenting on issues and PRs. Lets skills and agents interact with GitHub Issues natively without shell commands, and makes the integration available to any Claude session.

#### 2. Local search MCP  ·  Hours
An MCP server wrapping `ripgrep` and `fd` for fast local file search. Exposes `search_content(pattern, path)` and `find_files(glob, path)` as MCP tools — faster and more capable than the built-in Glob/Grep tools for large codebases.

#### 3. Secrets scanner MCP  ·  Hours
An MCP server that scans a file or directory for secrets (API keys, tokens, credentials) using pattern matching and entropy analysis. Useful as a pre-commit gate or as a tool available to the `security-review` skill.

---

## See Also

- [Architecture](architecture.md) — plugin and skill file format
- [Contributing a Skill](contributing.md) — how to write a new plugin
- [Getting Started](getting-started.md) — install and first use
