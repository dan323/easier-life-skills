import { titleCase, copyText, makeExpandable } from './utils.ts';
import type { Plugin }                          from './types.ts';

const CHIP_LIMIT = 5;

interface Chip { cls: string; text: string; }

let _openPluginPanel: ((plugin: Plugin) => void) | null = null;
export function setPluginPanelOpener(fn: (plugin: Plugin) => void): void { _openPluginPanel = fn; }

export function pluginCard(plugin: Plugin, showSource: boolean): HTMLElement {
  const card = document.createElement('div');
  card.className = 'skill-card';

  const catClass = plugin.category ? 'badge-' + plugin.category : 'badge-uncategorized';
  const catLabel = plugin.category ? titleCase(plugin.category) : 'Uncategorized';
  const nameEl   = plugin.homepage
    ? `<a class="card-name" href="${plugin.homepage}" target="_blank" rel="noopener">${plugin.name}</a>`
    : `<span class="card-name">${plugin.name}</span>`;

  const allChips: Chip[] = [
    ...plugin.skills.map(n         => ({ cls: 'chip-skill',   text: `skill: ${n}` })),
    ...plugin.agents.map(n         => ({ cls: 'chip-agent',   text: `agent: ${n}` })),
    ...plugin.mcpServers.map(n     => ({ cls: 'chip-mcp',     text: `mcp: ${n}`   })),
    ...(plugin.commands ?? []).map(n => ({ cls: 'chip-command', text: `cmd: ${n}` })),
  ];

  card.innerHTML = `
    <div class="card-header">
      ${nameEl}
      <div class="card-badges">
        <span class="badge badge-cat ${catClass}">${catLabel}</span>
        ${showSource ? `<span class="badge badge-source">${plugin._repo}</span>` : ''}
      </div>
    </div>
    <p class="card-desc">${plugin.description}</p>
    ${allChips.length ? `<div class="plugin-chips"></div>` : ''}
    <div class="card-install">
      <code>${plugin.installCommand}</code>
      <button class="copy-btn" title="Copy install command">Copy</button>
    </div>
  `;

  if (allChips.length) {
    const chipsEl = card.querySelector('.plugin-chips') as HTMLElement;
    makeExpandable(chipsEl, allChips, CHIP_LIMIT, ({ cls, text }) => {
      const span = document.createElement('span');
      span.className = `chip ${cls}`;
      span.textContent = text;
      return span;
    });
  }

  (card.querySelector('.copy-btn') as HTMLButtonElement).addEventListener('click', function (e) {
    e.stopPropagation();
    copyText(plugin.installCommand, this);
  });

  card.addEventListener('click', () => { if (_openPluginPanel) _openPluginPanel(plugin); });
  card.style.cursor = 'pointer';

  return card;
}
