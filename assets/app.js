/* app.js — boot and event wiring */

import { state }                           from './state.js';
import { loadMarketplace, getSavedRepos, saveRepo } from './marketplace.js';
import { render }                          from './render.js';
import { copyText }                        from './components.js';

const BUILTIN_REPO = 'dan323/easier-life-skills';

// ── Quick-start copy buttons ──

document.querySelectorAll('.copy-btn[data-copy]').forEach(btn => {
  btn.addEventListener('click', () => copyText(btn.dataset.copy, btn));
});

// ── Search ──

document.getElementById('search').addEventListener('input', e => {
  state.query = e.target.value.toLowerCase();
  render();
});

// ── View toggle ──

document.getElementById('view-skills').addEventListener('click',  () => switchView('skills'));
document.getElementById('view-bundles').addEventListener('click', () => switchView('bundles'));

function switchView(view) {
  state.view = view;
  document.getElementById('view-skills').classList.toggle('active',  view === 'skills');
  document.getElementById('view-bundles').classList.toggle('active', view === 'bundles');
  document.getElementById('skills-grid').style.display   = view === 'skills'  ? 'grid' : 'none';
  document.getElementById('bundles-grid').style.display  = view === 'bundles' ? 'grid' : 'none';
  document.getElementById('filters').style.display       = view === 'skills'  ? 'flex' : 'none';
  render();
}

// ── Add marketplace ──

document.getElementById('repo-add-btn').addEventListener('click', addRepo);
document.getElementById('repo-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') addRepo();
});

async function addRepo() {
  const input = document.getElementById('repo-input');
  const raw   = input.value.trim();
  if (!raw) return;

  // Accept "owner/repo" or full GitHub URLs
  const match = raw.match(/(?:github\.com\/)?([^/\s]+\/[^/\s]+)/);
  if (!match) {
    input.setCustomValidity('Enter owner/repo');
    input.reportValidity();
    return;
  }
  input.setCustomValidity('');

  const ownerRepo = match[1].replace(/\.git$/, '');
  input.value = '';

  // Skip if already loaded
  const alreadyLoaded = document.querySelector(`[data-repo="${CSS.escape(ownerRepo)}"]`);
  if (alreadyLoaded) return;

  const ok = await loadMarketplace(ownerRepo, false);
  if (ok) saveRepo(ownerRepo);
}

// ── Boot ──

(async () => {
  await loadMarketplace(BUILTIN_REPO, true);

  for (const repo of getSavedRepos()) {
    await loadMarketplace(repo, false);
  }

  switchView('skills');
})();
