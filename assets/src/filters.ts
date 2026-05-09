import { state }           from './state.ts';
import { titleCase }       from './utils.ts';
import { render }          from './render.ts';
import { syncStateToUrl }  from './url-state.ts';

const filtersEl = document.getElementById('filters') as HTMLElement;

export function rebuildFilters(): void {
  filtersEl.innerHTML = '';

  const source   = state.view === 'skills' ? state.skills : state.plugins;
  const visible  = state.activeRepos.size ? source.filter(s => state.activeRepos.has(s._repo ?? '')) : source;
  const categories = [...new Set(visible.map(s => s.category).filter((c): c is string => c !== null && c !== undefined))].sort();

  for (const cat of state.activeCategories) {
    if (!categories.includes(cat)) state.activeCategories.delete(cat);
  }

  categories.forEach(cat => {
    const active = state.activeCategories.has(cat);
    const btn = document.createElement('button');
    btn.className = 'filter-btn' + (active ? ' active' : '');
    btn.textContent = titleCase(cat);
    btn.setAttribute('aria-pressed', String(active));
    btn.addEventListener('click', () => {
      if (state.activeCategories.has(cat)) state.activeCategories.delete(cat);
      else state.activeCategories.add(cat);
      const nowActive = state.activeCategories.has(cat);
      btn.classList.toggle('active', nowActive);
      btn.setAttribute('aria-pressed', String(nowActive));
      syncStateToUrl();
      render();
    });
    filtersEl.appendChild(btn);
  });
}
