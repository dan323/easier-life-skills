import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join } from 'path';
import {
  filterSkills, filterPlugins, resolveBundle,
  isMarketplaceSource, describeTarget,
  computeKnownMarketplaces, filterForUpdate,
  marketplacesForSkills, marketplacesForItems, toInstallable,
} from '../src/lib/logic.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixture = JSON.parse(readFileSync(join(__dirname, 'fixture.json'), 'utf8'));
const { skills, plugins, bundles, meta } = fixture;
const sources = meta.sources;

// ── filterSkills ──────────────────────────────────────────────────────────────

describe('filterSkills', () => {
  it('finds by description keyword', () => {
    const results = filterSkills(skills, 'logging');
    expect(results.map((s: any) => s.name)).toContain('improve-logging');
    expect(results.map((s: any) => s.name)).not.toContain('find-dead-code');
    expect(results.map((s: any) => s.name)).not.toContain('changelog');
  });

  it('finds by indexed keyword', () => {
    const results = filterSkills(skills, 'tdd');
    expect(results.map((s: any) => s.name)).toContain('tdd');
    expect(results.map((s: any) => s.name)).not.toContain('improve-logging');
  });

  it('finds by name prefix', () => {
    const results = filterSkills(skills, 'find-dead');
    expect(results.map((s: any) => s.name)).toContain('find-dead-code');
    expect(results.map((s: any) => s.name)).not.toContain('improve-logging');
  });

  it('returns empty array for no matches', () => {
    expect(filterSkills(skills, 'xyznonexistent')).toHaveLength(0);
  });
});

// ── resolveBundle ─────────────────────────────────────────────────────────────

describe('resolveBundle', () => {
  it('resolves object-ref skills', () => {
    const bundle = bundles.find((b: any) => b.id === 'code-quality');
    const resolved = resolveBundle(bundle, skills);
    expect(resolved.map((s: any) => s.name)).toContain('find-dead-code');
    expect(resolved.map((s: any) => s.name)).toContain('improve-logging');
  });

  it('resolves a mixed marketplace/plugin-only bundle', () => {
    const bundle = bundles.find((b: any) => b.id === 'mixed');
    const resolved = resolveBundle(bundle, skills);
    expect(resolved.map((s: any) => s.name)).toContain('changelog');
    expect(resolved.map((s: any) => s.name)).toContain('tdd');
  });

  it('ignores refs that do not match any skill', () => {
    const fakeBundle = { skills: [{ name: 'no-such-skill', source: { owner: 'x', repo: 'y' }, pluginName: 'z' }] };
    expect(resolveBundle(fakeBundle, skills)).toHaveLength(0);
  });
});

// ── isMarketplaceSource / describeTarget ─────────────────────────────────────

describe('isMarketplaceSource', () => {
  it('returns true for marketplace repos', () => {
    const skill = skills.find((s: any) => s.name === 'changelog');
    expect(isMarketplaceSource(skill, sources)).toBe(true);
  });

  it('returns false for plugin-only repos', () => {
    const skill = skills.find((s: any) => s.name === 'tdd');
    expect(isMarketplaceSource(skill, sources)).toBe(false);
  });
});

describe('describeTarget', () => {
  it('formats marketplace skill as pluginName@repo', () => {
    const skill = skills.find((s: any) => s.name === 'changelog');
    expect(describeTarget(skill, sources)).toBe('docs@easier-life-skills');
  });

  it('formats plugin-only skill with shim annotation', () => {
    const skill = skills.find((s: any) => s.name === 'tdd');
    expect(describeTarget(skill, sources)).toContain('mattpocock-skills@mattpocock-skills');
    expect(describeTarget(skill, sources)).toContain('shim');
  });
});

// ── marketplacesForSkills ─────────────────────────────────────────────────────

describe('marketplacesForSkills', () => {
  it('returns owner/repo for marketplace skills', () => {
    const skill = skills.find((s: any) => s.name === 'changelog');
    expect(marketplacesForSkills([skill], sources)).toEqual(['dan323/easier-life-skills']);
  });

  it('returns a shim hint for plugin-only skills', () => {
    const skill = skills.find((s: any) => s.name === 'tdd');
    const result = marketplacesForSkills([skill], sources);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('mattpocock-skills');
    expect(result[0]).toContain('shim');
  });

  it('dedupes across skills from the same marketplace', () => {
    const bundleSkills = skills.filter((s: any) =>
      s.name === 'find-dead-code' || s.name === 'improve-logging' || s.name === 'changelog',
    );
    expect(marketplacesForSkills(bundleSkills, sources)).toEqual(['dan323/easier-life-skills']);
  });

  it('returns one entry per distinct source across a mixed bundle', () => {
    const mixed = skills.filter((s: any) => s.name === 'changelog' || s.name === 'tdd');
    const result = marketplacesForSkills(mixed, sources);
    expect(result).toHaveLength(2);
    expect(result.some((m) => m === 'dan323/easier-life-skills')).toBe(true);
    expect(result.some((m) => m.includes('mattpocock-skills') && m.includes('shim'))).toBe(true);
  });
});

// ── computeKnownMarketplaces ─────────────────────────────────────────────────

