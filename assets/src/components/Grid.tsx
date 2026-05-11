import { PluginCard }  from './cards/PluginCard.tsx';
import { SkillCard }   from './cards/SkillCard.tsx';
import { AgentCard }   from './cards/AgentCard.tsx';
import { McpCard }     from './cards/McpCard.tsx';
import { CommandCard } from './cards/CommandCard.tsx';
import { HookCard }    from './cards/HookCard.tsx';
import { BundleCard }  from './cards/BundleCard.tsx';
import type { ViewKey } from './Controls.tsx';
import type { Plugin, Skill, Agent, McpServer, Command, Hook, Bundle } from '../types.ts';

interface DataSets {
  plugins:    Plugin[];
  skills:     Skill[];
  agents:     Agent[];
  mcpServers: McpServer[];
  commands:   Command[];
  hooks:      Hook[];
  bundles:    Bundle[];
}

interface Props {
  view:       ViewKey;
  query:      string;
  sort:       'az' | 'za';
  activeRepos: Set<string>;
  activeCategories: Set<string>;
  data:       DataSets;
  onOpenPlugin:  (p: Plugin) => void;
  onOpenSkill:   (s: Skill) => void;
  onOpenAgent:   (a: Agent) => void;
  onOpenMcp:     (m: McpServer) => void;
  onOpenCommand: (c: Command) => void;
  onOpenHook:    (h: Hook) => void;
}

function sortedBy<T extends { name: string }>(items: T[], sort: 'az' | 'za'): T[] {
  return [...items].sort((a, b) =>
    sort === 'za' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name),
  );
}

function multiRepo<T extends { _repo?: string }>(items: T[]): boolean {
  return new Set(items.map(i => i._repo)).size > 1;
}

export function Grid(props: Props) {
  const { view, data } = props;
  return (
    <>
      {view === 'plugins'    && <PluginsGrid    {...props} />}
      {view === 'skills'     && <SkillsGrid     {...props} />}
      {view === 'agents'     && <AgentsGrid     {...props} />}
      {view === 'mcpServers' && <McpGrid        {...props} />}
      {view === 'commands'   && <CommandsGrid   {...props} />}
      {view === 'hooks'      && <HooksGrid      {...props} />}
      {view === 'bundles'    && <BundlesGrid bundles={data.bundles} skills={data.skills} />}
    </>
  );
}

function emptyState(icon: string, msg: string) {
  return <div class="empty"><p>{icon}</p><p>{msg}</p></div>;
}

function PluginsGrid({ data, query, sort, activeRepos, activeCategories, onOpenPlugin }: Props) {
  const all = data.plugins;
  const show = multiRepo(all);
  const filtered = all.filter(p => {
    if (activeRepos.size && !activeRepos.has(p._repo ?? '')) return false;
    if (activeCategories.size && !activeCategories.has(p.category ?? '')) return false;
    if (!query) return true;
    return p.name.includes(query) || (p.description ?? '').toLowerCase().includes(query);
  });
  return (
    <>
      <div class="count" id="count" aria-live="polite" aria-atomic="true">
        {filtered.length} of {all.length} plugins
      </div>
      <div id="plugins-grid" style={{ display: 'grid' }}>
        {filtered.length === 0
          ? emptyState('🔍', 'No plugins match your search')
          : sortedBy(filtered, sort).map(p =>
              <PluginCard key={`${p._repo}/${p.name}`} plugin={p} showSource={show} onOpen={onOpenPlugin} />)}
      </div>
    </>
  );
}

function SkillsGrid({ data, query, sort, activeRepos, activeCategories, onOpenSkill }: Props) {
  const all = data.skills;
  const show = multiRepo(all);
  const filtered = all.filter(s => {
    if (activeRepos.size && !activeRepos.has(s._repo ?? '')) return false;
    if (activeCategories.size && !activeCategories.has(s.category ?? '')) return false;
    if (!query) return true;
    return s.name.includes(query)
        || s.description.toLowerCase().includes(query)
        || (s.keywords ?? []).some(k => k.includes(query));
  });
  return (
    <>
      <div class="count" id="count" aria-live="polite" aria-atomic="true">
        {filtered.length} of {all.length} skills
      </div>
      <div id="skills-grid" style={{ display: 'grid' }}>
        {filtered.length === 0
          ? emptyState('🔍', 'No skills match your search')
          : sortedBy(filtered, sort).map(s =>
              <SkillCard key={`${s._repo}/${s.name}`} skill={s} showSource={show} showInstall onOpen={onOpenSkill} />)}
      </div>
    </>
  );
}

