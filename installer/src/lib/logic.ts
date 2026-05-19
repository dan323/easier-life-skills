// Pure, side-effect-free functions — fully testable without mocking.

import type {
  Agent,
  Bundle,
  BundleSkillRef,
  Command,
  Entity,
  Hook,
  Index,
  Installable,
  InstalledPlugin,
  McpServer,
  Plugin,
  Skill,
  SkillSource,
  Sources,
} from './types.js';

// ── Source routing ────────────────────────────────────────────────────────────

// Accepts anything that carries a source.owner/source.repo pair (Skill, Plugin,
// or a bare Installable). Lets every caller share one routing rule.
export function isMarketplaceSource(item: { source: SkillSource }, sources: Sources): boolean {
  const key = `${item.source.owner}/${item.source.repo}`;
  return sources[key]?.isMarketplace !== false;
}

export function toInstallable(item: Skill | Plugin): Installable {
  if ('pluginName' in item) return { pluginName: item.pluginName, source: item.source };
  return { pluginName: item.name, source: item.source };
}

export function describeTarget(item: Skill | Plugin, sources: Sources): string {
  const inst = toInstallable(item);
  if (isMarketplaceSource(inst, sources)) return `${inst.pluginName}@${inst.source.repo}`;
  return `${inst.pluginName}@${inst.pluginName} (shim → ${inst.source.repoUrl})`;
}

// Deduped, user-friendly list of marketplaces that will be added (or already
// are registered) for the given items. Marketplace sources surface as
// `<owner>/<repo>`; plugin-only sources surface as a shim hint so users see
// where the synthetic marketplace comes from.
export function marketplacesForItems(items: Array<Skill | Plugin>, sources: Sources): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const inst = toInstallable(item);
    const label = isMarketplaceSource(inst, sources)
      ? `${inst.source.owner}/${inst.source.repo}`
      : `${inst.pluginName} (auto-generated shim → ${inst.source.owner}/${inst.source.repo})`;
    if (!seen.has(label)) {
      seen.add(label);
      out.push(label);
    }
  }
  return out;
}

// Back-compat alias — older callers passed Skill[]; keep the export so
// downstream consumers don't have to change immediately.
export const marketplacesForSkills = marketplacesForItems;

// ── Search ────────────────────────────────────────────────────────────────────

export function filterSkills(skills: Skill[], query: string): Skill[] {
  const q = query.toLowerCase();
  return skills.filter((s) =>
    s.name.toLowerCase().includes(q) ||
    (s.description || '').toLowerCase().includes(q) ||
    (s.keywords || []).some((k) => String(k).toLowerCase().includes(q))
  );
}

// Searches by plugin name/description/category, plus the names of every
// entity the plugin ships (skills, agents, hooks, commands, mcpServers).
// So `--search cost` matches the `cost-tracker` plugin via either its name
// or its `cost-tracker` hook entry.
export function filterPlugins(plugins: Plugin[], query: string): Plugin[] {
  const q = query.toLowerCase();
  return plugins.filter((p) => {
    if (p.name.toLowerCase().includes(q)) return true;
    if ((p.description || '').toLowerCase().includes(q)) return true;
    if ((p.category || '').toLowerCase().includes(q)) return true;
    const entities = [
      ...(p.skills ?? []),
      ...(p.agents ?? []),
      ...(p.hooks ?? []),
      ...(p.commands ?? []),
      ...(p.mcpServers ?? []),
    ];
    return entities.some((e) => e.toLowerCase().includes(q));
  });
}

// Generic substring match against an Entity's name / description / category.
function entityMatches(e: { name: string; description?: string; category?: string }, q: string): boolean {
  if (e.name.toLowerCase().includes(q)) return true;
  if ((e.description || '').toLowerCase().includes(q)) return true;
  if ((e.category || '').toLowerCase().includes(q)) return true;
  return false;
}

export function filterAgents(agents: Agent[], query: string): Agent[] {
  const q = query.toLowerCase();
  return agents.filter((a) => entityMatches(a, q));
}

export function filterHooks(hooks: Hook[], query: string): Hook[] {
  const q = query.toLowerCase();
  return hooks.filter((h) => entityMatches(h, q));
}

export function filterCommands(commands: Command[], query: string): Command[] {
  const q = query.toLowerCase();
  return commands.filter((c) => entityMatches(c, q));
}

export function filterMcpServers(mcps: McpServer[], query: string): McpServer[] {
  const q = query.toLowerCase();
  return mcps.filter((m) => entityMatches(m, q));
}

// ── Search-all aggregator and install-target resolver ────────────────────────

export interface SearchResults {
  plugins: Plugin[];
  skills: Skill[];
  agents: Agent[];
  hooks: Hook[];
  commands: Command[];
  mcpServers: McpServer[];
}

export function searchAll(index: Index, query: string): SearchResults {
  return {
    plugins: filterPlugins(index.plugins ?? [], query),
    skills: filterSkills(index.skills, query),
    agents: filterAgents(index.agents ?? [], query),
    hooks: filterHooks(index.hooks ?? [], query),
    commands: filterCommands(index.commands ?? [], query),
    mcpServers: filterMcpServers(index.mcpServers ?? [], query),
  };
}

// Used by `--install <name>` to figure out which plugin to install when the
// user types a plugin name OR any entity name. Returns:
//  - `{ plugin }` if there is exactly one plugin to install.
//  - `{ candidates }` if multiple plugins match — caller should disambiguate.
//  - `null` if nothing matches.
export interface ResolveMatch {
  pluginName: string;
  via: 'plugin' | Entity['kind'];
  source: SkillSource;
}

