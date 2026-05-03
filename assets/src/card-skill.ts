import { titleCase, copyText } from './utils.ts';
import type { Skill }          from './types.ts';

export function skillCard(skill: Skill, showSource: boolean): HTMLElement {
  const card = document.createElement('div');
  card.className = 'skill-card';

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
      <button class="copy-btn" title="Copy install command">Copy</button>
    </div>
  `;

  (card.querySelector('.copy-btn') as HTMLButtonElement).addEventListener('click', function () {
    copyText(skill.installCommand, this);
  });

  return card;
}
