[← Back to README](../README.md)

# Roadmap & Plans

Day-to-day backlog and ticket status live on the GitHub Project board:
**[Roadmap board](https://github.com/users/dan323/projects/4)** — columns
*Backlog / Todo / In Progress / Done / Won't Do*, with `Area` and `Effort`
fields. Add new ideas as draft cards there.

This document keeps the prose the board can't carry: the design notes for
prioritised features that haven't shipped yet, plus a one-line history of
prioritised features that have.

---

## Active prioritised plans

The features below have full design notes — goal, architecture, file-level
plan, phases, risks, and done-when criteria. Each one is also tracked as
an issue on the board.

| # | Feature                                                                             | Effort   | Status   | Issue |
|----|-------------------------------------------------------------------------------------|----------|----------|-------|
| 1  | [Skill Rating & Review System](#1-skill-rating--review-system)                       | 2–3 days | Todo     | [#7](https://github.com/dan323/easier-life-skills/issues/7) |
| 3b | [Skill-execution telemetry](#3b-skill-execution-telemetry-deferred)                  | 3–4 days | Deferred | [#9](https://github.com/dan323/easier-life-skills/issues/9) |

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

### 3b. Skill-execution telemetry (deferred)

> **Deferred.** GA4 (Feature 3a) already covers web-side engagement on the
> deployed site (shipped in v1.17.0). This plan tracks the opt-in CLI +
> ingest endpoint + aggregator + per-skill instrumentation that captures
> data GA literally cannot see — skills run on user laptops, not in
> browsers. Unblock when there is concrete user-facing demand for the
> `Used 5.2k times this month` / `98% success rate` badges; until then,
> GA + the rating system (Feature 1) are expected to cover the
> trust-and-direction use cases.

#### Goal

Skills emit anonymous, opt-in telemetry. Aggregate metrics are surfaced both
to the maintainer (which skills work, which fail, which are popular) and to
users (`Used 5.2k times this month`, `98% success rate`) — but never expose
PII or any per-user identifier.

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

- `claude-skills telemetry on` records consent locally and skills emit events.
- `analytics.json` is regenerated daily.
- The web UI shows runs / success rate / popularity badges on at least three
  fixture skills, and tests cover the new sort + display.
- `docs/privacy.md` exists and is linked from the README and the CLI's
  consent prompt.

### Sequencing recommendation

1. **Feature 1 (Ratings)** — bounded surface area, exercises the build
   pipeline's "merge external data into the index" pattern, which Feature
   3b would also reuse.
2. **Feature 3b (Execution telemetry)** — only when there's a concrete
   user-facing reason for the popularity badges; until then GA (3a) +
   ratings (1) carry the "trust and direction" signal at a fraction of
   the cost.

---

## Previously shipped

Prioritised features whose design started here and have since landed. The
full original design notes (including each feature's "Deviations from the
original design" subsection) live in [`docs/plan.md` at commit
`ac56d2f`][prior-plan]; per-version detail is in [`CHANGELOG.md`][changelog].

| Feature                                                       | Shipped in                                                                       |
|---------------------------------------------------------------|----------------------------------------------------------------------------------|
| Skill Scaffold Generator (`scaffold` plugin)                  | [v1.16.0][changelog]                                                             |
| Skill Composition & Workflow Format (`workflow` plugin)       | [v1.17.0][changelog]                                                             |
| Usage Analytics 3a — GA4 wiring on the deployed site          | [v1.17.0][changelog] (extended in [v1.17.1][changelog] / [v1.23.1][changelog])   |
| Installer `--search <query>`                                  | [v1.18.0][changelog]                                                             |
| Installer `--update [name]`                                   | [v1.20.0][changelog]                                                             |

Everything else — Web UI tweaks, new skills / agents / commands / hooks /
MCPs, installer ergonomics — lives on the [Roadmap board][board].

[prior-plan]: https://github.com/dan323/easier-life-skills/blob/ac56d2f/docs/plan.md
[changelog]: ../CHANGELOG.md
[board]: https://github.com/users/dan323/projects/4

---

## See Also

- [Architecture](architecture.md) — plugin and skill file format
- [Contributing a Skill](contributing.md) — how to write a new plugin
- [Getting Started](getting-started.md) — install and first use
