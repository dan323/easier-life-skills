import { state }                                                                    from './state.ts';
import { pluginCard, skillCard, agentCard, mcpCard, bundleCard, titleCase }         from './components.ts';

const pluginsGrid = document.getElementById('plugins-grid') as HTMLElement;
const skillsGrid  = document.getElementById('skills-grid')  as HTMLElement;
const agentsGrid  = document.getElementById('agents-grid')  as HTMLElement;
const mcpGrid     = document.getElementById('mcp-grid')     as HTMLElement;
const bundlesGrid = document.getElementById('bundles-grid') as HTMLElement;
const filtersEl   = document.getElementById('filters')      as HTMLElement;
const countEl     = document.getElementById('count')        as HTMLElement;

export function render(): void {
  if      (state.view === 'plugins')    renderPlugins();
  else if (state.view === 'skills')     renderSkills();
  else if (state.view === 'agents')     renderAgents();
  else if (state.view === 'mcpServers') renderMcpServers();
  else                                  renderBundles();
}

export function renderPlugins(): void {
  const multiRepo = new Set(state.plugins.map(p => p._repo)).size > 1;

  const filtered = state.plugins.filter(plugin => {
    if (state.activeCategories.size && !state.activeCategories.has(plugin.category ?? '')) return false;
    if (!state.query) return true;
    return plugin.name.includes(state.query) || plugin.description.toLowerCase().includes(state.query);
  });

  countEl.textContent = `${filtered.length} of ${state.plugins.length} plugins`;

  if (!filtered.length) {
    pluginsGrid.innerHTML = '<div class="empty"><p>🔍</p><p>No plugins match your search</p></div>';
    return;
  }

  pluginsGrid.innerHTML = '';
  filtered.forEach(plugin => pluginsGrid.appendChild(pluginCard(plugin, multiRepo)));
}

export function renderSkills(): void {
  const multiRepo = new Set(state.skills.map(s => s._repo)).size > 1;

  const filtered = state.skills.filter(skill => {
    if (state.activeCategories.size && !state.activeCategories.has(skill.category ?? '')) return false;
    if (!state.query) return true;
    return (
      skill.name.includes(state.query) ||
      skill.description.toLowerCase().includes(state.query) ||
      (skill.keywords ?? []).some(k => k.includes(state.query))
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

export function renderAgents(): void {
  const multiRepo = new Set(state.agents.map(a => a._repo)).size > 1;

  const filtered = state.agents.filter(agent => {
    if (!state.query) return true;
    return agent.name.includes(state.query) || agent.description.toLowerCase().includes(state.query);
  });

  countEl.textContent = `${filtered.length} of ${state.agents.length} agents`;

  if (!filtered.length) {
    agentsGrid.innerHTML = '<div class="empty"><p>🤖</p><p>No agents found</p></div>';
    return;
  }

  agentsGrid.innerHTML = '';
  filtered.forEach(agent => agentsGrid.appendChild(agentCard(agent, multiRepo)));
}

export function renderMcpServers(): void {
  const multiRepo = new Set(state.mcpServers.map(m => m._repo)).size > 1;

  const filtered = state.mcpServers.filter(mcp => {
    if (!state.query) return true;
    return mcp.name.includes(state.query) || mcp.description.toLowerCase().includes(state.query);
  });

  countEl.textContent = `${filtered.length} of ${state.mcpServers.length} MCP servers`;

  if (!filtered.length) {
    mcpGrid.innerHTML = '<div class="empty"><p>🔌</p><p>No MCP servers found</p></div>';
    return;
  }

  mcpGrid.innerHTML = '';
  filtered.forEach(mcp => mcpGrid.appendChild(mcpCard(mcp, multiRepo)));
}

export function renderBundles(): void {
  countEl.textContent = `${state.bundles.length} bundles`;
  bundlesGrid.innerHTML = '';
  state.bundles.forEach(bundle => bundlesGrid.appendChild(bundleCard(bundle)));
}

export function rebuildFilters(): void {
  filtersEl.innerHTML = '';

  const source     = state.view === 'skills' ? state.skills : state.plugins;
  const categories = [...new Set(source.map(s => s.category).filter((c): c is string => c !== null && c !== undefined))].sort();

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
