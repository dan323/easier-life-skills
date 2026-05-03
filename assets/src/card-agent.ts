import { copyText } from './utils.ts';
import type { Agent } from './types.ts';

export function agentCard(agent: Agent, showSource: boolean): HTMLElement {
  const card = document.createElement('div');
  card.className = 'skill-card';

  const toolList = agent.tools.join(', ') || '—';
  const bgBadge  = agent.background ? '<span class="badge badge-readonly">background</span>' : '';

  card.innerHTML = `
    <div class="card-header">
      <a class="card-name" href="${agent.rawAgentUrl}" target="_blank" rel="noopener">${agent.name}</a>
      <div class="card-badges">
        ${bgBadge}
        <span class="badge badge-cat badge-automation">Agent</span>
        ${showSource ? `<span class="badge badge-source">${agent._repo}</span>` : ''}
      </div>
    </div>
    <p class="card-desc">${agent.description}</p>
    <p class="card-desc" style="font-size:0.78rem;color:var(--text-muted)">Tools: ${toolList}</p>
    <div class="card-install">
      <code>${agent.installCommand}</code>
      <button class="copy-btn" title="Copy install command">Copy</button>
    </div>
  `;

  (card.querySelector('.copy-btn') as HTMLButtonElement).addEventListener('click', function () {
    copyText(agent.installCommand, this);
  });

  return card;
}
