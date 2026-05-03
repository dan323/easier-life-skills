import { state }        from './state.ts';
import { pluginCard }   from './card-plugin.ts';
import { skillCard }    from './card-skill.ts';
import { agentCard }    from './card-agent.ts';
import { mcpCard }      from './card-mcp.ts';
import { commandCard }  from './card-command.ts';
import { bundleCard }   from './card-bundle.ts';

const pluginsGrid  = document.getElementById('plugins-grid')  as HTMLElement;
const skillsGrid   = document.getElementById('skills-grid')   as HTMLElement;
const agentsGrid   = document.getElementById('agents-grid')   as HTMLElement;
const mcpGrid      = document.getElementById('mcp-grid')      as HTMLElement;
const commandsGrid = document.getElementById('commands-grid') as HTMLElement;
const bundlesGrid  = document.getElementById('bundles-grid')  as HTMLElement;
const countEl      = document.getElementById('count')         as HTMLElement;

export function render(): void {
  if      (state.view === 'plugins')    renderPlugins();
  else if (state.view === 'skills')     renderSkills();
  else if (state.view === 'agents')     renderAgents();
  else if (state.view === 'mcpServers') renderMcpServers();
  else if (state.view === 'commands')   renderCommands();
  else                                  renderBundles();
}

function renderPlugins(): void {
  const multiRepo = new Set(state.plugins.map(p => p._repo)).size > 1;

  const filtered = state.plugins.filter(plugin => {
    if (state.activeRepos.size      && !state.activeRepos.has(plugin._repo ?? ''))      return false;
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

function renderSkills(): void {
  const multiRepo = new Set(state.skills.map(s => s._repo)).size > 1;

  const filtered = state.skills.filter(skill => {
    if (state.activeRepos.size      && !state.activeRepos.has(skill._repo ?? ''))           return false;
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

function renderAgents(): void {
  const multiRepo = new Set(state.agents.map(a => a._repo)).size > 1;

  const filtered = state.agents.filter(agent => {
    if (state.activeRepos.size && !state.activeRepos.has(agent._repo ?? '')) return false;
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

function renderMcpServers(): void {
  const multiRepo = new Set(state.mcpServers.map(m => m._repo)).size > 1;

  const filtered = state.mcpServers.filter(mcp => {
    if (state.activeRepos.size && !state.activeRepos.has(mcp._repo ?? '')) return false;
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

function renderCommands(): void {
  const multiRepo = new Set(state.commands.map(c => c._repo)).size > 1;

  const filtered = state.commands.filter(cmd => {
    if (state.activeRepos.size && !state.activeRepos.has(cmd._repo ?? '')) return false;
    if (!state.query) return true;
    return cmd.name.includes(state.query) || cmd.description.toLowerCase().includes(state.query);
  });

  countEl.textContent = `${filtered.length} of ${state.commands.length} commands`;

  if (!filtered.length) {
    commandsGrid.innerHTML = '<div class="empty"><p>⌨️</p><p>No commands found</p></div>';
    return;
  }

  commandsGrid.innerHTML = '';
  filtered.forEach(cmd => commandsGrid.appendChild(commandCard(cmd, multiRepo)));
}

function renderBundles(): void {
  countEl.textContent = `${state.bundles.length} bundles`;
  bundlesGrid.innerHTML = '';
  state.bundles.forEach(bundle => bundlesGrid.appendChild(bundleCard(bundle)));
}

