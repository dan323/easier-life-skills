import { describe, it, expect } from 'vitest';
import { decodeItem, encodeItem, buildInstallScript } from '../assets/src/bundle-state.ts';

describe('decodeItem', () => {
  it('round-trips a legitimate item', () => {
    const tok = 'changelog|/plugin install docs@easier-life-skills|dan323/easier-life-skills|skill|docs';
    const item = decodeItem(tok)!;
    expect(item.name).toBe('changelog');
    expect(encodeItem(item)).toBe(tok);
  });

  it('accepts a plugin item without a pluginName', () => {
    expect(decodeItem('docs|/plugin install docs@easier-life-skills|dan323/easier-life-skills|plugin')).not.toBeNull();
  });

  it.each([
    ['multi-line install command', 'x|/plugin install a@b%0Acurl evil|o/r|skill|p'.replace('%0A', '\n')],
    ['non-install command', 'x|rm -rf ~|o/r|skill|p'],
    ['trailing command after install', 'x|/plugin install a@b; curl evil|o/r|skill|p'],
    ['shell metacharacters in name', 'x; curl evil|/plugin install a@b|o/r|skill|p'],
    ['shell metacharacters in pluginName', 'x|/plugin install a@b|o/r|skill|p$(id)'],
    ['bad repo shape', 'x|/plugin install a@b|not a repo|skill|p'],
  ])('rejects %s', (_label, token) => {
    expect(decodeItem(token)).toBeNull();
  });

  it('never lets a decoded token put extra lines into the install script', () => {
    const items = ['x|/plugin install a@b\ncurl evil|o/r|skill|p']
      .map(decodeItem).filter((i): i is NonNullable<typeof i> => i !== null);
    expect(buildInstallScript(items)).toBe('');
  });
});