function AgentsGrid({ data, query, sort, activeRepos, onOpenAgent }: Props) {
  const all = data.agents;
  const show = multiRepo(all);
  const filtered = all.filter(a => {
    if (activeRepos.size && !activeRepos.has(a._repo ?? '')) return false;
    if (!query) return true;
    return a.name.includes(query) || a.description.toLowerCase().includes(query);
  });
  return (
    <>
      <div class="count" id="count" aria-live="polite" aria-atomic="true">
        {filtered.length} of {all.length} agents
      </div>
      <div id="agents-grid" style={{ display: 'grid' }}>
        {filtered.length === 0
          ? emptyState('🤖', 'No agents found')
          : sortedBy(filtered, sort).map(a =>
              <AgentCard key={`${a._repo}/${a.name}`} agent={a} showSource={show} showInstall onOpen={onOpenAgent} />)}
      </div>
    </>
  );
}

function McpGrid({ data, query, sort, activeRepos, onOpenMcp }: Props) {
  const all = data.mcpServers;
  const show = multiRepo(all);
  const filtered = all.filter(m => {
    if (activeRepos.size && !activeRepos.has(m._repo ?? '')) return false;
    if (!query) return true;
    return m.name.includes(query) || m.description.toLowerCase().includes(query);
  });
  return (
    <>
      <div class="count" id="count" aria-live="polite" aria-atomic="true">
        {filtered.length} of {all.length} MCP servers
      </div>
      <div id="mcp-grid" style={{ display: 'grid' }}>
        {filtered.length === 0
          ? emptyState('🔌', 'No MCP servers found')
          : sortedBy(filtered, sort).map(m =>
              <McpCard key={`${m._repo}/${m.name}`} mcp={m} showSource={show} showInstall onOpen={onOpenMcp} />)}
      </div>
    </>
  );
}

function CommandsGrid({ data, query, sort, activeRepos, onOpenCommand }: Props) {
  const all = data.commands;
  const show = multiRepo(all);
  const filtered = all.filter(c => {
    if (activeRepos.size && !activeRepos.has(c._repo ?? '')) return false;
    if (!query) return true;
    return c.name.includes(query) || c.description.toLowerCase().includes(query);
  });
  return (
    <>
      <div class="count" id="count" aria-live="polite" aria-atomic="true">
        {filtered.length} of {all.length} commands
      </div>
      <div id="commands-grid" style={{ display: 'grid' }}>
        {filtered.length === 0
          ? emptyState('⌨️', 'No commands found')
          : sortedBy(filtered, sort).map(c =>
              <CommandCard key={`${c._repo}/${c.name}`} command={c} showSource={show} showInstall onOpen={onOpenCommand} />)}
      </div>
    </>
  );
}

function HooksGrid({ data, query, sort, activeRepos, onOpenHook }: Props) {
  const all = data.hooks;
  const show = multiRepo(all);
  const filtered = all.filter(h => {
    if (activeRepos.size && !activeRepos.has(h._repo ?? '')) return false;
    if (!query) return true;
    return h.name.includes(query)
        || h.description.toLowerCase().includes(query)
        || h.events.some(e => e.toLowerCase().includes(query));
  });
  return (
    <>
      <div class="count" id="count" aria-live="polite" aria-atomic="true">
        {filtered.length} of {all.length} hooks
      </div>
      <div id="hooks-grid" style={{ display: 'grid' }}>
        {filtered.length === 0
          ? emptyState('🪝', 'No hooks found')
          : sortedBy(filtered, sort).map(h =>
              <HookCard key={`${h._repo}/${h.name}`} hook={h} showSource={show} showInstall onOpen={onOpenHook} />)}
      </div>
    </>
  );
}

function BundlesGrid({ bundles, skills }: { bundles: Bundle[]; skills: Skill[] }) {
  return (
    <>
      <div class="count" id="count" aria-live="polite" aria-atomic="true">
        {bundles.length} bundles
      </div>
      <div id="bundles-grid" style={{ display: 'grid' }}>
        {bundles.map(b => <BundleCard key={b.name} bundle={b} skills={skills} />)}
      </div>
    </>
  );
}
