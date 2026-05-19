/* lib/merge-ratings.ts — merge ratings.json into the list of local-marketplace skills.
 *
 * Source of truth for the Skill Rating & Review System (issue #7,
 * docs/architecture.md → Ratings & Reviews). Keyed by `<pluginName>/<skillName>`,
 * only local-marketplace skills (`source.owner === localOwner && source.repo === localRepo`)
 * are merged — external-marketplace skills are intentionally left unrated in v1.
 *
 * The merge is fail-soft: a missing or malformed entry warns rather than throwing,
 * because ratings.json is rewritten by a separate scheduled workflow (Phase 5 of
 * the design) and we don't want a transient bad write to deploy-block the site.
 *
 * Pure function — no I/O, no globals. The build script handles reading the file
 * and assigning the merged result back; unit tests exercise this in isolation.
 */

import type { Rating, Skill } from './types.js';

export type RatingsMap = Record<string, Rating>;

export interface RatingsFile {
  ratings?: RatingsMap;
}

export interface MergeRatingsOptions {
  localOwner: string;
  localRepo: string;
  warn?: (msg: string) => void;
}

export interface MergeRatingsResult {
  merged: number;
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
 * Mutates `skills` in place: assigns `rating` to every local-marketplace skill
 * whose `<pluginName>/<name>` key appears in `ratings`. Returns counts so the
 * caller can print a one-line summary.
 */
export function mergeRatings(
  skills: Skill[],
  ratings: RatingsMap,
  opts: MergeRatingsOptions,
): MergeRatingsResult {
  const warn = opts.warn ?? ((m: string) => console.warn(m));
  let merged = 0;
  let skipped = 0;
  for (const skill of skills) {
    if (skill.source.owner !== opts.localOwner) continue;
    if (skill.source.repo  !== opts.localRepo)  continue;
    const key = `${skill.pluginName}/${skill.name}`;
    const r = ratings[key];
    if (r === undefined) continue;
    if (!isRating(r)) {
      warn(`⚠ ratings.json entry '${key}' has wrong shape, skipping`);
      skipped++;
      continue;
    }
    skill.rating = r;
    merged++;
  }
  return { merged, skipped };
}
