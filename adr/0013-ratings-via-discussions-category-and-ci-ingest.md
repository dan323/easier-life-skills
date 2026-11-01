# ADR 0013 — Ratings via a Discussions category, ingested in the Pages build

- **Status**: Accepted
- **Date**: 2026-11-01
- **Anchor commit**: v1.30.0 (ratings Phases 1–5, issue #7); recorded retroactively
- **Scope**: `scripts/ingest-ratings.ts`, `scripts/lib/merge-ratings.ts`, `ratings.json`, `.github/DISCUSSION_TEMPLATE/ratings.yml`, `.github/workflows/pages.yml`, `assets/src/components/ReviewsBlock.tsx`

## Context

The marketplace needs a trust signal (ratings and short reviews) but is a
static GitHub Pages site: no backend, no database, and no anonymous form
that could be spammed. `docs/plan.md` originally proposed:

- one auto-created Discussions thread per skill (`Ratings: <skill>`),
  with replies in a free-text `★★★★☆ — body` format;
- a dedicated hourly `ingest-ratings.yml` workflow committing
  `ratings.json`;
- an anti-spam filter requiring reviewers to have public commit history;
- ratings for local skills only.

During implementation each of these proved awkward.

## Decision

1. **Submit through one Discussions category ("Ratings") with an issue-form
   template.** The form collects entity type, entity name, stars and text
   as structured fields, so the parser reads form sections instead of
   free-form replies, and nothing has to create threads on demand.
   GitHub login is still required, so there is no anonymous spam vector.
2. **Ingest as a step of `pages.yml`** (`npm run ingest` before
   `npm run build`), on every deploy plus a daily 03:00 UTC cron. The
   rewritten `ratings.json` feeds that build and is not pushed back.
   This follows [ADR-0004](0004-generated-indices-built-in-ci-not-committed.md)
   (generated data is built in CI, not committed) and avoids a second
   workflow and bot commits to `master`.
3. **Key ratings by `{entityType}/{owner}/{repo}/{name}`** and allow any
   entity type from any marketplace. A `pluginName/skillName` key could
   not express agents, hooks, commands, MCP servers or bundles, nor
   external entities, and the form already asks for the type.
4. **Keep only the latest review per author per entity.** This bounds one
   account to one vote per entity.
5. **Fail soft everywhere.** Missing token, category or API error leaves
   `ratings.json` unchanged and never breaks the build.

## Alternatives considered

- *Thread per skill, free-text replies* — needs thread auto-creation,
  fragile parsing, and a Discussion per entity to maintain.
- *Dedicated hourly workflow committing `ratings.json`* — extra moving
  part, commit noise, and push permissions for a bot; hourly freshness
  is unnecessary for ratings.
- *Third-party reviews service or serverless endpoint* — adds a runtime
  dependency and a spam surface, contradicting the static-site constraint.

## Consequences

- Ratings are at most about a day stale unless a deploy happens
  (deploys also ingest).
- The committed `ratings.json` is only a seed/fallback; the real data
  lives in Discussions. A local `npm run build` without `GITHUB_TOKEN`
  shows the committed snapshot.
- The anti-spam filter (reviewer must have public commits) was **not**
  implemented. Throwaway GitHub accounts can still inflate a rating; add a
  reputation check to the ingest script if abuse appears.
- Renaming an entity orphans its old ratings, since the name is part of
  the key and the form takes the name as text.
- The category name `Ratings` must exist in the repository's Discussions;
  if it is renamed, ingestion skips with a warning.
