/* render.js — renders the skill grid, bundle grid, and category filters */

import { state }                    from './state.js';
import { skillCard, bundleCard, titleCase } from './components.js';

const skillsGrid  = document.getElementById('skills-grid');
const bundlesGrid = document.getElementById('bundles-grid');
const filtersEl   = document.getElementById('filters');
const countEl     = document.getElementById('count');

export function render() {
  if (state.view === 'skills') renderSkills();
  else renderBundles();
}

export function renderSkills() {
  const multiRepo = new Set(state.skills.map(s => s._repo)).size > 1;

  const filtered = state.skills.filter(skill => {
    if (state.activeCategories.size && !state.activeCategories.has(skill.category)) return false;
    if (!state.query) return true;
    return (
      skill.name.includes(state.query) ||
      skill.description.toLowerCase().includes(state.query) ||
      (skill.keywords || []).some(k => k.includes(state.query))
    );
  });

  countEl.textContent = `${filtered.length} of ${state.skills.length} skills`;

  if (!filtered.length) {
    skillsGrid.innerHTML = '<div class="empty"><p>🔍</p><p>No skills match your search</p></div>';
    return;
  }

  skillsGrid.innerHTML = '';
  filtered.forEach(skill => skillsGrid.appendChild(skillCard(skill, multiRepo)));
}

export function renderBundles() {
  countEl.textContent = `${state.bundles.length} bundles`;
  bundlesGrid.innerHTML = '';
  state.bundles.forEach(bundle => bundlesGrid.appendChild(bundleCard(bundle)));
}

export function rebuildFilters() {
  filtersEl.innerHTML = '';

  const categories = [...new Set(state.skills.map(s => s.category))].sort();

  // Drop active categories that no longer exist
  for (const cat of state.activeCategories) {
    if (!categories.includes(cat)) state.activeCategories.delete(cat);
  }

  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn' + (state.activeCategories.has(cat) ? ' active' : '');
    btn.textContent = titleCase(cat);
    btn.addEventListener('click', () => {
      if (state.activeCategories.has(cat)) state.activeCategories.delete(cat);
      else state.activeCategories.add(cat);
      btn.classList.toggle('active', state.activeCategories.has(cat));
      render();
    });
    filtersEl.appendChild(btn);
  });
}
