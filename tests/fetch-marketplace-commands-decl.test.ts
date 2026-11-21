import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchMarketplaceSkills } from '../scripts/lib/fetch-marketplace.ts';

function makeRepo(commands: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'fm-cmds-'));
  mkdirSync(join(root, '.claude-plugin'), { recursive: true });
  writeFileSync(join(root, '.claude-plugin', 'marketplace.json'), JSON.stringify({
    plugins: [{ name: 'demo', source: './plugins/demo' }],
  }));
  const pdir = join(root, 'plugins', 'demo');
  mkdirSync(join(pdir, '.claude-plugin'), { recursive: true });
  mkdirSync(join(pdir, 'commands', 'project'), { recursive: true });
  writeFileSync(join(pdir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'demo', commands }));
  writeFileSync(join(pdir, 'commands', 'a.md'), '---\ndescription: command a\n---\nBody A\n');
  writeFileSync(join(pdir, 'commands', 'project', 'b.md'), '---\ndescription: command b\n---\nBody B\n');
  return root;
}

describe('plugin.json commands declaration forms', () => {
  const dirs: string[] = [];
  afterEach(() => { vi.unstubAllGlobals(); dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })); });
  const run = async (commands: unknown) => {
    const root = makeRepo(commands); dirs.push(root);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    return fetchMarketplaceSkills('o', 'r', root, 'main');
  };

  it('reads an object map of { name: { source } }, keeping the declared names', async () => {
    const res = await run({
      'project:b': { source: './commands/project/b.md' },
      a: './commands/a.md',
      broken: { notSource: true },
    });
    expect(res.commands.map(c => c.name).sort()).toEqual(['a', 'project:b']);
    expect(res.commands.find(c => c.name === 'project:b')!.description).toBe('command b');
    expect(res.plugins[0]!.commands.sort()).toEqual(['a', 'project:b']);
  });

  it('still reads the array and directory forms', async () => {
    expect((await run(['./commands/a.md'])).commands.map(c => c.name)).toEqual(['a']);
    expect((await run('./commands/')).commands.map(c => c.name)).toEqual(['a']);
  });

  it('ignores a malformed declaration instead of crashing the build', async () => {
    expect((await run(42)).commands).toEqual([]);
    expect((await run([1, null, './commands/a.md'])).commands.map(c => c.name)).toEqual(['a']);
  });
});
