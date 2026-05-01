/* app.js — boot and event wiring */

import { state }             from './state.js';
import { loadMarketplace }   from './marketplace.js';
import { render }            from './render.js';
import { copyText }          from './components.js';
import './panel.js';

const BUILTIN_REPO = 'dan323/easier-life-skills';

const VIEW_IDS = ['plugins', 'skills', 'agents', 'mcpServers', 'bundles'];
const GRID_IDS = {
  plugins:    'plugins-grid',
  skills:     'skills-grid',
  agents:     'agents-grid',
  mcpServers: 'mcp-grid',
  bundles:    'bundles-grid',
};
const BTN_IDS = {
  plugins:    'view-plugins',
  skills:     'view-skills',
  agents:     'view-agents',
  mcpServers: 'view-mcp',
  bundles:    'view-bundles',
};

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

VIEW_IDS.forEach(view => {
  document.getElementById(BTN_IDS[view]).addEventListener('click', () => switchView(view));
});

function switchView(view) {
  state.view = view;
  VIEW_IDS.forEach(v => {
    document.getElementById(BTN_IDS[v]).classList.toggle('active', v === view);
    document.getElementById(GRID_IDS[v]).style.display = v === view ? 'grid' : 'none';
  });
  document.getElementById('filters').style.display = (view === 'plugins' || view === 'skills') ? 'flex' : 'none';
  render();
}

// ── Boot ──

(async () => {
  await loadMarketplace(BUILTIN_REPO, true);
  switchView('plugins');
})();
