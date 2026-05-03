import { state }                    from './state.ts';
import { loadMarketplace }          from './marketplace.ts';
import { render }                   from './render.ts';
import { copyText }                 from './utils.ts';
import { syncStateToUrl, readUrlState } from './url-state.ts';
import './panel.ts';

const BUILTIN_REPO = 'dan323/easier-life-skills';

type ViewKey = 'plugins' | 'skills' | 'agents' | 'mcpServers' | 'commands' | 'bundles';

const VIEW_IDS: ViewKey[] = ['plugins', 'skills', 'agents', 'mcpServers', 'commands', 'bundles'];
const GRID_IDS: Record<ViewKey, string> = {
  plugins:    'plugins-grid',
  skills:     'skills-grid',
  agents:     'agents-grid',
  mcpServers: 'mcp-grid',
  commands:   'commands-grid',
  bundles:    'bundles-grid',
};
const BTN_IDS: Record<ViewKey, string> = {
  plugins:    'view-plugins',
  skills:     'view-skills',
  agents:     'view-agents',
  mcpServers: 'view-mcp',
  commands:   'view-commands',
  bundles:    'view-bundles',
};

const searchEl = document.getElementById('search') as HTMLInputElement;

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

// ── View toggle ──

VIEW_IDS.forEach(view => {
  (document.getElementById(BTN_IDS[view]) as HTMLButtonElement).addEventListener('click', () => switchView(view));
});

function switchView(view: ViewKey): void {
  state.view = view;
  VIEW_IDS.forEach(v => {
    (document.getElementById(BTN_IDS[v]) as HTMLElement).classList.toggle('active', v === view);
    (document.getElementById(GRID_IDS[v]) as HTMLElement).style.display = v === view ? 'grid' : 'none';
  });
  (document.getElementById('filters') as HTMLElement).style.display =
    (view === 'plugins' || view === 'skills') ? 'flex' : 'none';
  syncStateToUrl();
  render();
}

// ── Boot ──

void (async () => {
  const { view, query, repos, cats } = readUrlState();

  state.query = query;
  for (const repo of repos) state.activeRepos.add(repo);
  for (const cat  of cats)  state.activeCategories.add(cat);
  searchEl.value = query;

  await loadMarketplace(BUILTIN_REPO, true);

  switchView(VIEW_IDS.includes(view as ViewKey) ? view as ViewKey : 'plugins');
})();
