import { copyText }   from './utils.ts';
import type { McpServer } from './types.ts';

export function mcpCard(mcp: McpServer, showSource: boolean): HTMLElement {
  const card = document.createElement('div');
  card.className = 'skill-card';

  card.innerHTML = `
    <div class="card-header">
      <span class="card-name">${mcp.name}</span>
      <div class="card-badges">
        <span class="badge badge-cat badge-database">MCP Server</span>
        ${showSource ? `<span class="badge badge-source">${mcp._repo}</span>` : ''}
      </div>
    </div>
    <p class="card-desc">${mcp.description}</p>
    ${mcp.command ? `<p class="card-desc" style="font-size:0.78rem;color:var(--text-muted)">Command: <code>${mcp.command}</code></p>` : ''}
    <div class="card-install">
      <code>${mcp.installCommand}</code>
      <button class="copy-btn" title="Copy install command">Copy</button>
    </div>
  `;

  (card.querySelector('.copy-btn') as HTMLButtonElement).addEventListener('click', function () {
    copyText(mcp.installCommand, this);
  });

  return card;
}
