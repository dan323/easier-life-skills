import { state }           from './state.ts';
import { loadMarketplace } from './marketplace.ts';
import { render }          from './render.ts';
import { copyText }        from './components.ts';
import './panel.ts';

const BUILTIN_REPO = 'dan323/easier-life-skills';

type ViewKey = 'plugins' | 'skills' | 'agents' | 'mcpServers' | 'bundles';

const VIEW_IDS: ViewKey[] = ['plugins', 'skills', 'agents', 'mcpServers', 'bundles'];
const GRID_IDS: Record<ViewKey, string> = {
  plugins:    'plugins-grid',
  skills:     'skills-grid',
  agents:     'agents-grid',
  mcpServers: 'mcp-grid',
  bundles:    'bundles-grid',
};
const BTN_IDS: Record<ViewKey, string> = {
  plugins:    'view-plugins',
  skills:     'view-skills',
  agents:     'view-agents',
  mcpServers: 'view-mcp',
  bundles:    'view-bundles',
};

// ── Quick-start copy buttons ──

document.querySelectorAll<HTMLButtonElement>('.copy-btn[data-copy]').forEach(btn => {
  btn.addEventListener('click', () => copyText(btn.dataset['copy']!, btn));
});

// ── Search ──

(document.getElementById('search') as HTMLInputElement).addEventListener('input', e => {
  state.query = (e.target as HTMLInputElement).value.toLowerCase();
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
  render();
}

// ── Boot ──

void (async () => {
  await loadMarketplace(BUILTIN_REPO, true);
  switchView('plugins');
})();
