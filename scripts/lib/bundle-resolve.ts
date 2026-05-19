/* lib/bundle-resolve.ts — shared bundle entity resolution.
 *
 * A bundle ref array can mix two reference forms:
 *   - bare string `"foo"`            → every entity named `foo`, across all
 *                                       marketplaces (legacy behaviour)
 *   - object `{ name, source?, pluginName? }`
 *                                    → narrow by repo and/or pluginName so
 *                                       same-named entities from different
 *                                       plugins don't get conflated.
 *
 * Used by both the build-time bundle membership tagging and the runtime
 * catalog/web rendering paths so they agree on what a bundle resolves to.
 */

import type { Bundle, BundleSkillRef, Skill, Agent, Hook, Command, McpServer, Plugin } from './types.js';

type NamedEntity = { name: string; source: { owner: string; repo: string }; pluginName?: string };

/** Predicate: does this entity satisfy this ref? */
export function refMatchesEntity(ref: BundleSkillRef, entity: NamedEntity): boolean {
  if (typeof ref === 'string') return entity.name === ref;
  if (entity.name !== ref.name) return false;
  if (ref.source && (entity.source.owner !== ref.source.owner || entity.source.repo !== ref.source.repo)) return false;
  if (ref.pluginName != null && entity.pluginName !== ref.pluginName) return false;
  return true;
}

// Back-compat alias (skills are entities too).
export const refMatchesSkill = refMatchesEntity;

function entityKey(e: NamedEntity): string {
  return `${e.source.owner}/${e.source.repo}::${e.pluginName ?? ''}::${e.name}`;
}

/**
 * Expand a bundle's ref array to actual entity records, deduped.
 * Works for any entity kind (skill, agent, hook, command, mcpServer).
 */
export function resolveBundleEntityArray<T extends NamedEntity>(
  refs: BundleSkillRef[] | undefined,
  allEntities: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const ref of refs ?? []) {
    for (const entity of allEntities) {
      if (!refMatchesEntity(ref, entity)) continue;
      const key = entityKey(entity);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entity);
    }
  }
  return out;
}

/** Plugins use `name` (not `pluginName`) as their identity. */
function refMatchesPlugin(ref: BundleSkillRef, plugin: Plugin): boolean {
  if (typeof ref === 'string') return plugin.name === ref;
  if (plugin.name !== ref.name) return false;
  if (ref.source && (plugin.source.owner !== ref.source.owner || plugin.source.repo !== ref.source.repo)) return false;
  return true;
}

export function resolveBundlePlugins(refs: BundleSkillRef[] | undefined, allPlugins: Plugin[]): Plugin[] {
  const seen = new Set<string>();
  const out: Plugin[] = [];
  for (const ref of refs ?? []) {
    for (const plugin of allPlugins) {
      if (!refMatchesPlugin(ref, plugin)) continue;
      const key = `${plugin.source.owner}/${plugin.source.repo}::${plugin.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(plugin);
    }
  }
  return out;
}

// Back-compat alias — callers that only deal with skills.
export function resolveBundleSkills(bundle: Bundle, allSkills: Skill[]): Skill[] {
  return resolveBundleEntityArray(bundle.skills, allSkills);
}

/** Resolve all entity kinds a bundle references, returning them as a flat list. */
export function resolveBundleAll(
  bundle: Bundle,
  index: {
    skills?:     Skill[];
    agents?:     Agent[];
    hooks?:      Hook[];
    commands?:   Command[];
    mcpServers?: McpServer[];
    plugins?:    Plugin[];
  },
): Array<Skill | Agent | Hook | Command | McpServer | Plugin> {
  return [
    ...resolveBundleEntityArray(bundle.skills,     index.skills     ?? []),
    ...resolveBundleEntityArray(bundle.agents,     index.agents     ?? []),
    ...resolveBundleEntityArray(bundle.hooks,      index.hooks      ?? []),
    ...resolveBundleEntityArray(bundle.commands,   index.commands   ?? []),
    ...resolveBundleEntityArray(bundle.mcpServers, index.mcpServers ?? []),
    ...resolveBundlePlugins(    bundle.plugins,    index.plugins    ?? []),
  ];
}