describe('computeKnownMarketplaces', () => {
  it('includes the repo name for marketplace sources', () => {
    const known = computeKnownMarketplaces(skills, sources, 'easier-life-skills');
    expect(known.has('easier-life-skills')).toBe(true);
  });

  it('includes pluginName for plugin-only sources', () => {
    const known = computeKnownMarketplaces(skills, sources, 'easier-life-skills');
    expect(known.has('mattpocock-skills')).toBe(true);
  });

  it('always includes the primary marketplace name', () => {
    const known = computeKnownMarketplaces([], {}, 'my-primary');
    expect(known.has('my-primary')).toBe(true);
  });
});

// ── filterForUpdate ───────────────────────────────────────────────────────────

const INSTALLED = [
  { id: 'docs@easier-life-skills',       version: '1.0.1' },
  { id: 'code-audit@easier-life-skills', version: '2.0.0' },
  { id: 'unrelated@some-other-plugin',   version: '0.1.0' },
];

describe('filterForUpdate', () => {
  it('includes plugins from known marketplaces', () => {
    const known = new Set(['easier-life-skills']);
    const targets = filterForUpdate(INSTALLED, known);
    expect(targets.map((p: any) => p.id)).toContain('docs@easier-life-skills');
    expect(targets.map((p: any) => p.id)).toContain('code-audit@easier-life-skills');
  });

  it('excludes plugins from unknown marketplaces', () => {
    const known = new Set(['easier-life-skills']);
    const targets = filterForUpdate(INSTALLED, known);
    expect(targets.map((p: any) => p.id)).not.toContain('unrelated@some-other-plugin');
  });

  it('returns empty array when no known plugins are installed', () => {
    expect(filterForUpdate(INSTALLED, new Set())).toHaveLength(0);
  });

  it('filters by targetPluginName when provided', () => {
    const known = new Set(['easier-life-skills']);
    const targets = filterForUpdate(INSTALLED, known, 'docs');
    expect(targets).toHaveLength(1);
    expect(targets[0].id).toBe('docs@easier-life-skills');
  });
});

// ── filterPlugins ─────────────────────────────────────────────────────────────

describe('filterPlugins', () => {
  it('finds by plugin name', () => {
    const results = filterPlugins(plugins, 'cost-tracker');
    expect(results.map((p: any) => p.name)).toContain('cost-tracker');
  });

  it('finds hook-only plugins by hook name', () => {
    // The cost-tracker plugin ships no skills, only a hook called "cost-tracker".
    // Searching for "cost" still surfaces the plugin via its hook entry.
    const results = filterPlugins(plugins, 'cost');
    expect(results.map((p: any) => p.name)).toContain('cost-tracker');
  });

  it('finds by category', () => {
    const results = filterPlugins(plugins, 'documentation');
    expect(results.map((p: any) => p.name)).toContain('docs');
  });

  it('returns empty array for no matches', () => {
    expect(filterPlugins(plugins, 'xyznonexistent')).toHaveLength(0);
  });
});

// ── toInstallable / describeTarget on plugins ────────────────────────────────

describe('plugin install routing', () => {
  it('toInstallable produces the same shape for skills and plugins', () => {
    const skill = skills.find((s: any) => s.name === 'changelog');
    const plugin = plugins.find((p: any) => p.name === 'docs');
    expect(toInstallable(skill)).toEqual({ pluginName: 'docs', source: skill.source });
    expect(toInstallable(plugin)).toEqual({ pluginName: 'docs', source: plugin.source });
  });

  it('describeTarget routes a hook-only plugin through its marketplace', () => {
    const plugin = plugins.find((p: any) => p.name === 'cost-tracker');
    expect(describeTarget(plugin, sources)).toBe('cost-tracker@easier-life-skills');
  });

  it('marketplacesForItems works across mixed plugin/skill inputs', () => {
    const plugin = plugins.find((p: any) => p.name === 'cost-tracker');
    const skill = skills.find((s: any) => s.name === 'tdd');
    const result = marketplacesForItems([plugin, skill], sources);
    expect(result).toHaveLength(2);
    expect(result).toContain('dan323/easier-life-skills');
    expect(result.some((m: string) => m.includes('mattpocock-skills') && m.includes('shim'))).toBe(true);
  });
});

// ── computeKnownMarketplaces with plugins ─────────────────────────────────────

describe('computeKnownMarketplaces with plugin input', () => {
  it('still includes the primary and all marketplace sources', () => {
    const known = computeKnownMarketplaces(plugins, sources, 'easier-life-skills');
    expect(known.has('easier-life-skills')).toBe(true);
  });

  it('includes pluginName-as-shim-marketplace for plugin-only sources', () => {
    const known = computeKnownMarketplaces(plugins, sources, 'easier-life-skills');
    expect(known.has('mattpocock-skills')).toBe(true);
  });
});

// ── marketplacesForSkills back-compat ────────────────────────────────────────

describe('marketplacesForSkills back-compat alias', () => {
  it('still accepts Skill[] and matches marketplacesForItems', () => {
    const subset = skills.filter((s: any) => s.name === 'changelog' || s.name === 'tdd');
    expect(marketplacesForSkills(subset, sources)).toEqual(marketplacesForItems(subset, sources));
  });
});
