import { fetchIndex }           from './api.ts';
import { state }                from './state.ts';
import { sourceTag }            from './source-tag.ts';
import { render }               from './render.ts';
import { rebuildFilters }       from './filters.ts';
import { syncStateToUrl }       from './url-state.ts';
import type { SkillsIndexMeta } from './types.ts';

const sourcesEl = document.getElementById('marketplace-sources') as HTMLElement;

export async function loadMarketplace(ownerRepo: string, builtin = false): Promise<boolean> {
  const loadingTag = getOrCreateTag(ownerRepo, builtin);
  (loadingTag.querySelector('.label') as HTMLElement).textContent = 'loading…';

  let index;
  try {
    index = await fetchIndex(ownerRepo, builtin);
  } catch (err) {
    (loadingTag.querySelector('.label') as HTMLElement).textContent = `${ownerRepo} ✕`;
    loadingTag.classList.add('source-error');
    loadingTag.title = (err as Error).message;
    return false;
  }

  loadingTag.remove();

  const sourceKey = (s: { owner: string; repo: string }) => `${s.owner}/${s.repo}`;
  state.plugins.push(...(index.plugins    ?? []).map(p => ({ ...p, _repo: sourceKey(p.source) })));
  state.skills.push(...(index.skills      ?? []).map(s => ({ ...s, _repo: sourceKey(s.source) })));
  state.agents.push(...(index.agents      ?? []).map(a => ({ ...a, _repo: sourceKey(a.source) })));
  state.mcpServers.push(...(index.mcpServers ?? []).map(m => ({ ...m, _repo: sourceKey(m.source) })));
  state.commands.push(...(index.commands  ?? []).map(c => ({ ...c, _repo: sourceKey(c.source) })));
  state.hooks.push(...(index.hooks        ?? []).map(h => ({ ...h, _repo: sourceKey(h.source) })));
  state.bundles.push(...(index.bundles    ?? []).map(b => ({ ...b, _repo: ownerRepo })));

  const countBySource: Record<string, number> = {};
  for (const plugin of index.plugins ?? []) {
    const key = `${plugin.source.owner}/${plugin.source.repo}`;
    countBySource[key] = (countBySource[key] ?? 0) + 1;
  }
  for (const [repo, count] of Object.entries(countBySource)) {
    const tag = getOrCreateTag(repo, repo === ownerRepo);
    (tag.querySelector('.label') as HTMLElement).textContent = `${repo} (${count})`;
  }

  updateMeta(index.meta);
  rebuildFilters();
  render();
  return true;
}

function getOrCreateTag(ownerRepo: string, builtin: boolean): HTMLElement {
  const existing = sourcesEl.querySelector(`[data-repo="${CSS.escape(ownerRepo)}"]`);
  if (existing) return existing as HTMLElement;
  const tag = sourceTag(ownerRepo, builtin);
  const isActive = state.activeRepos.has(ownerRepo);
  tag.classList.toggle('active', isActive);
  tag.setAttribute('aria-pressed', String(isActive));
  tag.addEventListener('click', () => {
    if (state.activeRepos.has(ownerRepo)) state.activeRepos.delete(ownerRepo);
    else state.activeRepos.add(ownerRepo);
    const nowActive = state.activeRepos.has(ownerRepo);
    tag.classList.toggle('active', nowActive);
    tag.setAttribute('aria-pressed', String(nowActive));
    syncStateToUrl();
    rebuildFilters();
    render();
  });
  sourcesEl.appendChild(tag);
  return tag;
}

function updateMeta(meta: SkillsIndexMeta | undefined): void {
  (document.getElementById('skill-count') as HTMLElement).textContent = String(state.plugins.length);
  if (meta?.generated) {
    (document.getElementById('generated') as HTMLElement).textContent =
      new Date(meta.generated).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
