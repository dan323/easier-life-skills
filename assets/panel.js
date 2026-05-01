/* panel.js — plugin detail drawer */

import { state }   from './state.js';
import { copyText, titleCase, setPluginPanelOpener, skillCard, agentCard, mcpCard } from './components.js';

setPluginPanelOpener(openPluginPanel);

const panel    = document.getElementById('plugin-panel');
const overlay  = document.getElementById('panel-overlay');
const closeBtn = document.getElementById('panel-close');

overlay.addEventListener('click',  closePanel);
closeBtn.addEventListener('click', closePanel);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });

export function openPluginPanel(plugin) {
  document.getElementById('panel-name').textContent     = plugin.name;
  document.getElementById('panel-name').href            = plugin.homepage || '#';
  document.getElementById('panel-name').target          = plugin.homepage ? '_blank' : '';
  document.getElementById('panel-category').textContent = plugin.category ? titleCase(plugin.category) : 'Uncategorized';
  document.getElementById('panel-category').className   = `badge badge-cat badge-${plugin.category || 'uncategorized'}`;

  // Description — if missing, show a copyable prompt instead
  const hasDesc = plugin.description && plugin.description.trim().length > 0;
  const pluginUrl = plugin.homepage || `https://github.com/${plugin.source.owner}/${plugin.source.repo}`;
  const promptText = `Explain to me what I would find in plugin ${pluginUrl} and what would it be used for`;

  document.getElementById('panel-desc').textContent   = plugin.description || '';
  document.getElementById('panel-desc').style.display = hasDesc ? '' : 'none';

  const promptEl = document.getElementById('panel-prompt');
  promptEl.style.display = hasDesc ? 'none' : '';
  document.getElementById('panel-prompt-text').textContent = promptText;
  document.getElementById('panel-prompt-copy').onclick = function () { copyText(promptText, this); };

  // Skills
  renderCardSection(
    'panel-skills-section', 'panel-skills-list', 'panel-skills-count',
    plugin.skills.map(n => state.skills.find(s => s.name === n && s._repo === plugin._repo)).filter(Boolean),
    item => skillCard(item, false)
  );

  // Agents
  renderCardSection(
    'panel-agents-section', 'panel-agents-list', 'panel-agents-count',
    plugin.agents.map(n => state.agents.find(a => a.name === n && a._repo === plugin._repo)).filter(Boolean),
    item => agentCard(item, false)
  );

  // MCP Servers
  renderCardSection(
    'panel-mcp-section', 'panel-mcp-list', 'panel-mcp-count',
    plugin.mcpServers.map(n => state.mcpServers.find(m => m.name === n && m._repo === plugin._repo)).filter(Boolean),
    item => mcpCard(item, false)
  );

  // Bundles this plugin's skills appear in
  const bundles = state.bundles.filter(b =>
    plugin.skills.some(s => b.skills.includes(s))
  );
  const bundlesEl = document.getElementById('panel-bundles-list');
  const bundlesSection = document.getElementById('panel-bundles-section');
  if (bundles.length) {
    bundlesEl.innerHTML = bundles.map(b => `
      <div class="panel-bundle-item">
        <span class="panel-bundle-name">${b.name}</span>
        <span class="panel-bundle-desc">${b.description}</span>
      </div>
    `).join('');
    bundlesSection.style.display = '';
  } else {
    bundlesSection.style.display = 'none';
  }

  // Install command
  document.getElementById('panel-install-cmd').textContent = plugin.installCommand;
  document.getElementById('panel-install-copy').onclick = function () {
    copyText(plugin.installCommand, this);
  };

  panel.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closePanel() {
  panel.classList.remove('open');
  document.body.style.overflow = '';
}

function renderCardSection(sectionId, listId, countId, items, cardBuilder) {
  const section = document.getElementById(sectionId);
  const list    = document.getElementById(listId);
  const count   = document.getElementById(countId);

  if (!items.length) { section.style.display = 'none'; return; }
  section.style.display = '';
  count.textContent = items.length;
  list.innerHTML = '';
  items.forEach(item => list.appendChild(cardBuilder(item)));
}
