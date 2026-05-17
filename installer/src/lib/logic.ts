// Pure, side-effect-free functions — fully testable without mocking.

import type {
  Bundle,
  BundleSkillRef,
  InstalledPlugin,
  Skill,
  Sources,
} from './types.js';

// ── Source routing ────────────────────────────────────────────────────────────

export function isMarketplaceSource(skill: Skill, sources: Sources): boolean {
  const key = `${skill.source.owner}/${skill.source.repo}`;
  return sources[key]?.isMarketplace !== false;
}

export function describeTarget(skill: Skill, sources: Sources): string {
  if (isMarketplaceSource(skill, sources)) return `${skill.pluginName}@${skill.source.repo}`;
  return `${skill.pluginName}@${skill.pluginName} (shim → ${skill.source.repoUrl})`;
}

// Deduped, user-friendly list of marketplaces that will be added (or already
// are registered) for the given skills. Marketplace-source skills surface as
// `<owner>/<repo>`; plugin-only sources surface as a shim hint so users see
// where the synthetic marketplace comes from.
export function marketplacesForSkills(skills: Skill[], sources: Sources): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const skill of skills) {
    const label = isMarketplaceSource(skill, sources)
      ? `${skill.source.owner}/${skill.source.repo}`
      : `${skill.pluginName} (auto-generated shim → ${skill.source.owner}/${skill.source.repo})`;
    if (!seen.has(label)) {
      seen.add(label);
      out.push(label);
    }
  }
  return out;
}

// ── Search ────────────────────────────────────────────────────────────────────

export function filterSkills(skills: Skill[], query: string): Skill[] {
  const q = query.toLowerCase();
  return skills.filter((s) =>
    s.name.toLowerCase().includes(q) ||
    (s.description || '').toLowerCase().includes(q) ||
    (s.keywords || []).some((k) => String(k).toLowerCase().includes(q))
  );
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

export function computeKnownMarketplaces(
  skills: Skill[],
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
  for (const s of skills) {
    if (sources[`${s.source.owner}/${s.source.repo}`]?.isMarketplace === false) {
      known.add(s.pluginName);
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
