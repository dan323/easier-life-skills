import { fetchIndex }           from './api.ts';
import { state }                from './state.ts';
import { sourceTag }            from './source-tag.ts';
import { render }               from './render.ts';
import { rebuildFilters }       from './filters.ts';
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

  state.plugins.push(...(index.plugins   ?? []).map(p => ({ ...p, _repo: ownerRepo })));
  state.skills.push(...(index.skills     ?? []).map(s => ({ ...s, _repo: ownerRepo })));
  state.agents.push(...(index.agents     ?? []).map(a => ({ ...a, _repo: ownerRepo })));
  state.mcpServers.push(...(index.mcpServers ?? []).map(m => ({ ...m, _repo: ownerRepo })));
  state.commands.push(...(index.commands  ?? []).map(c => ({ ...c, _repo: ownerRepo })));
  state.bundles.push(...(index.bundles   ?? []).map(b => ({ ...b, _repo: ownerRepo })));

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
