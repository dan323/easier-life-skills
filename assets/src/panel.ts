import { state }                           from './state.ts';
import { copyText, titleCase }             from './utils.ts';
import { setPluginPanelOpener }            from './card-plugin.ts';
import { skillCard }                       from './card-skill.ts';
import { agentCard }                       from './card-agent.ts';
import { mcpCard }                         from './card-mcp.ts';
import { commandCard }                     from './card-command.ts';
import type { Plugin, Skill, Agent, McpServer, Command } from './types.ts';

setPluginPanelOpener(openPluginPanel);

const panel    = document.getElementById('plugin-panel')  as HTMLElement;
const overlay  = document.getElementById('panel-overlay') as HTMLElement;
const closeBtn = document.getElementById('panel-close')   as HTMLButtonElement;

overlay.addEventListener('click',  closePanel);
closeBtn.addEventListener('click', closePanel);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });

function openPluginPanel(plugin: Plugin): void {
  const nameEl = document.getElementById('panel-name') as HTMLAnchorElement;
  nameEl.textContent = plugin.name;
  nameEl.href        = plugin.homepage ?? '#';
  nameEl.target      = plugin.homepage ? '_blank' : '';

  const catEl = document.getElementById('panel-category') as HTMLElement;
  catEl.textContent = plugin.category ? titleCase(plugin.category) : 'Uncategorized';
  catEl.className   = `badge badge-cat badge-${plugin.category ?? 'uncategorized'}`;

  const hasDesc    = plugin.description.trim().length > 0;
  const pluginUrl  = plugin.homepage ?? `https://github.com/${plugin.source.owner}/${plugin.source.repo}`;
  const promptText = `Explain to me what I would find in plugin ${pluginUrl} and what would it be used for`;

  const descEl = document.getElementById('panel-desc') as HTMLElement;
  descEl.textContent   = plugin.description;
  descEl.style.display = hasDesc ? '' : 'none';

  const promptEl = document.getElementById('panel-prompt') as HTMLElement;
  promptEl.style.display = hasDesc ? 'none' : '';
  (document.getElementById('panel-prompt-text') as HTMLElement).textContent = promptText;
  const promptCopyBtn = document.getElementById('panel-prompt-copy') as HTMLButtonElement;
  promptCopyBtn.onclick = () => copyText(promptText, promptCopyBtn);

  renderCardSection<Skill>(
    'panel-skills-section', 'panel-skills-list', 'panel-skills-count',
    plugin.skills
      .map(n => state.skills.find(s => s.name === n && s._repo === plugin._repo))
      .filter((s): s is Skill => s !== undefined),
    item => skillCard(item, false),
  );

  renderCardSection<Agent>(
    'panel-agents-section', 'panel-agents-list', 'panel-agents-count',
    plugin.agents
      .map(n => state.agents.find(a => a.name === n && a._repo === plugin._repo))
      .filter((a): a is Agent => a !== undefined),
    item => agentCard(item, false),
  );

  renderCardSection<McpServer>(
    'panel-mcp-section', 'panel-mcp-list', 'panel-mcp-count',
    plugin.mcpServers
      .map(n => state.mcpServers.find(m => m.name === n && m._repo === plugin._repo))
      .filter((m): m is McpServer => m !== undefined),
    item => mcpCard(item, false),
  );

  renderCardSection<Command>(
    'panel-commands-section', 'panel-commands-list', 'panel-commands-count',
    (plugin.commands ?? [])
      .map(n => state.commands.find(c => c.name === n && c._repo === plugin._repo))
      .filter((c): c is Command => c !== undefined),
    item => commandCard(item, false),
  );

  const bundles        = state.bundles.filter(b => plugin.skills.some(s => b.skills.includes(s)));
  const bundlesEl      = document.getElementById('panel-bundles-list')    as HTMLElement;
  const bundlesSection = document.getElementById('panel-bundles-section') as HTMLElement;
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

  (document.getElementById('panel-install-cmd') as HTMLElement).textContent = plugin.installCommand;
  const installCopyBtn = document.getElementById('panel-install-copy') as HTMLButtonElement;
  installCopyBtn.onclick = () => copyText(plugin.installCommand, installCopyBtn);

  panel.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closePanel(): void {
  panel.classList.remove('open');
  document.body.style.overflow = '';
}

function renderCardSection<T>(
  sectionId: string,
  listId: string,
  countId: string,
  items: T[],
  cardBuilder: (item: T) => HTMLElement,
): void {
  const section = document.getElementById(sectionId) as HTMLElement;
  const list    = document.getElementById(listId)    as HTMLElement;
  const count   = document.getElementById(countId)   as HTMLElement;

  if (!items.length) { section.style.display = 'none'; return; }
  section.style.display = '';
  count.textContent = String(items.length);
  list.innerHTML = '';
  items.forEach(item => list.appendChild(cardBuilder(item)));
}
