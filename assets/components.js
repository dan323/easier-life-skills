/* components.js — DOM builders for skill cards, bundle cards, and source tags */

import { state } from './state.js';

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

// ── Plugin card ──

let _openPluginPanel = null;
export function setPluginPanelOpener(fn) { _openPluginPanel = fn; }

export function pluginCard(plugin, showSource) {
  const card = document.createElement('div');
  card.className = 'skill-card';

  const catClass = plugin.category ? 'badge-' + plugin.category : 'badge-uncategorized';
  const catLabel = plugin.category ? titleCase(plugin.category) : 'Uncategorized';
  const nameEl   = plugin.homepage
    ? `<a class="card-name" href="${plugin.homepage}" target="_blank" rel="noopener">${plugin.name}</a>`
    : `<span class="card-name">${plugin.name}</span>`;

  const chips = [
    ...plugin.skills.map(n     => `<span class="chip chip-skill">skill: ${n}</span>`),
    ...plugin.agents.map(n     => `<span class="chip chip-agent">agent: ${n}</span>`),
    ...plugin.mcpServers.map(n => `<span class="chip chip-mcp">mcp: ${n}</span>`),
  ].join('');

  card.innerHTML = `
    <div class="card-header">
      ${nameEl}
      <div class="card-badges">
        <span class="badge badge-cat ${catClass}">${catLabel}</span>
        ${showSource ? `<span class="badge badge-source">${plugin._repo}</span>` : ''}
      </div>
    </div>
    <p class="card-desc">${plugin.description}</p>
    ${chips ? `<div class="plugin-chips">${chips}</div>` : ''}
    <div class="card-install">
      <code>${plugin.installCommand}</code>
      <button class="copy-btn" title="Copy install command">Copy</button>
    </div>
  `;

  card.querySelector('.copy-btn').addEventListener('click', function (e) {
    e.stopPropagation();
    copyText(plugin.installCommand, this);
  });

  card.addEventListener('click', () => { if (_openPluginPanel) _openPluginPanel(plugin); });
  card.style.cursor = 'pointer';

  return card;
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

// ── Agent card ──

export function agentCard(agent, showSource) {
  const card = document.createElement('div');
  card.className = 'skill-card';

  const toolList = (agent.tools || []).join(', ') || '—';
  const bgBadge  = agent.background ? '<span class="badge badge-readonly">background</span>' : '';

  card.innerHTML = `
    <div class="card-header">
      <a class="card-name" href="${agent.rawAgentUrl}" target="_blank" rel="noopener">${agent.name}</a>
      <div class="card-badges">
        ${bgBadge}
        <span class="badge badge-cat badge-automation">Agent</span>
        ${showSource ? `<span class="badge badge-source">${agent._repo}</span>` : ''}
      </div>
    </div>
    <p class="card-desc">${agent.description}</p>
    <p class="card-desc" style="font-size:0.78rem;color:var(--text-muted)">Tools: ${toolList}</p>
    <div class="card-install">
      <code>${agent.installCommand}</code>
      <button class="copy-btn" title="Copy install command">Copy</button>
    </div>
  `;

  card.querySelector('.copy-btn').addEventListener('click', function () {
    copyText(agent.installCommand, this);
  });

  return card;
}

// ── MCP Server card ──

export function mcpCard(mcp, showSource) {
  const card = document.createElement('div');
  card.className = 'skill-card';

  card.innerHTML = `
    <div class="card-header">
      <span class="card-name">${mcp.name}</span>
      <div class="card-badges">
        <span class="badge badge-cat badge-database">MCP Server</span>
        ${showSource ? `<span class="badge badge-source">${mcp._repo}</span>` : ''}
      </div>
    </div>
    <p class="card-desc">${mcp.description}</p>
    ${mcp.command ? `<p class="card-desc" style="font-size:0.78rem;color:var(--text-muted)">Command: <code>${mcp.command}</code></p>` : ''}
    <div class="card-install">
      <code>${mcp.installCommand}</code>
      <button class="copy-btn" title="Copy install command">Copy</button>
    </div>
  `;

  card.querySelector('.copy-btn').addEventListener('click', function () {
    copyText(mcp.installCommand, this);
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

  return tag;
}
