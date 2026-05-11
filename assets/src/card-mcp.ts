import { copyText }   from './utils.ts';
import type { McpServer } from './types.ts';

let _openMcpPanel: ((mcp: McpServer) => void) | null = null;
export function setMcpPanelOpener(fn: (mcp: McpServer) => void): void { _openMcpPanel = fn; }

export function mcpCard(mcp: McpServer, showSource: boolean): HTMLElement {
  const card = document.createElement('div');
  card.className = 'skill-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `Open details for MCP server ${mcp.name}`);
  card.style.cursor = 'pointer';

  card.innerHTML = `
    <div class="card-header">
      <span class="card-name">${mcp.name}</span>
      <div class="card-badges">
        <span class="badge badge-cat badge-database">MCP Server</span>
        ${showSource ? `<span class="badge badge-source">${mcp._repo}</span>` : ''}
      </div>
    </div>
    <p class="card-desc">${mcp.description}</p>
    <div class="card-install">
      <code>${mcp.installCommand}</code>
      <button class="copy-btn" title="Copy install command" aria-label="Copy install command for ${mcp.name}">Copy</button>
    </div>
  `;

  (card.querySelector('.copy-btn') as HTMLButtonElement).addEventListener('click', function (e) {
    e.stopPropagation();
    copyText(mcp.installCommand, this);
  });

  const activate = (): void => { if (_openMcpPanel) _openMcpPanel(mcp); };
  card.addEventListener('click', activate);
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
  });

  return card;
}
