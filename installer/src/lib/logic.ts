// Pure, side-effect-free functions — fully testable without mocking.

import type {
  Bundle,
  BundleSkillRef,
  Installable,
  InstalledPlugin,
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

// ── Bundle resolution ─────────────────────────────────────────────────────────

export function resolveBundle(bundle: Bundle, skills: Skill[]): Skill[] {
  return bundle.skills
    .map((ref: BundleSkillRef): Skill | undefined => {
      if (typeof ref === 'string') return skills.find((s) => s.name === ref);
      return skills.find((s) =>
        s.name === ref.name &&
        s.source.owner === ref.source?.owner &&
        s.source.repo === ref.source?.repo &&
        (ref.pluginName == null || s.pluginName === ref.pluginName)
      );
    })
    .filter((s): s is Skill => s !== undefined);
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
