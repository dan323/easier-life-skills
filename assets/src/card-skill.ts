import { titleCase, copyText } from './utils.ts';
import type { Skill }          from './types.ts';

let _openSkillPanel: ((skill: Skill) => void) | null = null;
export function setSkillPanelOpener(fn: (skill: Skill) => void): void { _openSkillPanel = fn; }

export function skillCard(skill: Skill, showSource: boolean): HTMLElement {
  const card = document.createElement('div');
  card.className = 'skill-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `Open details for skill ${skill.name}`);
  card.style.cursor = 'pointer';

  const catClass = skill.category ? 'badge-' + skill.category : 'badge-uncategorized';
  const catLabel = skill.category ? titleCase(skill.category) : 'Uncategorized';

  card.innerHTML = `
    <div class="card-header">
      <a class="card-name" href="${skill.rawSkillUrl}" target="_blank" rel="noopener">${skill.name}</a>
      <div class="card-badges">
        ${skill.readOnly ? '<span class="badge badge-readonly">read-only</span>' : ''}
        <span class="badge badge-cat ${catClass}">${catLabel}</span>
        ${showSource ? `<span class="badge badge-source">${skill._repo}</span>` : ''}
      </div>
    </div>
    <p class="card-desc">${skill.description}</p>
    <div class="card-install">
      <code>${skill.installCommand}</code>
      <button class="copy-btn" title="Copy install command" aria-label="Copy install command for ${skill.name}">Copy</button>
    </div>
  `;

  (card.querySelector('.copy-btn') as HTMLButtonElement).addEventListener('click', function (e) {
    e.stopPropagation();
    copyText(skill.installCommand, this);
  });
  (card.querySelector('.card-name') as HTMLAnchorElement).addEventListener('click', e => e.stopPropagation());

  const activate = (): void => { if (_openSkillPanel) _openSkillPanel(skill); };
  card.addEventListener('click', activate);
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
  });

  return card;
}
