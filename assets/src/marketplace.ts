import { fetchIndex, fetchStars } from './api.ts';
import type { Plugin, Skill, Agent, McpServer, Command, Hook, Bundle, SkillsIndexMeta } from './types.ts';
import type { SourceItem } from './components/MarketplaceBar.tsx';

export interface LoadedMarketplace {
  plugins:    Plugin[];
  skills:     Skill[];
  agents:     Agent[];
  mcpServers: McpServer[];
  commands:   Command[];
  hooks:      Hook[];
  bundles:    Bundle[];
  sources:    SourceItem[];
  meta?:      SkillsIndexMeta;
}

const sourceKey = (s: { owner: string; repo: string }) => `${s.owner}/${s.repo}`;

export async function loadMarketplace(ownerRepo: string, builtin = false): Promise<LoadedMarketplace | { error: string; repo: string; builtin: boolean }> {
  let index;
  try {
    index = await fetchIndex(ownerRepo, builtin);
  } catch (err) {
    return { error: (err as Error).message, repo: ownerRepo, builtin };
  }

  const plugins    = (index.plugins    ?? []).map(p => ({ ...p, _repo: sourceKey(p.source) }));
  const skills     = (index.skills     ?? []).map(s => ({ ...s, _repo: sourceKey(s.source) }));
  const agents     = (index.agents     ?? []).map(a => ({ ...a, _repo: sourceKey(a.source) }));
  const mcpServers = (index.mcpServers ?? []).map(m => ({ ...m, _repo: sourceKey(m.source) }));
  const commands   = (index.commands   ?? []).map(c => ({ ...c, _repo: sourceKey(c.source) }));
  const hooks      = (index.hooks      ?? []).map(h => ({ ...h, _repo: sourceKey(h.source) }));
  const bundles    = (index.bundles    ?? []).map(b => ({ ...b, _repo: ownerRepo }));

  const countBySource = new Map<string, number>();
  for (const p of plugins) {
    countBySource.set(p._repo!, (countBySource.get(p._repo!) ?? 0) + 1);
  }

  const sources: SourceItem[] = [...countBySource.entries()].map(([repo, count]) => ({
    repo,
    count,
    builtin: repo === ownerRepo && builtin,
  }));

  return { plugins, skills, agents, mcpServers, commands, hooks, bundles, sources, meta: index.meta };
}

/**
 * Fetch GitHub star counts for a list of source items sequentially and return
 * a new array with the `stars` field populated. Items that fail to fetch
 * (rate-limited, private, etc.) keep `stars: undefined`.
 *
 * Sequential rather than parallel to stay well within the unauthenticated
 * rate limit (60 req/hr). Skips enrichment entirely when there are more
 * than 10 sources to avoid bursting the limit on large marketplaces.
 */
export async function enrichSourcesWithStars(sources: SourceItem[]): Promise<SourceItem[]> {
  if (sources.length > 10) return sources;
  const results: SourceItem[] = [];
  for (const s of sources) {
    const stars = await fetchStars(s.repo);
    results.push({ ...s, stars });
  }
  return results;
}
