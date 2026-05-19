import { PluginCard }  from './cards/PluginCard.tsx';
import { SkillCard }   from './cards/SkillCard.tsx';
import { AgentCard }   from './cards/AgentCard.tsx';
import { McpCard }     from './cards/McpCard.tsx';
import { CommandCard } from './cards/CommandCard.tsx';
import { HookCard }    from './cards/HookCard.tsx';
import { BundleCard }  from './cards/BundleCard.tsx';
import type { ViewKey } from './Controls.tsx';
import type { Plugin, Skill, Agent, McpServer, Command, Hook, Bundle } from '../types.ts';
import { buildBundleItemId } from '../bundle-state.ts';

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
  loaded:     boolean;
  query:      string;
  sort:       'az' | 'za';
  activeRepos: Set<string>;
  activeCategories: Set<string>;
  data:       DataSets;
  sources?:   Record<string, { isMarketplace: boolean }>;
  bundledIds: Set<string>;
  onOpenPlugin:    (p: Plugin) => void;
  onOpenSkill:     (s: Skill) => void;
  onOpenAgent:     (a: Agent) => void;
  onOpenMcp:       (m: McpServer) => void;
  onOpenCommand:   (c: Command) => void;
  onOpenHook:      (h: Hook) => void;
  onToggleBundlePlugin:  (p: Plugin) => void;
  onToggleBundleSkill:   (s: Skill) => void;
  onToggleBundleAgent:   (a: Agent) => void;
  onToggleBundleMcp:     (m: McpServer) => void;
  onToggleBundleCommand: (c: Command) => void;
  onToggleBundleHook:    (h: Hook) => void;
}

const GRID_IDS: Record<ViewKey, string> = {
  plugins:    'plugins-grid',
  skills:     'skills-grid',
  agents:     'agents-grid',
  mcpServers: 'mcp-grid',
  commands:   'commands-grid',
  hooks:      'hooks-grid',
  bundles:    'bundles-grid',
};

function sortedBy<T extends { name: string }>(items: T[], sort: 'az' | 'za'): T[] {
  return [...items].sort((a, b) =>
    sort === 'za' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name),
  );
}

function multiRepo<T extends { _repo?: string }>(items: T[]): boolean {
  return new Set(items.map(i => i._repo)).size > 1;
}

export function Grid(props: Props) {
  const { view, data, loaded } = props;
  if (!loaded) return <SkeletonGrid view={view} />;
  return (
    <>
      {view === 'plugins'    && <PluginsGrid    {...props} />}
      {view === 'skills'     && <SkillsGrid     {...props} />}
      {view === 'agents'     && <AgentsGrid     {...props} />}
      {view === 'mcpServers' && <McpGrid        {...props} />}
      {view === 'commands'   && <CommandsGrid   {...props} />}
      {view === 'hooks'      && <HooksGrid      {...props} />}
      {view === 'bundles'    && <BundlesGrid bundles={data.bundles} skills={data.skills} sources={props.sources} />}
    </>
  );
}

function SkeletonGrid({ view }: { view: ViewKey }) {
  return (
    <>
      <div class="count" id="count" aria-live="polite" aria-atomic="true">Loading…</div>
      <div id={GRID_IDS[view]} style={{ display: 'grid' }}>
        {Array.from({ length: 6 }).map((_, i) =>
          <div key={i} class="skeleton-card" aria-hidden="true" />)}
      </div>
    </>
  );
}

const VIEW_LABELS: Record<ViewKey, string> = {
  plugins:    'Plugins',
  skills:     'Skills',
  agents:     'Agents',
  mcpServers: 'MCP Servers',
  commands:   'Commands',
  hooks:      'Hooks',
  bundles:    'Bundles',
};

function viewCounts(data: DataSets): Record<ViewKey, number> {
  return {
    plugins:    data.plugins.length,
    skills:     data.skills.length,
    agents:     data.agents.length,
    mcpServers: data.mcpServers.length,
    commands:   data.commands.length,
    hooks:      data.hooks.length,
    bundles:    data.bundles.length,
  };
}

function viewEmpty(view: ViewKey, icon: string, label: string, allCount: number, data: DataSets) {
  if (allCount > 0) {
    return <div class="empty"><p>{icon}</p><p>No {label} match your search</p></div>;
  }
  const counts = viewCounts(data);
  const suggestions = (Object.keys(VIEW_LABELS) as ViewKey[])
    .filter(v => v !== view && counts[v] > 0)
    .slice(0, 3)
    .map(v => VIEW_LABELS[v]);
  return (
    <div class="empty">
      <p>{icon}</p>
      <p>No {label} in this marketplace yet</p>
      {suggestions.length > 0 && (
        <p class="empty-hint">Try the {suggestions.join(', ')} view{suggestions.length > 1 ? 's' : ''} instead</p>
      )}
    </div>
  );
}

function PluginsGrid({ data, query, sort, activeRepos, activeCategories, onOpenPlugin, bundledIds, onToggleBundlePlugin }: Props) {
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
          ? viewEmpty('plugins', '🔍', 'plugins', all.length, data)
          : sortedBy(filtered, sort).map(p =>
              <PluginCard
                key={`${p._repo}/${p.name}`}
                plugin={p}
                showSource={show}
                onOpen={onOpenPlugin}
                bundled={bundledIds.has(buildBundleItemId('plugin', p.name, p._repo ?? ''))}
                onToggleBundle={onToggleBundlePlugin}
              />)}
      </div>
    </>
  );
}

