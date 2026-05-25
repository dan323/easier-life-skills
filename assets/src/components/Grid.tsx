import { PluginCard }  from './cards/PluginCard.tsx';
import { SkillCard }   from './cards/SkillCard.tsx';
import { AgentCard }   from './cards/AgentCard.tsx';
import { McpCard }     from './cards/McpCard.tsx';
import { CommandCard } from './cards/CommandCard.tsx';
import { HookCard }    from './cards/HookCard.tsx';
import { BundleCard }  from './cards/BundleCard.tsx';
import type { ViewKey, Plugin, Skill, Agent, McpServer, Command, Hook, Bundle } from '../types.ts';
import type { SortKey } from '../url-state.ts';
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
  nlScores:   Map<string, number>;
  sort:       SortKey;
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

function nlFilter<T>(
  items: T[],
  nlScores: Map<string, number>,
  idFn: (item: T) => string,
): T[] {
  return items
    .map(item => ({ item, score: nlScores.get(idFn(item)) ?? 0 }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

function filterEntities<T extends { _repo?: string; category?: string | null }>(
  all: T[],
  activeRepos: Set<string>,
  activeCategories: Set<string>,
  query: string,
  nlScores: Map<string, number>,
  nlKey: (item: T) => string,
  textMatch: (item: T, q: string) => boolean,
): T[] {
  const base = all.filter(item => {
    if (activeRepos.size && !activeRepos.has(item._repo ?? '')) return false;
    return !(activeCategories.size && !activeCategories.has(item.category ?? ''));

  });
  return nlScores.size > 0
    ? nlFilter(base, nlScores, nlKey)
    : base.filter(item => !query || textMatch(item, query));
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

function sortedBy<T extends { name: string }>(items: T[], sort: SortKey): T[] {
  return [...items].sort((a, b) =>
    sort === 'za' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name),
  );
}

function sortedByRating(items: Skill[], sort: SortKey): Skill[] {
  if (sort !== 'rating') return sortedBy(items, sort);
  return [...items].sort((a, b) => {
    const aAvg = a.rating?.avg ?? -1;
    const bAvg = b.rating?.avg ?? -1;
    if (bAvg !== aAvg) return bAvg - aAvg;
    return a.name.localeCompare(b.name);
  });
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
      {view === 'bundles'    && <BundlesGrid bundles={data.bundles} skills={data.skills} agents={data.agents} hooks={data.hooks} commands={data.commands} mcpServers={data.mcpServers} plugins={data.plugins} sources={props.sources} />}
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

function PluginsGrid({ data, query, nlScores, sort, activeRepos, activeCategories, onOpenPlugin, bundledIds, onToggleBundlePlugin }: Props) {
  const all = data.plugins;
  const show = multiRepo(all);
  const filtered = filterEntities(all, activeRepos, activeCategories, query, nlScores,
    p => `p:${p._repo}/${p.name}`,
    (p, q) => p.name.includes(q) || (p.description ?? '').toLowerCase().includes(q),
  );
  return (
    <>
      <div class="count" id="count" aria-live="polite" aria-atomic="true">
        {filtered.length} of {all.length} plugins
      </div>
      <div id="plugins-grid" style={{ display: 'grid' }}>
        {filtered.length === 0
          ? viewEmpty('plugins', '🔍', 'plugins', all.length, data)
          : (nlScores.size > 0 ? filtered : sortedBy(filtered, sort)).map(p =>
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

function SkillsGrid({ data, query, nlScores, sort, activeRepos, activeCategories, onOpenSkill, bundledIds, onToggleBundleSkill }: Props) {
  const all = data.skills;
  const show = multiRepo(all);
  const filtered = filterEntities(all, activeRepos, activeCategories, query, nlScores,
    s => `s:${s._repo}/${s.pluginName}/${s.name}`,
    (s, q) => s.name.includes(q) || s.description.toLowerCase().includes(q) || (s.keywords ?? []).some(k => k.includes(q)),
  );
  return (
    <>
      <div class="count" id="count" aria-live="polite" aria-atomic="true">
        {filtered.length} of {all.length} skills
      </div>
      <div id="skills-grid" style={{ display: 'grid' }}>
        {filtered.length === 0
          ? viewEmpty('skills', '🔍', 'skills', all.length, data)
          : (nlScores.size > 0 ? filtered : sortedByRating(filtered, sort)).map(s =>
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

function AgentsGrid({ data, query, nlScores, sort, activeRepos, activeCategories, onOpenAgent, bundledIds, onToggleBundleAgent }: Props) {
  const all = data.agents;
  const show = multiRepo(all);
  const filtered = filterEntities(all, activeRepos, activeCategories, query, nlScores,
    a => `a:${a._repo}/${a.pluginName}/${a.name}`,
    (a, q) => a.name.includes(q) || a.description.toLowerCase().includes(q),
  );
  return (
    <>
      <div class="count" id="count" aria-live="polite" aria-atomic="true">
        {filtered.length} of {all.length} agents
      </div>
      <div id="agents-grid" style={{ display: 'grid' }}>
        {filtered.length === 0
          ? viewEmpty('agents', '🤖', 'agents', all.length, data)
          : (nlScores.size > 0 ? filtered : sortedBy(filtered, sort)).map(a =>
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

function McpGrid({ data, query, nlScores, sort, activeRepos, activeCategories, onOpenMcp, bundledIds, onToggleBundleMcp }: Props) {
  const all = data.mcpServers;
  const show = multiRepo(all);
  const filtered = filterEntities(all, activeRepos, activeCategories, query, nlScores,
    m => `m:${m._repo}/${m.pluginName}/${m.name}`,
    (m, q) => m.name.includes(q) || m.description.toLowerCase().includes(q),
  );
  return (
    <>
      <div class="count" id="count" aria-live="polite" aria-atomic="true">
        {filtered.length} of {all.length} MCP servers
      </div>
      <div id="mcp-grid" style={{ display: 'grid' }}>
        {filtered.length === 0
          ? viewEmpty('mcpServers', '🔌', 'MCP servers', all.length, data)
          : (nlScores.size > 0 ? filtered : sortedBy(filtered, sort)).map(m =>
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

function CommandsGrid({ data, query, nlScores, sort, activeRepos, activeCategories, onOpenCommand, bundledIds, onToggleBundleCommand }: Props) {
  const all = data.commands;
  const show = multiRepo(all);
  const filtered = filterEntities(all, activeRepos, activeCategories, query, nlScores,
    c => `c:${c._repo}/${c.pluginName}/${c.name}`,
    (c, q) => c.name.includes(q) || c.description.toLowerCase().includes(q),
  );
  return (
    <>
      <div class="count" id="count" aria-live="polite" aria-atomic="true">
        {filtered.length} of {all.length} commands
      </div>
      <div id="commands-grid" style={{ display: 'grid' }}>
        {filtered.length === 0
          ? viewEmpty('commands', '⌨️', 'commands', all.length, data)
          : (nlScores.size > 0 ? filtered : sortedBy(filtered, sort)).map(c =>
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

function HooksGrid({ data, query, nlScores, sort, activeRepos, activeCategories, onOpenHook, bundledIds, onToggleBundleHook }: Props) {
  const all = data.hooks;
  const show = multiRepo(all);
  const filtered = filterEntities(all, activeRepos, activeCategories, query, nlScores,
    h => `h:${h._repo}/${h.pluginName}/${h.name}`,
    (h, q) => h.name.includes(q) || h.description.toLowerCase().includes(q) || h.events.some(e => e.toLowerCase().includes(q)),
  );
  return (
    <>
      <div class="count" id="count" aria-live="polite" aria-atomic="true">
        {filtered.length} of {all.length} hooks
      </div>
      <div id="hooks-grid" style={{ display: 'grid' }}>
        {filtered.length === 0
          ? viewEmpty('hooks', '🪝', 'hooks', all.length, data)
          : (nlScores.size > 0 ? filtered : sortedBy(filtered, sort)).map(h =>
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

function BundlesGrid({ bundles, skills, agents, hooks, commands, mcpServers, plugins, sources }: {
  bundles:    Bundle[];
  skills:     Skill[];
  agents:     Agent[];
  hooks:      Hook[];
  commands:   Command[];
  mcpServers: McpServer[];
  plugins:    Plugin[];
  sources?:   Record<string, { isMarketplace: boolean }>;
}) {
  return (
    <>
      <div class="count" id="count" aria-live="polite" aria-atomic="true">
        {bundles.length} bundles
      </div>
      <div id="bundles-grid" style={{ display: 'grid' }}>
        {bundles.map(b => (
          <BundleCard
            key={b.name}
            bundle={b}
            skills={skills}
            agents={agents}
            hooks={hooks}
            commands={commands}
            mcpServers={mcpServers}
            plugins={plugins}
            sources={sources}
          />
        ))}
      </div>
    </>
  );
}
