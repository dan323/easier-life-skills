#!/usr/bin/env node
// scripts/ingest-ratings.ts — Phase 5 of the Skill Rating & Review System (issue #7)
//
// Queries the GitHub GraphQL API for all Discussions in the "Skill Reviews"
// category of the local marketplace repo, parses the structured form bodies,
// aggregates per-skill ratings, and rewrites ratings.json.
//
// Designed to run in CI (pages.yml) before npm run build, using the
// GITHUB_TOKEN that Actions injects automatically. Can also be run locally
// with a personal access token:
//   GITHUB_TOKEN=<pat> npx tsx scripts/ingest-ratings.ts
//
// Fail-soft: a missing token, missing category, or GraphQL error prints a
// warning and leaves ratings.json unchanged so the build never breaks.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface MarketplaceEntry { owner: string; repo: string; }
const marketplaces = JSON.parse(
  readFileSync(join(ROOT, 'marketplaces.json'), 'utf8'),
) as MarketplaceEntry[];
const LOCAL_OWNER = marketplaces[0]!.owner;
const LOCAL_REPO  = marketplaces[0]!.repo;

const CATEGORY_NAME = 'Skill Reviews';
const GH_API        = 'https://api.github.com/graphql';
const token         = process.env['GITHUB_TOKEN'];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Review  { stars: number; body: string; author: string; date: string; }
interface Rating  { avg: number; count: number; reviews: Review[]; }
interface RatingsFile {
  _comment: string;
  _schema:  unknown;
  ratings:  Record<string, Rating>;
}

// ---------------------------------------------------------------------------
// Build skillName → pluginName map from local plugins/
// ---------------------------------------------------------------------------

