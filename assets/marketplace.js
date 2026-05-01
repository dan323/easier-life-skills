/* marketplace.js — loads marketplace repos into state */

import { fetchIndex }              from './api.js';
import { state }                   from './state.js';
import { sourceTag }               from './components.js';
import { rebuildFilters, render }  from './render.js';

const sourcesEl = document.getElementById('marketplace-sources');

export async function loadMarketplace(ownerRepo, builtin = false) {
  // Show a loading tag while fetching
  const loadingTag = getOrCreateTag(ownerRepo, builtin);
  loadingTag.querySelector('.label').textContent = 'loading…';

  let index;
  try {
    index = await fetchIndex(ownerRepo, builtin);
  } catch (err) {
    loadingTag.querySelector('.label').textContent = `${ownerRepo} ✕`;
    loadingTag.classList.add('source-error');
    loadingTag.title = err.message;
    return false;
  }

  // Remove the temporary loading tag — we'll show per-source tags instead
  loadingTag.remove();

  state.plugins.push(...(index.plugins || []).map(p => ({ ...p, _repo: ownerRepo })));
  state.skills.push(...(index.skills || []).map(s => ({ ...s, _repo: ownerRepo })));
  state.agents.push(...(index.agents || []).map(a => ({ ...a, _repo: ownerRepo })));
  state.mcpServers.push(...(index.mcpServers || []).map(m => ({ ...m, _repo: ownerRepo })));
  state.bundles.push(...(index.bundles || []).map(b => ({ ...b, _repo: ownerRepo })));

  // Show one tag per source marketplace, with plugin count
  const countBySource = {};
  for (const plugin of index.plugins || []) {
    const key = `${plugin.source.owner}/${plugin.source.repo}`;
    countBySource[key] = (countBySource[key] || 0) + 1;
  }
  for (const [repo, count] of Object.entries(countBySource)) {
    const tag = getOrCreateTag(repo, repo === ownerRepo);
    tag.querySelector('.label').textContent = `${repo} (${count})`;
  }

  updateMeta(index.meta, ownerRepo);
  rebuildFilters();
  render();
  return true;
}

function getOrCreateTag(ownerRepo, builtin) {
  const existing = sourcesEl.querySelector(`[data-repo="${CSS.escape(ownerRepo)}"]`);
  if (existing) return existing;
  const tag = sourceTag(ownerRepo, builtin);
  sourcesEl.appendChild(tag);
  return tag;
}

function updateMeta(meta, ownerRepo) {
  document.getElementById('skill-count').textContent = state.plugins.length;

  if (meta?.generated) {
    document.getElementById('generated').textContent =
      new Date(meta.generated).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
