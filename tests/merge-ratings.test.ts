/**
 * Unit tests for `scripts/lib/merge-ratings.ts`.
 *
 * Key format: `{kind}/{owner}/{repo}/{name}` — any entity type, any repo.
 */

import { describe, it, expect, vi } from 'vitest';
import { mergeRatings, type RatingsMap, type RatableEntity } from '../scripts/lib/merge-ratings.ts';

const OWNER = 'dan323';
const REPO  = 'easier-life-skills';

function makeEntity(name: string, owner = OWNER, repo = REPO): RatableEntity {
  return { name, source: { owner, repo } };
}

const sampleRating = {
  avg: 4.5, count: 2,
  reviews: [
    { stars: 5, body: 'great', author: 'octocat', date: '2026-05-10T00:00:00Z' },
    { stars: 4, body: 'good',  author: 'hubot',   date: '2026-05-11T00:00:00Z' },
  ],
};

describe('mergeRatings', () => {
  it('merges a well-formed rating onto a matching entity', () => {
    const skills = [makeEntity('changelog')];
    const ratings: RatingsMap = {
      [`skill/${OWNER}/${REPO}/changelog`]: sampleRating,
    };

    const result = mergeRatings(skills, 'skill', ratings);

    expect(result).toEqual({ merged: 1, skipped: 0 });
    expect(skills[0]!.rating).toEqual(sampleRating);
  });

  it('does not merge ratings from a different kind', () => {
    const agents = [makeEntity('changelog')];
    const ratings: RatingsMap = {
      [`skill/${OWNER}/${REPO}/changelog`]: sampleRating, // skill key, not agent
    };

    const result = mergeRatings(agents, 'agent', ratings);

    expect(result).toEqual({ merged: 0, skipped: 0 });
    expect(agents[0]!.rating).toBeUndefined();
  });

  it('merges ratings for external-repo entities', () => {
    const external = [makeEntity('workflow', 'mattpocock', 'skills')];
    const ratings: RatingsMap = {
      'skill/mattpocock/skills/workflow': sampleRating,
    };

    const result = mergeRatings(external, 'skill', ratings);

    expect(result).toEqual({ merged: 1, skipped: 0 });
    expect(external[0]!.rating).toEqual(sampleRating);
  });

  it('leaves entities without a matching entry untouched', () => {
    const entities = [makeEntity('changelog'), makeEntity('find-dead-code')];
    const ratings: RatingsMap = {
      [`skill/${OWNER}/${REPO}/changelog`]: sampleRating,
    };

    mergeRatings(entities, 'skill', ratings);

    expect(entities[0]!.rating).toBeDefined();
    expect(entities[1]!.rating).toBeUndefined();
  });

  it('skips a malformed entry with a warning instead of throwing', () => {
    const entities = [makeEntity('changelog')];
    const ratings = {
      [`skill/${OWNER}/${REPO}/changelog`]: { avg: 'four point five', count: 2 },
    } as unknown as RatingsMap;
    const warn = vi.fn();

    const result = mergeRatings(entities, 'skill', ratings, warn);

    expect(result).toEqual({ merged: 0, skipped: 1 });
    expect(entities[0]!.rating).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toMatch(`skill/${OWNER}/${REPO}/changelog`);
  });

  it('is idempotent when called twice', () => {
    const entities = [makeEntity('changelog')];
    const ratings: RatingsMap = {
      [`skill/${OWNER}/${REPO}/changelog`]: sampleRating,
    };

    mergeRatings(entities, 'skill', ratings);
    const afterFirst = JSON.parse(JSON.stringify(entities[0]));
    mergeRatings(entities, 'skill', ratings);

    expect(JSON.parse(JSON.stringify(entities[0]))).toEqual(afterFirst);
  });

  it('treats an empty ratings map as a no-op', () => {
    const entities = [makeEntity('changelog')];

    const result = mergeRatings(entities, 'skill', {});

    expect(result).toEqual({ merged: 0, skipped: 0 });
    expect(entities[0]!.rating).toBeUndefined();
  });

  it('merges plugin ratings using the plugin kind key', () => {
    const plugins = [makeEntity('docs')];
    const ratings: RatingsMap = {
      [`plugin/${OWNER}/${REPO}/docs`]: sampleRating,
    };

    const result = mergeRatings(plugins, 'plugin', ratings);

    expect(result).toEqual({ merged: 1, skipped: 0 });
    expect(plugins[0]!.rating).toEqual(sampleRating);
  });
});
