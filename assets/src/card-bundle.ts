import { state }                    from './state.ts';
import { copyText, makeExpandable } from './utils.ts';
import type { Bundle, Skill }       from './types.ts';

const SKILL_LIMIT = 4;

export function bundleCard(bundle: Bundle): HTMLElement {
  const card = document.createElement('div');
  card.className = 'bundle-card';

  const bundleSkills = bundle.skills
    .map(name => state.skills.find(s => s.name === name))
    .filter((s): s is Skill => s !== undefined);

  const installBlock = bundleSkills
    .map(s => `/plugin install ${s.name}@${s.source.repo}`)
    .join('\n');

  card.innerHTML = `
    <div>
      <div class="bundle-name">${bundle.name}</div>
      <div class="bundle-desc">${bundle.description}</div>
    </div>
    <div class="bundle-skills"></div>
    <div class="bundle-install">
      <pre>${installBlock}</pre>
      <button class="bundle-copy-btn">Copy all</button>
    </div>
  `;

  makeExpandable(card.querySelector('.bundle-skills') as HTMLElement, bundleSkills, SKILL_LIMIT, skill => {
    const div = document.createElement('div');
    div.className = 'bundle-skill-item';
    div.textContent = skill.name;
    return div;
  });

  (card.querySelector('.bundle-copy-btn') as HTMLButtonElement).addEventListener('click', function () {
    copyText(installBlock, this);
  });

  return card;
}
