/* app.js — easier-life-skills catalog */
(async () => {
  // ── Load data ──
  let index;
  try {
    const res = await fetch('./skills_index.json');
    index = await res.json();
  } catch {
    document.getElementById('skills-grid').innerHTML =
      '<p class="empty"><span>⚠️</span><br>Could not load skills_index.json</p>';
    return;
  }

  const { skills, bundles, meta } = index;

  // ── State ──
  let query = '';
  let activeCategories = new Set();
  let view = 'skills'; // 'skills' | 'bundles'

  // ── DOM refs ──
  const searchEl     = document.getElementById('search');
  const filtersEl    = document.getElementById('filters');
  const skillsGrid   = document.getElementById('skills-grid');
  const bundlesGrid  = document.getElementById('bundles-grid');
  const countEl      = document.getElementById('count');
  const viewSkillBtn = document.getElementById('view-skills');
  const viewBundBtn  = document.getElementById('view-bundles');

  // ── Populate meta ──
  document.getElementById('skill-count').textContent = skills.length;
  document.getElementById('generated').textContent =
    new Date(meta.generated).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  // ── Category filter buttons ──
  const categories = [...new Set(skills.map(s => s.category))].sort();
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.cat = cat;
    btn.textContent = titleCase(cat);
    btn.addEventListener('click', () => {
      if (activeCategories.has(cat)) activeCategories.delete(cat);
      else activeCategories.add(cat);
      btn.classList.toggle('active', activeCategories.has(cat));
      render();
    });
    filtersEl.appendChild(btn);
  });

  // ── Search ──
  searchEl.addEventListener('input', e => { query = e.target.value.toLowerCase(); render(); });

  // ── View toggle ──
  viewSkillBtn.addEventListener('click', () => switchView('skills'));
  viewBundBtn.addEventListener('click', () => switchView('bundles'));

  function switchView(v) {
    view = v;
    viewSkillBtn.classList.toggle('active', v === 'skills');
    viewBundBtn.classList.toggle('active', v === 'bundles');
    skillsGrid.style.display = v === 'skills' ? 'grid' : 'none';
    bundlesGrid.style.display = v === 'bundles' ? 'grid' : 'none';
    filtersEl.style.display = v === 'skills' ? 'flex' : 'none';
    render();
  }

  // ── Render ──
  function render() {
    if (view === 'skills') renderSkills();
    else renderBundles();
  }

  function renderSkills() {
    const filtered = skills.filter(s => {
      if (activeCategories.size && !activeCategories.has(s.category)) return false;
      if (!query) return true;
      return (
        s.name.includes(query) ||
        s.description.toLowerCase().includes(query) ||
        s.keywords.some(k => k.includes(query))
      );
    });

    countEl.textContent = `${filtered.length} of ${skills.length} skills`;

    if (!filtered.length) {
      skillsGrid.innerHTML = '<div class="empty"><p>🔍</p><p>No skills match your search</p></div>';
      return;
    }

    skillsGrid.innerHTML = '';
    filtered.forEach(skill => skillsGrid.appendChild(skillCard(skill)));
  }

  function renderBundles() {
    countEl.textContent = `${bundles.length} bundles`;
    bundlesGrid.innerHTML = '';
    bundles.forEach(bundle => bundlesGrid.appendChild(bundleCard(bundle)));
  }

  // ── Skill card ──
  function skillCard(skill) {
    const card = document.createElement('div');
    card.className = 'skill-card';

    const installCmd = skill.installCommand;
    const catClass = 'badge-' + skill.category;

    card.innerHTML = `
      <div class="card-header">
        <a class="card-name" href="${skill.rawSkillUrl}" target="_blank" rel="noopener">${skill.name}</a>
        <div class="card-badges">
          ${skill.readOnly ? '<span class="badge badge-readonly">read-only</span>' : ''}
          <span class="badge badge-cat ${catClass}">${titleCase(skill.category)}</span>
        </div>
      </div>
      <p class="card-desc">${skill.description}</p>
      <div class="card-install">
        <code>${installCmd}</code>
        <button class="copy-btn" title="Copy install command">Copy</button>
      </div>
    `;

    card.querySelector('.copy-btn').addEventListener('click', function () {
      copyText(installCmd, this);
    });

    return card;
  }

  // ── Bundle card ──
  function bundleCard(bundle) {
    const card = document.createElement('div');
    card.className = 'bundle-card';

    const bundleSkills = bundle.skills
      .map(name => skills.find(s => s.name === name))
      .filter(Boolean);

    const installBlock = bundle.skills
      .map(name => `/plugin install ${name}@${meta.repo}`)
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

  // ── Copy helper ──
  function copyText(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = original; btn.classList.remove('copied'); }, 1800);
    });
  }

  // ── Util ──
  function titleCase(str) {
    return str.replace(/-/g, ' ').replace(/(^|\s)\w/g, c => c.toUpperCase());
  }

  // ── Init ──
  switchView('skills');
})();
