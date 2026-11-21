import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bootApp, cardByName, click } from './harness.ts';

const base = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/skills_index.json'), 'utf8'));
const SRC = { owner: 'dan323', repo: 'easier-life-skills' };

function fixtureWithBundles() {
  return {
    ...base,
    bundles: [
      { name: 'object-ref', description: 'x', skills: [{ name: 'changelog', source: SRC, pluginName: 'docs' }] },
      { name: 'wrong-plugin', description: 'x', skills: [{ name: 'changelog', source: SRC, pluginName: 'other' }] },
      { name: 'string-ref', description: 'x', skills: ['changelog'] },
    ],
  };
}

describe('entity panel — skill bundle membership', () => {
  it('lists bundles whose object refs match the skill, and skips narrowed-out ones', async () => {
    await bootApp({ fixture: fixtureWithBundles() });
    click('#view-skills');
    click(cardByName('skills-grid', 'changelog'));
    const names = Array.from(document.querySelectorAll('#entity-panel-bundles-list .panel-bundle-name'))
      .map(n => n.textContent);
    expect(names).toEqual(['object-ref', 'string-ref']);
  });
});