export function resolveInstallTarget(
  name: string,
  index: Index,
): { plugin: Plugin } | { candidates: ResolveMatch[] } | null {
  const plugins = index.plugins ?? [];

  // Direct plugin-name hit wins outright (unambiguous within marketplaces
  // the index covers — plugin names are unique per the marketplace contract).
  const direct = plugins.find((p) => p.name === name);
  if (direct) return { plugin: direct };

  const matches: ResolveMatch[] = [];
  const collect = (arr: Array<{ name: string; pluginName: string; source: SkillSource }>, kind: Entity['kind']) => {
    for (const e of arr) {
      if (e.name === name) matches.push({ pluginName: e.pluginName, via: kind, source: e.source });
    }
  };
  collect(index.skills, 'skill');
  collect(index.agents ?? [], 'agent');
  collect(index.hooks ?? [], 'hook');
  collect(index.commands ?? [], 'command');
  collect(index.mcpServers ?? [], 'mcp');

  if (matches.length === 0) return null;

  // Dedupe by (pluginName, source.owner/repo) — multiple entities of the same
  // plugin shouldn't cause "ambiguous" prompts.
  const uniq = new Map<string, ResolveMatch>();
  for (const m of matches) {
    uniq.set(`${m.source.owner}/${m.source.repo}/${m.pluginName}`, m);
  }
  const dedup = [...uniq.values()];

  if (dedup.length === 1) {
    const only = dedup[0]!;
    const plugin = plugins.find(
      (p) => p.name === only.pluginName
        && p.source.owner === only.source.owner
        && p.source.repo === only.source.repo,
    );
    if (plugin) return { plugin };
    // Plugin entry isn't in the plugins[] array — return a synthetic plugin
    // so callers can still install. Happens for older index snapshots.
    return {
      plugin: {
        name: only.pluginName,
        description: '',
        source: only.source,
      },
    };
  }
  return { candidates: dedup };
}

// ── Bundle resolution ─────────────────────────────────────────────────────────

type NamedInstallable = { name: string; source: { owner: string; repo: string }; pluginName?: string };

function matchRef(ref: BundleSkillRef, e: NamedInstallable): boolean {
  if (typeof ref === 'string') return e.name === ref;
  return e.name === ref.name
    && (ref.source == null || (e.source.owner === ref.source.owner && e.source.repo === ref.source.repo))
    && (ref.pluginName == null || e.pluginName === ref.pluginName);
}

function resolveRefs<T extends NamedInstallable>(
  refs: BundleSkillRef[] | undefined,
  all: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const ref of refs ?? []) {
    const match = all.find((e) => matchRef(ref, e));
    if (!match) continue;
    const key = `${match.source.owner}/${match.source.repo}::${match.pluginName ?? ''}::${match.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(match);
  }
  return out;
}

export function resolveBundle(
  bundle: Bundle,
  skills: Skill[],
  others?: {
    agents?:     Agent[];
    hooks?:      Hook[];
    commands?:   Command[];
    mcpServers?: McpServer[];
    plugins?:    Plugin[];
  },
): Array<Skill | Agent | Hook | Command | McpServer | Plugin> {
  const pluginRefs = bundle.plugins ?? [];
  const resolvedPlugins: Plugin[] = [];
  const seenPlugins = new Set<string>();
  for (const ref of pluginRefs) {
    const name = typeof ref === 'string' ? ref : ref.name;
    const src  = typeof ref === 'string' ? null : (ref.source ?? null);
    const match = (others?.plugins ?? []).find((p) =>
      p.name === name &&
      (src == null || (p.source.owner === src.owner && p.source.repo === src.repo))
    );
    if (!match) continue;
    const key = `${match.source.owner}/${match.source.repo}::${match.name}`;
    if (seenPlugins.has(key)) continue;
    seenPlugins.add(key);
    resolvedPlugins.push(match);
  }

  return [
    ...resolveRefs(bundle.skills,     skills),
    ...resolveRefs(bundle.agents,     others?.agents     ?? []),
    ...resolveRefs(bundle.hooks,      others?.hooks      ?? []),
    ...resolveRefs(bundle.commands,   others?.commands   ?? []),
    ...resolveRefs(bundle.mcpServers, others?.mcpServers ?? []),
    ...resolvedPlugins,
  ];
}

// ── Update helpers ────────────────────────────────────────────────────────────

// Marketplaces are derived from the `sources` map plus any plugin-only
// sources that the installer will register as shims. Pass plugins when
// available — they cover hook/agent-only plugins which `skills` does not.
export function computeKnownMarketplaces(
  items: Array<Skill | Plugin>,
  sources: Sources,
  primaryMarketplace: string,
): Set<string> {
  const known = new Set<string>();
  for (const [k, v] of Object.entries(sources)) {
    if (v?.isMarketplace !== false) {
      const tail = k.split('/').pop();
      if (tail) known.add(tail);
    }
  }
  for (const item of items) {
    const inst = toInstallable(item);
    if (sources[`${inst.source.owner}/${inst.source.repo}`]?.isMarketplace === false) {
      known.add(inst.pluginName);
    }
  }
  known.add(primaryMarketplace);
  return known;
}

export function filterForUpdate(
  installed: InstalledPlugin[],
  knownMarketplaces: Set<string>,
  targetPluginName: string | null = null,
): InstalledPlugin[] {
  let targets = installed.filter((p) => {
    const at = typeof p.id === 'string' ? p.id.lastIndexOf('@') : -1;
    if (at === -1) return false;
    return knownMarketplaces.has(p.id.slice(at + 1));
  });
  if (targetPluginName) {
    targets = targets.filter((p) => p.id.slice(0, p.id.lastIndexOf('@')) === targetPluginName);
  }
  return targets;
}