function SkillsGrid({ data, query, sort, activeRepos, activeCategories, onOpenSkill, bundledIds, onToggleBundleSkill }: Props) {
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
          ? viewEmpty('skills', '🔍', 'skills', all.length, data)
          : sortedBy(filtered, sort).map(s =>
              <SkillCard
                key={`${s._repo}/${s.pluginName}/${s.name}`}
                skill={s}
                showSource={show}
                showInstall
                onOpen={onOpenSkill}
                bundled={bundledIds.has(buildBundleItemId('skill', s.name, s._repo ?? '', s.pluginName))}
                onToggleBundle={onToggleBundleSkill}
              />)}
      </div>
    </>
  );
}

function AgentsGrid({ data, query, sort, activeRepos, activeCategories, onOpenAgent, bundledIds, onToggleBundleAgent }: Props) {
  const all = data.agents;
  const show = multiRepo(all);
  const filtered = all.filter(a => {
    if (activeRepos.size && !activeRepos.has(a._repo ?? '')) return false;
    if (activeCategories.size && !activeCategories.has(a.category ?? '')) return false;
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
          ? viewEmpty('agents', '🤖', 'agents', all.length, data)
          : sortedBy(filtered, sort).map(a =>
              <AgentCard
                key={`${a._repo}/${a.pluginName}/${a.name}`}
                agent={a}
                showSource={show}
                showInstall
                onOpen={onOpenAgent}
                bundled={bundledIds.has(buildBundleItemId('agent', a.name, a._repo ?? '', a.pluginName))}
                onToggleBundle={onToggleBundleAgent}
              />)}
      </div>
    </>
  );
}

function McpGrid({ data, query, sort, activeRepos, activeCategories, onOpenMcp, bundledIds, onToggleBundleMcp }: Props) {
  const all = data.mcpServers;
  const show = multiRepo(all);
  const filtered = all.filter(m => {
    if (activeRepos.size && !activeRepos.has(m._repo ?? '')) return false;
    if (activeCategories.size && !activeCategories.has(m.category ?? '')) return false;
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
          ? viewEmpty('mcpServers', '🔌', 'MCP servers', all.length, data)
          : sortedBy(filtered, sort).map(m =>
              <McpCard
                key={`${m._repo}/${m.pluginName}/${m.name}`}
                mcp={m}
                showSource={show}
                showInstall
                onOpen={onOpenMcp}
                bundled={bundledIds.has(buildBundleItemId('mcpServer', m.name, m._repo ?? '', m.pluginName))}
                onToggleBundle={onToggleBundleMcp}
              />)}
      </div>
    </>
  );
}

function CommandsGrid({ data, query, sort, activeRepos, activeCategories, onOpenCommand, bundledIds, onToggleBundleCommand }: Props) {
  const all = data.commands;
  const show = multiRepo(all);
  const filtered = all.filter(c => {
    if (activeRepos.size && !activeRepos.has(c._repo ?? '')) return false;
    if (activeCategories.size && !activeCategories.has(c.category ?? '')) return false;
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
          ? viewEmpty('commands', '⌨️', 'commands', all.length, data)
          : sortedBy(filtered, sort).map(c =>
              <CommandCard
                key={`${c._repo}/${c.pluginName}/${c.name}`}
                command={c}
                showSource={show}
                showInstall
                onOpen={onOpenCommand}
                bundled={bundledIds.has(buildBundleItemId('command', c.name, c._repo ?? '', c.pluginName))}
                onToggleBundle={onToggleBundleCommand}
              />)}
      </div>
    </>
  );
}

function HooksGrid({ data, query, sort, activeRepos, activeCategories, onOpenHook, bundledIds, onToggleBundleHook }: Props) {
  const all = data.hooks;
  const show = multiRepo(all);
  const filtered = all.filter(h => {
    if (activeRepos.size && !activeRepos.has(h._repo ?? '')) return false;
    if (activeCategories.size && !activeCategories.has(h.category ?? '')) return false;
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
          ? viewEmpty('hooks', '🪝', 'hooks', all.length, data)
          : sortedBy(filtered, sort).map(h =>
              <HookCard
                key={`${h._repo}/${h.pluginName}/${h.name}`}
                hook={h}
                showSource={show}
                showInstall
                onOpen={onOpenHook}
                bundled={bundledIds.has(buildBundleItemId('hook', h.name, h._repo ?? '', h.pluginName))}
                onToggleBundle={onToggleBundleHook}
              />)}
      </div>
    </>
  );
}

function BundlesGrid({ bundles, skills, sources }: {
  bundles: Bundle[];
  skills:  Skill[];
  sources?: Record<string, { isMarketplace: boolean }>;
}) {
  return (
    <>
      <div class="count" id="count" aria-live="polite" aria-atomic="true">
        {bundles.length} bundles
      </div>
      <div id="bundles-grid" style={{ display: 'grid' }}>
        {bundles.map(b => <BundleCard key={b.name} bundle={b} skills={skills} sources={sources} />)}
      </div>
    </>
  );
}
