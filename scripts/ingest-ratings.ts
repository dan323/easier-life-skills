#!/usr/bin/env node
// scripts/ingest-ratings.ts — Phase 5 of the Skill Rating & Review System (issue #7)
//
// Queries the GitHub GraphQL API for all Discussions in the "Ratings" category,
// parses each structured form body, and rewrites ratings.json.
//
// Keys: `{entityType}/{owner}/{repo}/{name}`  e.g. `skill/dan323/easier-life-skills/changelog`
// Any entity type (skill, agent, plugin, hook, command, mcp-server, bundle) from
// any repo can be rated — no local-only restriction.
//
// Run in CI via pages.yml before `npm run build`. Can also be run locally:
//   GITHUB_TOKEN=<pat> npx tsx scripts/ingest-ratings.ts
//
// Fail-soft: a missing token, missing category, or API error warns and leaves
// ratings.json unchanged so the build never breaks.

import { readFileSync, writeFileSync } from 'fs';
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

const CATEGORY_NAME = 'Ratings';
const GH_API        = 'https://api.github.com/graphql';
const token         = process.env['GITHUB_TOKEN'];

// Valid entity types as they appear in the form dropdown.
// 'mcp-server' is the form value; ingest normalises it to 'mcpServer' for the key.
const VALID_TYPES = new Set(['skill', 'agent', 'plugin', 'hook', 'command', 'mcp-server', 'bundle']);

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
// Step 1: resolve the "Ratings" Discussion category ID by name
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

  return data.repository.discussionCategories.nodes
    .find(n => n.name === CATEGORY_NAME)?.id ?? null;
}

// ---------------------------------------------------------------------------
// Step 2: paginate all discussions in the category
// ---------------------------------------------------------------------------

interface DiscussionNode {
  author:    { login: string } | null;
  createdAt: string;
  body:      string;
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
            nodes { author { login } createdAt body }
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
  entityType: string;
  entityName: string;
  entityRepo: string;
  stars:      number;
}

// GitHub Discussion forms render each field as:
//   ### Label
//
//   value
//
// Empty optional fields render as "_No response_".
function parseBody(raw: string): ParsedReview | null {
  const sections: Record<string, string> = {};
  for (const part of raw.split(/\n(?=### )/)) {
    const nl = part.indexOf('\n');
    if (nl === -1) continue;
    const label = part.slice(4, nl).trim().toLowerCase();
    const value = part.slice(nl + 1).trim();
    sections[label] = value === '_no response_' ? '' : value;
  }

  const entityType = sections['entity type']?.trim().toLowerCase() ?? '';
  const entityName = sections['entity name']?.trim().toLowerCase() ?? '';
  const entityRepo = sections['entity repo']?.trim().toLowerCase() ?? '';
  const starsRaw   = sections['stars']?.trim() ?? '';

  if (!entityType || !entityName || !entityRepo) return null;
  if (!VALID_TYPES.has(entityType)) return null;

  // Validate repo is in owner/repo format
  if (!/^[^/]+\/[^/]+$/.test(entityRepo)) return null;

  const stars = parseInt(starsRaw, 10);
  if (isNaN(stars) || stars < 1 || stars > 5) return null;

  return { entityType, entityName, entityRepo, stars };
}

// Normalise the form's entity type to the key format used in ratings.json.
// The form uses 'mcp-server' (human-readable); the key uses 'mcpServer'.
function normaliseType(t: string): string {
  return t === 'mcp-server' ? 'mcpServer' : t;
}

// ---------------------------------------------------------------------------
// Step 4: aggregate and write ratings.json
// ---------------------------------------------------------------------------

function aggregate(
  discussions: DiscussionNode[],
  warn: (msg: string) => void,
): Record<string, Rating> {
  // byKey[key][author] = most-recent review for that author on that entity
  const byKey = new Map<string, Map<string, Review>>();

  for (const disc of discussions) {
    const parsed = parseBody(disc.body);
    if (!parsed) {
      warn(`⚠ Could not parse discussion body — skipping`);
      continue;
    }

    // Re-parse body to also grab the optional review text
    const sections: Record<string, string> = {};
    for (const part of disc.body.split(/\n(?=### )/)) {
      const nl = part.indexOf('\n');
      if (nl === -1) continue;
      const label = part.slice(4, nl).trim().toLowerCase();
      const value = part.slice(nl + 1).trim();
      sections[label] = value === '_no response_' ? '' : value;
    }

    const kind   = normaliseType(parsed.entityType);
    const [owner, repo] = parsed.entityRepo.split('/') as [string, string];
    const key    = `${kind}/${owner}/${repo}/${parsed.entityName}`;
    const author = disc.author?.login ?? 'anonymous';

    if (!byKey.has(key)) byKey.set(key, new Map());
    // Last submission per author wins (discussions are fetched ASC by date)
    byKey.get(key)!.set(author, {
      stars:  parsed.stars,
      body:   sections['review'] ?? '',
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
  const categoryId = await findCategoryId();
  if (!categoryId) {
    console.warn(`⚠ Discussion category "${CATEGORY_NAME}" not found in ${LOCAL_OWNER}/${LOCAL_REPO} — skipping ingest`);
    console.warn('  Create it in the repo Settings → Discussions → Categories, then re-run.');
    process.exit(0);
  }
  console.log(`✓ Found category "${CATEGORY_NAME}" (${categoryId})`);

  const discussions = await fetchDiscussions(categoryId);
  console.log(`✓ Fetched ${discussions.length} discussion(s)`);

  const warn = (msg: string) => console.warn(msg);
  const ratings = aggregate(discussions, warn);
  writeRatings(ratings);

  const count = Object.keys(ratings).length;
  console.log(`✓ ratings.json — ${count} entity rating(s) written`);
} catch (err) {
  console.warn(`⚠ Ratings ingest failed: ${(err as Error).message}`);
  console.warn('  ratings.json left unchanged');
  process.exit(0);
}