function buildSkillMap(): Map<string, string> {
  const map = new Map<string, string>();
  const pluginsDir = join(ROOT, 'plugins');
  if (!existsSync(pluginsDir)) return map;

  for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pluginJsonPath = join(pluginsDir, entry.name, '.claude-plugin', 'plugin.json');
    if (!existsSync(pluginJsonPath)) continue;
    const pluginJson = JSON.parse(readFileSync(pluginJsonPath, 'utf8')) as { name?: string };
    const pluginName = pluginJson.name ?? entry.name;

    const skillsDir = join(pluginsDir, entry.name, 'skills');
    if (!existsSync(skillsDir)) continue;
    for (const skill of readdirSync(skillsDir, { withFileTypes: true })) {
      if (skill.isDirectory()) map.set(skill.name.toLowerCase(), pluginName);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// GraphQL helpers
// ---------------------------------------------------------------------------

async function gql(query: string, variables: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(GH_API, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent':   'easier-life-skills/ingest-ratings',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  const json = await res.json() as { data?: unknown; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('; '));
  return json.data;
}

// ---------------------------------------------------------------------------
// Step 1: resolve the "Skill Reviews" category ID
// ---------------------------------------------------------------------------

async function findCategoryId(): Promise<string | null> {
  const data = await gql(`
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        discussionCategories(first: 25) {
          nodes { id name }
        }
      }
    }
  `, { owner: LOCAL_OWNER, repo: LOCAL_REPO }) as {
    repository: { discussionCategories: { nodes: { id: string; name: string }[] } }
  };

  const cat = data.repository.discussionCategories.nodes
    .find(n => n.name === CATEGORY_NAME);
  return cat?.id ?? null;
}

// ---------------------------------------------------------------------------
// Step 2: paginate all discussions in the category
// ---------------------------------------------------------------------------

interface DiscussionNode {
  author: { login: string } | null;
  createdAt: string;
  body: string;
}

async function fetchDiscussions(categoryId: string): Promise<DiscussionNode[]> {
  const all: DiscussionNode[] = [];
  let cursor: string | null = null;

  for (;;) {
    const data = await gql(`
      query($owner: String!, $repo: String!, $catId: ID!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
          discussions(
            first: 100
            after: $cursor
            categoryId: $catId
            orderBy: { field: CREATED_AT, direction: ASC }
          ) {
            pageInfo { hasNextPage endCursor }
            nodes {
              author { login }
              createdAt
              body
            }
          }
        }
      }
    `, { owner: LOCAL_OWNER, repo: LOCAL_REPO, catId: categoryId, cursor }) as {
      repository: {
        discussions: {
          pageInfo: { hasNextPage: boolean; endCursor: string };
          nodes: DiscussionNode[];
        }
      }
    };

    const page = data.repository.discussions;
    all.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }

  return all;
}

// ---------------------------------------------------------------------------
// Step 3: parse a Discussion form body
// ---------------------------------------------------------------------------

interface ParsedReview {
  skillName: string;
  stars:     number;
  body:      string;
}

// GitHub Discussion forms render each field as:
//   ### Label
//
//   value
//
// Empty optional fields render as "_No response_".
function parseBody(raw: string): ParsedReview | null {
  const sections: Record<string, string> = {};

  // Split on lines starting with "### "
  const parts = raw.split(/\n(?=### )/);
  for (const part of parts) {
    const headerEnd = part.indexOf('\n');
    if (headerEnd === -1) continue;
    const label = part.slice(4, headerEnd).trim().toLowerCase();
    const value = part.slice(headerEnd + 1).trim();
    sections[label] = value === '_no response_' ? '' : value;
  }

  const skillName = sections['skill name']?.trim().toLowerCase() ?? '';
  const starsRaw  = sections['stars']?.trim() ?? '';
  const reviewBody = sections['review']?.trim() ?? '';

  if (!skillName) return null;

  const stars = parseInt(starsRaw, 10);
  if (isNaN(stars) || stars < 1 || stars > 5) return null;

  return { skillName, stars, body: reviewBody };
}

// ---------------------------------------------------------------------------
// Step 4: aggregate and write ratings.json
// ---------------------------------------------------------------------------

function aggregate(
  discussions: DiscussionNode[],
  skillMap: Map<string, string>,
): Record<string, Rating> {
  // Collect reviews grouped by key, deduplicating by author (last wins)
  const byKey = new Map<string, Map<string, Review>>();

  for (const disc of discussions) {
    const parsed = parseBody(disc.body);
    if (!parsed) {
      console.warn(`⚠ Could not parse discussion body — skipping`);
      continue;
    }

    const pluginName = skillMap.get(parsed.skillName);
    if (!pluginName) {
      // v1 intentionally limits ratings to local-marketplace skills only.
      // External skills (mattpocock/skills, anthropics/skills, etc.) are not ratable yet.
      console.warn(`⚠ Skill "${parsed.skillName}" not found in local plugins — skipping (external skills are not ratable in v1)`);
      continue;
    }

    const key    = `${pluginName}/${parsed.skillName}`;
    const author = disc.author?.login ?? 'anonymous';

    if (!byKey.has(key)) byKey.set(key, new Map());
    byKey.get(key)!.set(author, {
      stars:  parsed.stars,
      body:   parsed.body,
      author,
      date:   disc.createdAt,
    });
  }

  const ratings: Record<string, Rating> = {};
  for (const [key, authorMap] of byKey) {
    const reviews = [...authorMap.values()];
    const avg = Math.round((reviews.reduce((s, r) => s + r.stars, 0) / reviews.length) * 10) / 10;
    ratings[key] = { avg, count: reviews.length, reviews };
  }
  return ratings;
}

function writeRatings(ratings: Record<string, Rating>): void {
  const existing = JSON.parse(
    readFileSync(join(ROOT, 'ratings.json'), 'utf8'),
  ) as RatingsFile;

  existing.ratings = ratings;
  writeFileSync(join(ROOT, 'ratings.json'), JSON.stringify(existing, null, 2) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (!token) {
  console.warn('⚠ GITHUB_TOKEN not set — skipping ratings ingest, ratings.json unchanged');
  process.exit(0);
}

try {
  const skillMap = buildSkillMap();
  console.log(`✓ Found ${skillMap.size} local skills`);

  const categoryId = await findCategoryId();
  if (!categoryId) {
    console.warn(`⚠ Discussion category "${CATEGORY_NAME}" not found in ${LOCAL_OWNER}/${LOCAL_REPO} — skipping ingest`);
    console.warn('  Create it in the repo Settings → Discussions → Categories, then re-run.');
    process.exit(0);
  }
  console.log(`✓ Found category "${CATEGORY_NAME}" (${categoryId})`);

  const discussions = await fetchDiscussions(categoryId);
  console.log(`✓ Fetched ${discussions.length} discussion(s)`);

  const ratings = aggregate(discussions, skillMap);
  writeRatings(ratings);

  const count = Object.keys(ratings).length;
  console.log(`✓ ratings.json — ${count} skill(s) with ratings`);
} catch (err) {
  console.warn(`⚠ Ratings ingest failed: ${(err as Error).message}`);
  console.warn('  ratings.json left unchanged');
  process.exit(0);
}
