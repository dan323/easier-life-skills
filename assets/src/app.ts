import { state }                    from './state.ts';
import { loadMarketplace }          from './marketplace.ts';
import { render }                   from './render.ts';
import { copyText }                 from './utils.ts';
import { syncStateToUrl, readUrlState } from './url-state.ts';
import { BUILTIN_REPO }             from './constants.ts';
import './panel.ts';
import './entity-panel.ts';

type ViewKey = 'plugins' | 'skills' | 'agents' | 'mcpServers' | 'commands' | 'hooks' | 'bundles';

const VIEW_IDS: ViewKey[] = ['plugins', 'skills', 'agents', 'mcpServers', 'commands', 'hooks', 'bundles'];
const GRID_IDS: Record<ViewKey, string> = {
  plugins:    'plugins-grid',
  skills:     'skills-grid',
  agents:     'agents-grid',
  mcpServers: 'mcp-grid',
  commands:   'commands-grid',
  hooks:      'hooks-grid',
  bundles:    'bundles-grid',
};
const BTN_IDS: Record<ViewKey, string> = {
  plugins:    'view-plugins',
  skills:     'view-skills',
  agents:     'view-agents',
  mcpServers: 'view-mcp',
  commands:   'view-commands',
  hooks:      'view-hooks',
  bundles:    'view-bundles',
};

const searchEl = document.getElementById('search') as HTMLInputElement;
const sortBtn  = document.getElementById('sort-btn')  as HTMLButtonElement;

// ── Quick-start copy buttons ──

document.querySelectorAll<HTMLButtonElement>('.copy-btn[data-copy]').forEach(btn => {
  btn.addEventListener('click', () => copyText(btn.dataset['copy']!, btn));
});

// ── Search ──

searchEl.addEventListener('input', e => {
  state.query = (e.target as HTMLInputElement).value.toLowerCase();
  syncStateToUrl();
  render();
});

// ── Sort ──

function updateSortBtn(): void {
  sortBtn.textContent = state.sort === 'az' ? 'Sort: A→Z' : 'Sort: Z→A';
  sortBtn.title = state.sort === 'az' ? 'Click to sort Z→A' : 'Click to sort A→Z';
  sortBtn.setAttribute(
    'aria-label',
    state.sort === 'az'
      ? 'Currently sorted A to Z. Click to sort Z to A.'
      : 'Currently sorted Z to A. Click to sort A to Z.',
  );
}

sortBtn.addEventListener('click', () => {
  state.sort = state.sort === 'az' ? 'za' : 'az';
  updateSortBtn();
  syncStateToUrl();
  render();
});

// ── Keyboard shortcuts ──

document.addEventListener('keydown', e => {
  const tag = (e.target as Element).tagName;
  if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
    e.preventDefault();
    searchEl.focus();
    searchEl.select();
  }
});

// ── View toggle ──

VIEW_IDS.forEach(view => {
  (document.getElementById(BTN_IDS[view]) as HTMLButtonElement).addEventListener('click', () => switchView(view));
});

function switchView(view: ViewKey): void {
  state.view = view;
  VIEW_IDS.forEach(v => {
    const btn = document.getElementById(BTN_IDS[v]) as HTMLElement;
    btn.classList.toggle('active', v === view);
    btn.setAttribute('aria-pressed', String(v === view));
    (document.getElementById(GRID_IDS[v]) as HTMLElement).style.display = v === view ? 'grid' : 'none';
  });
  (document.getElementById('filters') as HTMLElement).style.display =
    (view === 'plugins' || view === 'skills') ? 'flex' : 'none';
  syncStateToUrl();
  render();
}

// ── Boot ──

void (async () => {
  const { view, query, repos, cats, sort } = readUrlState();

  state.query = query;
  state.sort  = sort;
  for (const repo of repos) state.activeRepos.add(repo);
  for (const cat  of cats)  state.activeCategories.add(cat);
  searchEl.value = query;
  updateSortBtn();

  await loadMarketplace(BUILTIN_REPO, true);

  switchView(VIEW_IDS.includes(view as ViewKey) ? view as ViewKey : 'plugins');
})();
