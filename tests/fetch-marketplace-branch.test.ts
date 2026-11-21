import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchMarketplaceSkills } from '../scripts/lib/fetch-marketplace.ts';

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'fm-branch-'));
  mkdirSync(join(root, '.claude-plugin'), { recursive: true });
  writeFileSync(join(root, '.claude-plugin', 'marketplace.json'), JSON.stringify({
    plugins: [{ name: 'demo', source: './plugins/demo', description: 'd' }],
  }));
  const skillDir = join(root, 'plugins', 'demo', 'skills', 'demo');
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), '---\nname: demo\ndescription: demo skill\n---\nBody\n');
  return root;
}

describe('fetchMarketplaceSkills branch selection', () => {
  const dirs: string[] = [];
  afterEach(() => { vi.unstubAllGlobals(); dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })); });

  it('uses the explicit branch hint for raw URLs of a local root', async () => {
    const root = makeRepo(); dirs.push(root);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    const res = await fetchMarketplaceSkills('o', 'r', root, 'master');
    expect(res.skills[0]!.rawSkillUrl).toBe('https://raw.githubusercontent.com/o/r/master/plugins/demo/skills/demo/SKILL.md');
  });

  it('probes remote branches for a local root when no hint is given', async () => {
    const root = makeRepo(); dirs.push(root);
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('/master/')
        ? new Response('{"plugins":[]}', { status: 200 })
        : new Response('nope', { status: 404 })));
    const res = await fetchMarketplaceSkills('o', 'r', root);
    expect(res.skills[0]!.rawSkillUrl).toContain('/o/r/master/');
  });
});
