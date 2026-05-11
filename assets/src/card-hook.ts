import { copyText } from './utils.ts';
import type { Hook } from './types.ts';

let _openHookPanel: ((hook: Hook) => void) | null = null;
export function setHookPanelOpener(fn: (hook: Hook) => void): void { _openHookPanel = fn; }

export function hookCard(hook: Hook, showSource: boolean): HTMLElement {
  const card = document.createElement('div');
  card.className = 'skill-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `Open details for hook ${hook.name}`);
  card.style.cursor = 'pointer';

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
      <button class="copy-btn" title="Copy install command" aria-label="Copy install command for ${hook.name}">Copy</button>
    </div>
  `;

  (card.querySelector('.copy-btn') as HTMLButtonElement).addEventListener('click', function (e) {
    e.stopPropagation();
    copyText(hook.installCommand, this);
  });
  (card.querySelector('.card-name') as HTMLAnchorElement).addEventListener('click', e => e.stopPropagation());

  const activate = (): void => { if (_openHookPanel) _openHookPanel(hook); };
  card.addEventListener('click', activate);
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
  });

  return card;
}
