import { copyText } from './utils.ts';
import type { Agent } from './types.ts';

let _openAgentPanel: ((agent: Agent) => void) | null = null;
export function setAgentPanelOpener(fn: (agent: Agent) => void): void { _openAgentPanel = fn; }

export function agentCard(agent: Agent, showSource: boolean): HTMLElement {
  const card = document.createElement('div');
  card.className = 'skill-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `Open details for agent ${agent.name}`);
  card.style.cursor = 'pointer';

  const bgBadge = agent.background ? '<span class="badge badge-readonly">background</span>' : '';

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
    <div class="card-install">
      <code>${agent.installCommand}</code>
      <button class="copy-btn" title="Copy install command" aria-label="Copy install command for ${agent.name}">Copy</button>
    </div>
  `;

  (card.querySelector('.copy-btn') as HTMLButtonElement).addEventListener('click', function (e) {
    e.stopPropagation();
    copyText(agent.installCommand, this);
  });
  (card.querySelector('.card-name') as HTMLAnchorElement).addEventListener('click', e => e.stopPropagation());

  const activate = (): void => { if (_openAgentPanel) _openAgentPanel(agent); };
  card.addEventListener('click', activate);
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
  });

  return card;
}
