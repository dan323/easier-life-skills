import { copyText }   from './utils.ts';
import type { Command } from './types.ts';

export function commandCard(cmd: Command, showSource: boolean): HTMLElement {
  const card = document.createElement('div');
  card.className = 'skill-card';

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
      <button class="copy-btn" title="Copy install command">Copy</button>
    </div>
  `;

  (card.querySelector('.copy-btn') as HTMLButtonElement).addEventListener('click', function () {
    copyText(cmd.installCommand, this);
  });

  return card;
}
