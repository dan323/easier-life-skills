import { state }                          from './state.ts';
import { copyText, titleCase }            from './utils.ts';
import { setSkillPanelOpener }            from './card-skill.ts';
import { setAgentPanelOpener }            from './card-agent.ts';
import { setMcpPanelOpener }              from './card-mcp.ts';
import { setCommandPanelOpener }          from './card-command.ts';
import { setHookPanelOpener }             from './card-hook.ts';
import { BUILTIN_REPO }                   from './constants.ts';
import type { Skill, Agent, McpServer, Command, Hook } from './types.ts';

type EntityKind = 'skill' | 'agent' | 'mcpServer' | 'command' | 'hook';

interface KindMeta {
  label:     string;
  badgeCls:  string;
  nameHref:  (e: any) => string | null;
}

const KIND_META: Record<EntityKind, KindMeta> = {
  skill:     { label: 'Skill',      badgeCls: 'badge-skill',      nameHref: (e: Skill)     => e.rawSkillUrl },
  agent:     { label: 'Agent',      badgeCls: 'badge-automation', nameHref: (e: Agent)     => e.rawAgentUrl },
  mcpServer: { label: 'MCP Server', badgeCls: 'badge-database',   nameHref: (_: McpServer) => null },
  command:   { label: 'Command',    badgeCls: 'badge-automation', nameHref: (e: Command)   => e.rawCommandUrl },
  hook:      { label: 'Hook',       badgeCls: 'badge-automation', nameHref: (e: Hook)      => e.rawHookUrl },
};

setSkillPanelOpener(  s => openEntityPanel('skill',     s));
setAgentPanelOpener(  a => openEntityPanel('agent',     a));
setMcpPanelOpener(    m => openEntityPanel('mcpServer', m));
setCommandPanelOpener(c => openEntityPanel('command',   c));
setHookPanelOpener(   h => openEntityPanel('hook',      h));

const panel    = document.getElementById('entity-panel')         as HTMLElement;
const overlay  = document.getElementById('entity-panel-overlay') as HTMLElement;
const closeBtn = document.getElementById('entity-panel-close')   as HTMLButtonElement;

let _lastFocused: HTMLElement | null = null;

overlay.addEventListener('click',  closePanel);
closeBtn.addEventListener('click', closePanel);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });

function openEntityPanel(kind: EntityKind, entity: Skill | Agent | McpServer | Command | Hook): void {
  _lastFocused = document.activeElement as HTMLElement;

  const meta = KIND_META[kind];

  const nameEl = document.getElementById('entity-panel-name') as HTMLAnchorElement;
  nameEl.textContent = entity.name;
  const href = meta.nameHref(entity);
  if (href) {
    nameEl.href   = href;
    nameEl.target = '_blank';
    nameEl.removeAttribute('aria-disabled');
  } else {
    nameEl.removeAttribute('href');
    nameEl.removeAttribute('target');
    nameEl.setAttribute('aria-disabled', 'true');
  }

  const kindEl = document.getElementById('entity-panel-kind') as HTMLElement;
  kindEl.textContent = meta.label;
  kindEl.className   = `badge badge-cat ${meta.badgeCls}`;

  const catEl = document.getElementById('entity-panel-category') as HTMLElement;
  const category = (entity as Skill).category;
  if (category) {
    catEl.textContent = titleCase(category);
    catEl.className   = `badge badge-cat badge-${category}`;
    catEl.hidden      = false;
  } else {
    catEl.hidden = true;
  }

  const sourceEl = document.getElementById('entity-panel-source') as HTMLElement;
  sourceEl.textContent = entity._repo ?? `${entity.source.owner}/${entity.source.repo}`;

  const descEl = document.getElementById('entity-panel-desc') as HTMLElement;
  descEl.textContent   = entity.description || '';
  descEl.style.display = entity.description ? '' : 'none';

  // Tools (skill | agent)
  const tools = (entity as Skill | Agent).tools ?? [];
  renderChips('entity-panel-tools-section', 'entity-panel-tools-list', tools, 'chip-skill', 'entity-panel-tools-count');

  // Events (hook only)
  const events = kind === 'hook' ? (entity as Hook).events ?? [] : [];
  renderChips('entity-panel-events-section', 'entity-panel-events-list', events, 'chip-hook');

  // Keywords (skill only)
  const keywords = kind === 'skill' ? (entity as Skill).keywords ?? [] : [];
  renderChips('entity-panel-keywords-section', 'entity-panel-keywords-list', keywords, 'chip-command');

  // Command (mcpServer only)
  const cmdSection = document.getElementById('entity-panel-command-section') as HTMLElement;
  const cmdEl      = document.getElementById('entity-panel-command')         as HTMLElement;
  if (kind === 'mcpServer' && (entity as McpServer).command) {
    cmdEl.textContent  = (entity as McpServer).command;
    cmdSection.hidden  = false;
  } else {
    cmdSection.hidden = true;
  }

  // Source link
  const srcSection = document.getElementById('entity-panel-source-link-section') as HTMLElement;
  const srcLink    = document.getElementById('entity-panel-source-link')         as HTMLAnchorElement;
  if (href) {
    srcLink.href        = href;
    srcLink.textContent = href;
    srcSection.hidden   = false;
  } else {
    srcSection.hidden = true;
  }

  // Bundles (skill only)
  const bundlesSection = document.getElementById('entity-panel-bundles-section') as HTMLElement;
  const bundlesList    = document.getElementById('entity-panel-bundles-list')    as HTMLElement;
  const skillBundles   = kind === 'skill'
    ? state.bundles.filter(b => b.skills.includes(entity.name))
    : [];
  if (skillBundles.length) {
    bundlesList.innerHTML = skillBundles.map(b => `
      <div class="panel-bundle-item">
        <span class="panel-bundle-name">${b.name}</span>
        <span class="panel-bundle-desc">${b.description}</span>
      </div>
    `).join('');
    bundlesSection.hidden = false;
  } else {
    bundlesSection.hidden = true;
  }

  // Marketplace add (non-builtin only) + install
  const sourceKey      = entity._repo ?? `${entity.source.owner}/${entity.source.repo}`;
  const marketplaceRow = document.getElementById('entity-panel-marketplace-row') as HTMLElement;
  if (sourceKey === BUILTIN_REPO) {
    marketplaceRow.hidden = true;
  } else {
    const marketplaceCmd = `/plugin marketplace add ${sourceKey}`;
    marketplaceRow.hidden = false;
    (document.getElementById('entity-panel-marketplace-cmd') as HTMLElement).textContent = marketplaceCmd;
    const mpBtn = document.getElementById('entity-panel-marketplace-copy') as HTMLButtonElement;
    mpBtn.setAttribute('aria-label', `Copy marketplace add command for ${sourceKey}`);
    mpBtn.onclick = () => copyText(marketplaceCmd, mpBtn);
  }

  (document.getElementById('entity-panel-install-cmd') as HTMLElement).textContent = entity.installCommand;
  const installBtn = document.getElementById('entity-panel-install-copy') as HTMLButtonElement;
  installBtn.setAttribute('aria-label', `Copy install command for ${entity.name}`);
  installBtn.onclick = () => copyText(entity.installCommand, installBtn);

  panel.classList.add('open');
  panel.removeAttribute('aria-hidden');
  document.body.style.overflow = 'hidden';

  for (const sibling of Array.from(document.body.children)) {
    if (sibling !== panel) (sibling as HTMLElement).setAttribute('inert', '');
  }

  requestAnimationFrame(() => closeBtn.focus());
}

function closePanel(): void {
  if (!panel.classList.contains('open')) return;
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';

  for (const sibling of Array.from(document.body.children)) {
    if (sibling !== panel) (sibling as HTMLElement).removeAttribute('inert');
  }

  if (_lastFocused && document.body.contains(_lastFocused)) {
    _lastFocused.focus();
    _lastFocused = null;
  }
}

function renderChips(sectionId: string, listId: string, items: string[], chipCls: string, countId?: string): void {
  const section = document.getElementById(sectionId) as HTMLElement;
  const list    = document.getElementById(listId)    as HTMLElement;
  if (!items.length) { section.hidden = true; return; }
  section.hidden = false;
  list.innerHTML = items.map(item => `<span class="chip ${chipCls}">${item}</span>`).join('');
  if (countId) {
    const countEl = document.getElementById(countId);
    if (countEl) countEl.textContent = String(items.length);
  }
}
