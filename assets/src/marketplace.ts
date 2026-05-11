import { fetchIndex }           from './api.ts';
import { state }                from './state.ts';
import { sourceTag }            from './source-tag.ts';
import { render }               from './render.ts';
import { rebuildFilters }       from './filters.ts';
import { syncStateToUrl }       from './url-state.ts';
import { copyText }             from './utils.ts';
import type { SkillsIndexMeta } from './types.ts';

const sourcesEl = document.getElementById('marketplace-sources') as HTMLElement;

export async function loadMarketplace(ownerRepo: string, builtin = false): Promise<boolean> {
  const loadingTag = getOrCreateTag(ownerRepo, builtin);
  loadingTag.label.textContent = 'loading…';

  let index;
  try {
    index = await fetchIndex(ownerRepo, builtin);
  } catch (err) {
    loadingTag.label.textContent = `${ownerRepo} ✕`;
    loadingTag.root.classList.add('source-error');
    loadingTag.root.title = (err as Error).message;
    return false;
  }

  loadingTag.root.remove();

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
    const tag = getOrCreateTag(repo, repo === ownerRepo && builtin);
    tag.label.textContent = `${repo} (${count})`;
    tag.copyBtn.hidden = false;
  }

  updateMeta(index.meta);
  rebuildFilters();
  render();
  return true;
}

function getOrCreateTag(ownerRepo: string, builtin: boolean): ReturnType<typeof sourceTag> {
  const existing = sourcesEl.querySelector(`[data-repo="${CSS.escape(ownerRepo)}"]`);
  if (existing) {
    return {
      root:    existing as HTMLElement,
      label:   existing.querySelector('.label')          as HTMLElement,
      copyBtn: existing.querySelector('.source-add-copy') as HTMLButtonElement,
    };
  }

  const tag = sourceTag(ownerRepo, builtin);
  const isActive = state.activeRepos.has(ownerRepo);
  tag.root.classList.toggle('active', isActive);
  tag.root.setAttribute('aria-pressed', String(isActive));

  const toggle = (): void => {
    if (state.activeRepos.has(ownerRepo)) state.activeRepos.delete(ownerRepo);
    else state.activeRepos.add(ownerRepo);
    const nowActive = state.activeRepos.has(ownerRepo);
    tag.root.classList.toggle('active', nowActive);
    tag.root.setAttribute('aria-pressed', String(nowActive));
    syncStateToUrl();
    rebuildFilters();
    render();
  };

  tag.root.addEventListener('click', e => {
    if ((e.target as HTMLElement).closest('.source-add-copy')) return;
    toggle();
  });
  tag.root.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  });

  tag.copyBtn.addEventListener('click', e => {
    e.stopPropagation();
    copyText(`/plugin marketplace add ${ownerRepo}`, tag.copyBtn);
  });

  sourcesEl.appendChild(tag.root);
  return tag;
}

function updateMeta(meta: SkillsIndexMeta | undefined): void {
  (document.getElementById('skill-count') as HTMLElement).textContent = String(state.plugins.length);
  if (meta?.generated) {
    (document.getElementById('generated') as HTMLElement).textContent =
      new Date(meta.generated).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
