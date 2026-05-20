/* lib/merge-ratings.ts — merge ratings.json into any entity array.
 *
 * Part of the Skill Rating & Review System (issue #7). Keyed by
 * `{kind}/{owner}/{repo}/{name}` — e.g. `skill/dan323/easier-life-skills/changelog`
 * or `plugin/mattpocock/skills/workflow`. Any entity type from any repo can be rated.
 *
 * The merge is fail-soft: a missing or malformed entry warns rather than throwing,
 * because ratings.json is rewritten by a separate scheduled workflow and we don't
 * want a transient bad write to deploy-block the site.
 *
 * Pure function — no I/O, no globals. The build script handles reading the file
 * and calling this once per entity array; unit tests exercise it in isolation.
 */

import type { Rating } from './types.js';

export type RatingsMap = Record<string, Rating>;

export interface RatingsFile {
  ratings?: RatingsMap;
}

/** Entity kinds that can carry a rating — matches the Discussion form dropdown. */
export type RatableKind = 'skill' | 'agent' | 'plugin' | 'hook' | 'command' | 'mcpServer' | 'bundle';

/** Minimum shape required for any entity passed to mergeRatings. */
export interface RatableEntity {
  name:   string;
  source: { owner: string; repo: string };
  rating?: Rating;
}

export interface MergeRatingsResult {
  merged:  number;
  skipped: number;
}

/** Type guard for a single Rating entry. */
function isRating(value: unknown): value is Rating {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r['avg'] === 'number'
      && typeof r['count'] === 'number'
      && Array.isArray(r['reviews']);
}

/**
 * Mutates `entities` in place: assigns `rating` to every entity whose
 * `{kind}/{owner}/{repo}/{name}` key appears in `ratings`. Works for any
 * entity type and any source repo — no local-only restriction.
 */
export function mergeRatings(
  entities: RatableEntity[],
  kind:     RatableKind,
  ratings:  RatingsMap,
  warn:     (msg: string) => void = (m) => console.warn(m),
): MergeRatingsResult {
  let merged = 0;
  let skipped = 0;
  for (const entity of entities) {
    const key = `${kind}/${entity.source.owner}/${entity.source.repo}/${entity.name}`;
    const r = ratings[key];
    if (r === undefined) continue;
    if (!isRating(r)) {
      warn(`⚠ ratings.json entry '${key}' has wrong shape, skipping`);
      skipped++;
      continue;
    }
    entity.rating = r;
    merged++;
  }
  return { merged, skipped };
}
