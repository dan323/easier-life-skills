/* components.js — DOM builders for skill cards, bundle cards, and source tags */

import { state } from './state.js';
import { removeMarketplace } from './marketplace.js';

// ── Utility ──

export function titleCase(str) {
  return str.replace(/-/g, ' ').replace(/(^|\s)\w/g, c => c.toUpperCase());
}

export function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = original; btn.classList.remove('copied'); }, 1800);
  });
}

// ── Skill card ──

export function skillCard(skill, showSource) {
  const card = document.createElement('div');
  card.className = 'skill-card';

  const catClass = 'badge-' + skill.category;

  card.innerHTML = `
    <div class="card-header">
      <a class="card-name" href="${skill.rawSkillUrl}" target="_blank" rel="noopener">${skill.name}</a>
      <div class="card-badges">
        ${skill.readOnly ? '<span class="badge badge-readonly">read-only</span>' : ''}
        <span class="badge badge-cat ${catClass}">${titleCase(skill.category)}</span>
        ${showSource ? `<span class="badge badge-source">${skill._repo}</span>` : ''}
      </div>
    </div>
    <p class="card-desc">${skill.description}</p>
    <div class="card-install">
      <code>${skill.installCommand}</code>
      <button class="copy-btn" title="Copy install command">Copy</button>
    </div>
  `;

  card.querySelector('.copy-btn').addEventListener('click', function () {
    copyText(skill.installCommand, this);
  });

  return card;
}

// ── Bundle card ──

export function bundleCard(bundle) {
  const card = document.createElement('div');
  card.className = 'bundle-card';

  const repoName     = bundle._repo.split('/')[1] || bundle._repo;
  const bundleSkills = bundle.skills
    .map(name => state.skills.find(s => s.name === name && s._repo === bundle._repo))
    .filter(Boolean);

  const installBlock = bundle.skills
    .map(name => `/plugin install ${name}@${repoName}`)
    .join('\n');

  card.innerHTML = `
    <div>
      <div class="bundle-name">${bundle.name}</div>
      <div class="bundle-desc">${bundle.description}</div>
    </div>
    <div class="bundle-skills">
      ${bundleSkills.map(s => `<div class="bundle-skill-item">${s.name}</div>`).join('')}
    </div>
    <div class="bundle-install">
      <pre>${installBlock}</pre>
      <button class="bundle-copy-btn">Copy all</button>
    </div>
  `;

  card.querySelector('.bundle-copy-btn').addEventListener('click', function () {
    copyText(installBlock, this);
  });

  return card;
}

// ── Source tag (marketplace pill in the bar) ──

export function sourceTag(ownerRepo, builtin) {
  const tag = document.createElement('div');
  tag.className = 'source-tag' + (builtin ? ' builtin' : '');
  tag.dataset.repo = ownerRepo;

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = 'loading…';
  tag.appendChild(label);

  if (!builtin) {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.title = 'Remove marketplace';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      tag.remove();
      removeMarketplace(ownerRepo);
    });
    tag.appendChild(removeBtn);
  }

  return tag;
}
