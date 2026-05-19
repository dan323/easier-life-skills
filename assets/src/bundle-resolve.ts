/* assets/src/bundle-resolve.ts — runtime mirror of scripts/lib/bundle-resolve.ts.
 *
 * Resolves the heterogeneous bundle ref arrays (string | { name, source?,
 * pluginName? }) to actual entity records, deduped. A bare string still matches
 * any entity with that name across marketplaces; the object form narrows the
 * match when two plugins ship a same-named entity.
 */

import type { Bundle, BundleSkillRef, Skill, Agent, Hook, Command, McpServer, Plugin } from './types.ts';

type NamedEntity = { name: string; source: { owner: string; repo: string }; pluginName?: string };

export function bundleSkillName(ref: BundleSkillRef): string {
  return typeof ref === 'string' ? ref : ref.name;
}

export function refMatchesEntity(ref: BundleSkillRef, entity: NamedEntity): boolean {
  if (typeof ref === 'string') return entity.name === ref;
  if (entity.name !== ref.name) return false;
  if (ref.source && (entity.source.owner !== ref.source.owner || entity.source.repo !== ref.source.repo)) return false;
  if (ref.pluginName != null && entity.pluginName !== ref.pluginName) return false;
  return true;
}

// Back-compat alias.
export const refMatchesSkill = refMatchesEntity;

function entityKey(e: NamedEntity): string {
  return `${e.source.owner}/${e.source.repo}::${e.pluginName ?? ''}::${e.name}`;
}

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
