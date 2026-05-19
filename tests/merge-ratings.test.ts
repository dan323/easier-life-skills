/**
 * Unit tests for `scripts/lib/merge-ratings.ts` — the pure-logic half of
 * the Skill Rating & Review System (issue #7).
 *
 * The build script's I/O is intentionally not covered here; this suite
 * exercises only the in-memory merge so we can verify the local-only
 * scope, the key shape, the fail-soft type guard, and idempotence
 * without spinning up a fake filesystem.
 */

import { describe, it, expect, vi } from 'vitest';
import { mergeRatings, type RatingsMap } from '../scripts/lib/merge-ratings.ts';
import type { Skill } from '../scripts/lib/types.ts';

const LOCAL_OWNER = 'dan323';
const LOCAL_REPO  = 'easier-life-skills';

function makeSkill(over: Partial<Skill> & Pick<Skill, 'name' | 'pluginName'>): Skill {
  return {
    name:           over.name,
    pluginName:     over.pluginName,
    version:        over.version ?? '0.0.0',
    description:    over.description ?? '',
    category:       over.category ?? null,
    keywords:       over.keywords ?? [],
    tools:          over.tools ?? [],
    readOnly:       over.readOnly ?? false,
    skillPath:      over.skillPath ?? '',
    rawSkillUrl:    over.rawSkillUrl ?? '',
    installCommand: over.installCommand ?? '',
    source: over.source ?? {
      owner:   LOCAL_OWNER,
      repo:    LOCAL_REPO,
      repoUrl: `https://github.com/${LOCAL_OWNER}/${LOCAL_REPO}`,
    },
  };
}

describe('mergeRatings', () => {
  it('merges a well-formed rating onto a matching local skill', () => {
    const skills = [makeSkill({ name: 'changelog', pluginName: 'docs' })];
    const ratings: RatingsMap = {
      'docs/changelog': {
        avg: 4.5,
        count: 2,
        reviews: [
          { stars: 5, body: 'great', author: 'octocat', date: '2026-05-10T00:00:00Z' },
          { stars: 4, body: 'good',  author: 'hubot',   date: '2026-05-11T00:00:00Z' },
        ],
      },
    };

    const result = mergeRatings(skills, ratings, { localOwner: LOCAL_OWNER, localRepo: LOCAL_REPO });

    expect(result).toEqual({ merged: 1, skipped: 0 });
    expect(skills[0]!.rating).toEqual(ratings['docs/changelog']);
  });

  it('does not merge ratings onto external-marketplace skills', () => {
    const external = makeSkill({
      name:       'changelog',
      pluginName: 'docs',
      source: { owner: 'someone-else', repo: 'their-skills', repoUrl: 'https://github.com/someone-else/their-skills' },
    });
    const ratings: RatingsMap = {
      'docs/changelog': { avg: 5, count: 1, reviews: [] },
    };

    const result = mergeRatings([external], ratings, { localOwner: LOCAL_OWNER, localRepo: LOCAL_REPO });

    expect(result).toEqual({ merged: 0, skipped: 0 });
    expect(external.rating).toBeUndefined();
  });

  it('leaves skills without a matching entry untouched', () => {
    const skills = [
      makeSkill({ name: 'changelog',     pluginName: 'docs' }),
      makeSkill({ name: 'find-dead-code', pluginName: 'code-audit' }),
    ];
    const ratings: RatingsMap = {
      'docs/changelog': { avg: 5, count: 1, reviews: [] },
    };

    mergeRatings(skills, ratings, { localOwner: LOCAL_OWNER, localRepo: LOCAL_REPO });

    expect(skills[0]!.rating).toBeDefined();
    expect(skills[1]!.rating).toBeUndefined();
  });

  it('uses `pluginName/skillName` as the lookup key, not just skillName', () => {
    // Two same-named skills in different plugins (same repo) get disambiguated.
    const a = makeSkill({ name: 'sync', pluginName: 'plugin-a' });
    const b = makeSkill({ name: 'sync', pluginName: 'plugin-b' });
    const ratings: RatingsMap = {
      'plugin-a/sync': { avg: 5, count: 1, reviews: [] },
    };

    mergeRatings([a, b], ratings, { localOwner: LOCAL_OWNER, localRepo: LOCAL_REPO });

    expect(a.rating).toBeDefined();
    expect(b.rating).toBeUndefined();
  });

  it('skips a malformed entry with a warning instead of throwing', () => {
    const skills = [makeSkill({ name: 'changelog', pluginName: 'docs' })];
    // Cast through unknown so the test can express the "field arrives wrong"
    // shape without lying to the compiler about the public RatingsMap type.
    const ratings = {
      'docs/changelog': { avg: 'four point five', count: 2 },
    } as unknown as RatingsMap;
    const warn = vi.fn();

    const result = mergeRatings(skills, ratings, {
      localOwner: LOCAL_OWNER,
      localRepo:  LOCAL_REPO,
      warn,
    });

    expect(result).toEqual({ merged: 0, skipped: 1 });
    expect(skills[0]!.rating).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toMatch(/docs\/changelog/);
  });

  it('is idempotent when called twice', () => {
    const skills = [makeSkill({ name: 'changelog', pluginName: 'docs' })];
    const ratings: RatingsMap = {
      'docs/changelog': { avg: 4.5, count: 2, reviews: [] },
    };

    mergeRatings(skills, ratings, { localOwner: LOCAL_OWNER, localRepo: LOCAL_REPO });
    const after_first = JSON.parse(JSON.stringify(skills[0]));
    mergeRatings(skills, ratings, { localOwner: LOCAL_OWNER, localRepo: LOCAL_REPO });
    const after_second = JSON.parse(JSON.stringify(skills[0]));

    expect(after_second).toEqual(after_first);
  });

  it('treats an empty ratings map as a no-op (no skills tagged)', () => {
    const skills = [makeSkill({ name: 'changelog', pluginName: 'docs' })];

    const result = mergeRatings(skills, {}, { localOwner: LOCAL_OWNER, localRepo: LOCAL_REPO });

    expect(result).toEqual({ merged: 0, skipped: 0 });
    expect(skills[0]!.rating).toBeUndefined();
  });
});
