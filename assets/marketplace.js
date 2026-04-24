/* marketplace.js — loads/removes repos, persists extras in localStorage */

import { fetchIndex }              from './api.js';
import { state }                   from './state.js';
import { sourceTag }               from './components.js';
import { rebuildFilters, render }  from './render.js';

const STORAGE_KEY = 'els-extra-repos';
const sourcesEl   = document.getElementById('marketplace-sources');

// ── Load a marketplace and merge its skills + bundles into state ──

export async function loadMarketplace(ownerRepo, builtin = false) {
  const tag = getOrCreateTag(ownerRepo, builtin);

  let index;
  try {
    index = await fetchIndex(ownerRepo);
  } catch (err) {
    tag.querySelector('.label').textContent = `${ownerRepo} ✕`;
    tag.classList.add('source-error');
    tag.title = err.message;
    return false;
  }

  // Merge — replace any previously loaded entries from this repo
  state.skills  = state.skills.filter(s => s._repo !== ownerRepo);
  state.bundles = state.bundles.filter(b => b._repo !== ownerRepo);

  state.skills.push(...index.skills.map(s => ({ ...s, _repo: ownerRepo })));
  state.bundles.push(...(index.bundles || []).map(b => ({ ...b, _repo: ownerRepo })));

  tag.querySelector('.label').textContent = `${ownerRepo} (${index.skills.length})`;

  updateMeta(index.meta, ownerRepo);
  rebuildFilters();
  render();
  return true;
}

// ── Remove a marketplace from state ──

export function removeMarketplace(ownerRepo) {
  state.skills  = state.skills.filter(s => s._repo !== ownerRepo);
  state.bundles = state.bundles.filter(b => b._repo !== ownerRepo);

  const saved = getSavedRepos().filter(r => r !== ownerRepo);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));

  document.getElementById('skill-count').textContent = state.skills.length;
  rebuildFilters();
  render();
}

// ── localStorage ──

export function getSavedRepos() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}

export function saveRepo(ownerRepo) {
  const saved = getSavedRepos().filter(r => r !== ownerRepo);
  saved.push(ownerRepo);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}

// ── Helpers ──

function getOrCreateTag(ownerRepo, builtin) {
  const existing = sourcesEl.querySelector(`[data-repo="${CSS.escape(ownerRepo)}"]`);
  if (existing) return existing;

  const tag = sourceTag(ownerRepo, builtin);
  sourcesEl.appendChild(tag);
  return tag;
}

function updateMeta(meta, ownerRepo) {
  document.getElementById('skill-count').textContent = state.skills.length;

  // Only update the "generated" date from the built-in repo
  if (ownerRepo === 'dan323/easier-life-skills') {
    document.getElementById('generated').textContent =
      new Date(meta.generated).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
