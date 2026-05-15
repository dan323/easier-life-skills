/* lib/bundle-resolve.ts — shared bundle-skill resolution.
 *
 * A bundle's `skills` array can mix two reference forms:
 *   - bare string `"foo"`            → every skill named `foo`, across all
 *                                       marketplaces (legacy behaviour)
 *   - object `{ name, source?, pluginName? }`
 *                                    → narrow by repo and/or pluginName so
 *                                       same-named skills from different
 *                                       plugins don't get conflated.
 *
 * Used by both the build-time bundle membership tagging and the runtime
 * catalog/web rendering paths so they agree on what a bundle resolves to.
 */

import type { Bundle, BundleSkillRef, Skill } from './types.js';

/** The plain name a ref refers to, regardless of form. */
export function bundleSkillName(ref: BundleSkillRef): string {
  return typeof ref === 'string' ? ref : ref.name;
}

/** Predicate: does this skill satisfy this ref? */
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

/**
 * Expand a bundle's skill refs to actual Skill records, deduped. A ref that
 * matches multiple skills (e.g. a bare-string ref hitting same-named skills
 * in two marketplaces) yields all of them — that is intentional, since the
 * bundle says "install whichever copy you have."
 */
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
