import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let cfg: string;
let writeShim: typeof import('../src/lib/shim.js').writeShim;

beforeAll(async () => {
  cfg = mkdtempSync(join(tmpdir(), 'shim-test-'));
  process.env.XDG_CONFIG_HOME = cfg; // read at module load
  ({ writeShim } = await import('../src/lib/shim.js'));
});
afterAll(() => rmSync(cfg, { recursive: true, force: true }));

const inst = (pluginName: string) => ({
  pluginName,
  source: { owner: 'o', repo: 'r', repoUrl: 'https://github.com/o/r' },
});

describe('writeShim', () => {
  it('writes the shim for a normal plugin name', () => {
    const dir = writeShim(inst('good-plugin'), new Set(), false);
    expect(dir.startsWith(cfg)).toBe(true);
    const json = JSON.parse(readFileSync(join(dir, '.claude-plugin', 'marketplace.json'), 'utf8'));
    expect(json.plugins[0].name).toBe('good-plugin');
  });

  it.each(['../../escape', '..', 'a/b', 'a\b', '-rf', '', '.hidden/../x'])('refuses %j and writes nothing', (name) => {
    expect(() => writeShim(inst(name), new Set(), false)).toThrow(/unsafe plugin name/);
    expect(existsSync(join(cfg, '..', 'escape'))).toBe(false);
  });
});
