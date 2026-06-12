import type { SkillsIndex } from './types.ts';

const RAW_BASE    = 'https://raw.githubusercontent.com';
const GITHUB_API  = 'https://api.github.com/repos';
const BRANCH      = 'master';

export async function fetchIndex(ownerRepo: string, builtin = false): Promise<SkillsIndex> {
  if (builtin) {
    // The builtin index is generated at deploy time and served same-origin
    // (it is not committed to the repo, so the raw.githubusercontent.com
    // fallback below 404s for it). Resolve relative to the page so this
    // works on any host — localhost, *.github.io subpaths, custom domains.
    try {
      const res = await fetch('skills_index.json');
      if (res.ok) return res.json() as Promise<SkillsIndex>;
    } catch { /* fall through to the raw fetch */ }
  }
  const url = `${RAW_BASE}/${ownerRepo}/${BRANCH}/skills_index.json`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} — could not load skills_index.json from ${ownerRepo}`);
  return res.json() as Promise<SkillsIndex>;
}

/**
 * Fetch the GitHub star count for a repository.
 * Returns `undefined` on any error (rate-limit, network failure, private repo).
 */
export async function fetchStars(ownerRepo: string): Promise<number | undefined> {
  try {
    const res = await fetch(`${GITHUB_API}/${ownerRepo}`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return undefined;
    const data = await res.json() as { stargazers_count?: number };
    return typeof data.stargazers_count === 'number' ? data.stargazers_count : undefined;
  } catch {
    return undefined;
  }
}
