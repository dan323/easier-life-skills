import { copyText } from './utils.ts';
import type { Hook } from './types.ts';

export function hookCard(hook: Hook, showSource: boolean): HTMLElement {
  const card = document.createElement('div');
  card.className = 'skill-card';

  const eventChips = hook.events.length
    ? hook.events.map(e => `<span class="chip chip-hook">${e}</span>`).join('')
    : '<span class="chip chip-hook">—</span>';

  card.innerHTML = `
    <div class="card-header">
      <a class="card-name" href="${hook.rawHookUrl}" target="_blank" rel="noopener">${hook.name}</a>
      <div class="card-badges">
        <span class="badge badge-cat badge-automation">Hook</span>
        ${showSource ? `<span class="badge badge-source">${hook._repo}</span>` : ''}
      </div>
    </div>
    <p class="card-desc">${hook.description || '—'}</p>
    <div class="card-chips">${eventChips}</div>
    <div class="card-install">
      <code>${hook.installCommand}</code>
      <button class="copy-btn" title="Copy install command">Copy</button>
    </div>
  `;

  (card.querySelector('.copy-btn') as HTMLButtonElement).addEventListener('click', function () {
    copyText(hook.installCommand, this);
  });

  return card;
}
