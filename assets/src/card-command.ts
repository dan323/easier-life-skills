import { copyText }   from './utils.ts';
import type { Command } from './types.ts';

let _openCommandPanel: ((cmd: Command) => void) | null = null;
export function setCommandPanelOpener(fn: (cmd: Command) => void): void { _openCommandPanel = fn; }

export function commandCard(cmd: Command, showSource: boolean): HTMLElement {
  const card = document.createElement('div');
  card.className = 'skill-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `Open details for command ${cmd.name}`);
  card.style.cursor = 'pointer';

  card.innerHTML = `
    <div class="card-header">
      <a class="card-name" href="${cmd.rawCommandUrl}" target="_blank" rel="noopener">${cmd.name}</a>
      <div class="card-badges">
        <span class="badge badge-cat badge-automation">Command</span>
        ${showSource ? `<span class="badge badge-source">${cmd._repo}</span>` : ''}
      </div>
    </div>
    <p class="card-desc">${cmd.description || '—'}</p>
    <div class="card-install">
      <code>${cmd.installCommand}</code>
      <button class="copy-btn" title="Copy install command" aria-label="Copy install command for ${cmd.name}">Copy</button>
    </div>
  `;

  (card.querySelector('.copy-btn') as HTMLButtonElement).addEventListener('click', function (e) {
    e.stopPropagation();
    copyText(cmd.installCommand, this);
  });
  (card.querySelector('.card-name') as HTMLAnchorElement).addEventListener('click', e => e.stopPropagation());

  const activate = (): void => { if (_openCommandPanel) _openCommandPanel(cmd); };
  card.addEventListener('click', activate);
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
  });

  return card;
}
