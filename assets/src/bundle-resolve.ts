/* assets/src/bundle-resolve.ts — runtime mirror of scripts/lib/bundle-resolve.ts.
 *
 * Resolves the heterogeneous `Bundle.skills` array (string | { name, source?,
 * pluginName? }) to actual Skill records, deduped. A bare string still matches
 * any skill with that name across marketplaces; the object form narrows the
 * match when two plugins ship a same-named skill.
 */

import type { Bundle, BundleSkillRef, Skill } from './types.ts';

export function bundleSkillName(ref: BundleSkillRef): string {
  return typeof ref === 'string' ? ref : ref.name;
}

export function refMatchesSkill(ref: BundleSkillRef, skill: Skill): boolean {
  if (typeof ref === 'string') return skill.name === ref;
  if (skill.name !== ref.name) return false;
  if (ref.source && (skill.source.owner !== ref.source.owner || skill.source.repo !== ref.source.repo)) return false;
  if (ref.pluginName && skill.pluginName !== ref.pluginName) return false;
  return true;
}

function skillKey(s: Skill): string {
  return `${s.source.owner}/${s.source.repo}::${s.pluginName}::${s.name}`;
}

export function resolveBundleSkills(bundle: Bundle, allSkills: Skill[]): Skill[] {
  const seen = new Set<string>();
  const out: Skill[] = [];
  for (const ref of bundle.skills ?? []) {
    for (const skill of allSkills) {
      if (!refMatchesSkill(ref, skill)) continue;
      const key = skillKey(skill);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(skill);
    }
  }
  return out;
}
