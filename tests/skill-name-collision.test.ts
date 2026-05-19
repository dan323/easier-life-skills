import { describe, it, expect } from 'vitest';
import { bootApp, click, flush } from './harness.ts';

/**
 * Two plugins ship a skill called `changelog`:
 *   - dan323/easier-life-skills · plugin `docs`      → category 'documentation'
 *   - other/marketplace         · plugin `release`   → category 'devops'
 *
 * Plus a third plugin `docs-alt` lives in the SAME repo as `docs` and also
 * ships a skill called `changelog`. This locks in:
 *   - cross-repo collisions render as two separate cards
 *   - intra-repo two-plugin collisions also render as separate cards
 *   - opening the `docs` plugin panel pulls in `docs`'s changelog (not
 *     `docs-alt`'s) thanks to (repo, pluginName, name) scoping
 *   - a bundle ref scoped via `{ name, source }` only attaches the matching
 *     skill, leaving the other repo's same-named skill alone
 */
const FIXTURE = {
  meta: {
    generated: '2026-05-14T00:00:00.000Z',
    marketplaces: ['dan323/easier-life-skills', 'other/marketplace'],
    sources: {
      'dan323/easier-life-skills': { isMarketplace: true },
      'other/marketplace':         { isMarketplace: true },
    },
    pluginCount: 3, skillCount: 3, agentCount: 0, mcpServerCount: 0, commandCount: 0, hookCount: 0,
  },
  plugins: [
    {
      name: 'docs',
      description: 'docs bundle',
      category: 'documentation',
      homepage: null,
      skills: ['changelog'],
      agents: [], mcpServers: [], commands: [], hooks: [],
      installCommand: '/plugin install docs@easier-life-skills',
      source: { owner: 'dan323', repo: 'easier-life-skills', repoUrl: 'https://github.com/dan323/easier-life-skills' },
    },
    {
      name: 'docs-alt',
      description: 'alternate docs plugin in the same repo',
      category: 'documentation',
      homepage: null,
      skills: ['changelog'],
      agents: [], mcpServers: [], commands: [], hooks: [],
      installCommand: '/plugin install docs-alt@easier-life-skills',
      source: { owner: 'dan323', repo: 'easier-life-skills', repoUrl: 'https://github.com/dan323/easier-life-skills' },
    },
    {
      name: 'release',
      description: 'release helper',
      category: 'devops',
      homepage: null,
      skills: ['changelog'],
      agents: [], mcpServers: [], commands: [], hooks: [],
      installCommand: '/plugin install release@marketplace',
      source: { owner: 'other', repo: 'marketplace', repoUrl: 'https://github.com/other/marketplace' },
    },
  ],
  skills: [
    {
      name: 'changelog',
      pluginName: 'docs',
      description: 'CHANGELOG.md (docs flavour)',
      category: 'documentation',
      keywords: [],
      tools: ['Read', 'Write'],
      readOnly: false,
      rawSkillUrl: 'https://raw.githubusercontent.com/dan323/easier-life-skills/master/plugins/docs/skills/changelog/SKILL.md',
      installCommand: '/plugin install docs@easier-life-skills',
      source: { owner: 'dan323', repo: 'easier-life-skills', repoUrl: 'https://github.com/dan323/easier-life-skills' },
    },
    {
      name: 'changelog',
      pluginName: 'docs-alt',
      description: 'CHANGELOG.md (alt flavour)',
      category: 'documentation',
      keywords: [],
      tools: ['Read', 'Write'],
      readOnly: false,
      rawSkillUrl: 'https://raw.githubusercontent.com/dan323/easier-life-skills/master/plugins/docs-alt/skills/changelog/SKILL.md',
      installCommand: '/plugin install docs-alt@easier-life-skills',
      source: { owner: 'dan323', repo: 'easier-life-skills', repoUrl: 'https://github.com/dan323/easier-life-skills' },
    },
    {
      name: 'changelog',
      pluginName: 'release',
      description: 'CHANGELOG.md (release flavour)',
      category: 'devops',
      keywords: [],
      tools: ['Read', 'Write'],
      readOnly: false,
      rawSkillUrl: 'https://raw.githubusercontent.com/other/marketplace/master/plugins/release/skills/changelog/SKILL.md',
      installCommand: '/plugin install release@marketplace',
      source: { owner: 'other', repo: 'marketplace', repoUrl: 'https://github.com/other/marketplace' },
    },
  ],
  agents: [], mcpServers: [], commands: [], hooks: [],
  bundles: [
    {
      // Object-form ref pins the dan323 docs `changelog` specifically — the
      // other two same-named skills must NOT pick up this bundle's membership.
      id: 'docs-only',
      name: 'Docs-Only Bundle',
      description: 'Pins changelog to dan323/easier-life-skills · docs',
      skills: [
        { name: 'changelog', source: { owner: 'dan323', repo: 'easier-life-skills' }, pluginName: 'docs' },
      ],
      source: { owner: 'dan323', repo: 'easier-life-skills', repoUrl: 'https://github.com/dan323/easier-life-skills' },
    },
  ],
};

describe('same-name skills across plugins', () => {
  it('renders one skill card per (repo, plugin, name) triplet', async () => {
    await bootApp({ fixture: FIXTURE });
    click('#view-skills');
    await flush();
    const cards = document.querySelectorAll<HTMLElement>('#skills-grid .skill-card');
    expect(cards.length).toBe(3);
    const descriptions = Array.from(cards)
      .map(c => c.querySelector('.card-desc')?.textContent ?? '')
      .sort();
    expect(descriptions).toEqual([
      'CHANGELOG.md (alt flavour)',
      'CHANGELOG.md (docs flavour)',
      'CHANGELOG.md (release flavour)',
    ]);
  });

  it('opening the docs plugin shows the docs-flavour changelog, not docs-alt', async () => {
    await bootApp({ fixture: FIXTURE });
    click('#view-plugins');
    await flush();
    const docsCard = Array.from(document.querySelectorAll<HTMLElement>('#plugins-grid .card-name'))
      .find(el => (el.querySelector('.card-name-text')?.textContent ?? '') === 'docs');
    docsCard!.click();
    await flush();
    const panelSkillDesc = document.querySelector('#panel-skills-list .card-desc')?.textContent;
    expect(panelSkillDesc).toBe('CHANGELOG.md (docs flavour)');
    const panelSkillCount = document.getElementById('panel-skills-count')?.textContent;
    expect(panelSkillCount).toBe('1');
  });

  it('opening docs-alt shows only the alt-flavour changelog', async () => {
    await bootApp({ fixture: FIXTURE });
    click('#view-plugins');
    await flush();
    const altCard = Array.from(document.querySelectorAll<HTMLElement>('#plugins-grid .card-name'))
      .find(el => (el.querySelector('.card-name-text')?.textContent ?? '') === 'docs-alt');
    altCard!.click();
    await flush();
    const panelSkillDesc = document.querySelector('#panel-skills-list .card-desc')?.textContent;
    expect(panelSkillDesc).toBe('CHANGELOG.md (alt flavour)');
  });

  it('object-scoped bundle ref attaches only to the matching plugin', async () => {
    await bootApp({ fixture: FIXTURE });
    click('#view-plugins');
    await flush();

    const open = (name: string) => {
      const card = Array.from(document.querySelectorAll<HTMLElement>('#plugins-grid .card-name'))
        .find(el => (el.querySelector('.card-name-text')?.textContent ?? '') === name);
      card!.click();
    };

    // docs should advertise the docs-only bundle…
    open('docs');
    await flush();
    let bundleSection = document.getElementById('panel-bundles-section');
    expect(bundleSection?.style.display).not.toBe('none');
    expect(document.getElementById('panel-bundles-list')?.textContent ?? '').toContain('Docs-Only Bundle');
    click('#panel-close');
    await flush();

    // …docs-alt must NOT.
    open('docs-alt');
    await flush();
    bundleSection = document.getElementById('panel-bundles-section');
    expect(bundleSection?.style.display).toBe('none');
    click('#panel-close');
    await flush();

    // release in the other repo also must NOT pick up the docs-only bundle.
    open('release');
    await flush();
    bundleSection = document.getElementById('panel-bundles-section');
    expect(bundleSection?.style.display).toBe('none');
  });

  it('bundling one same-name skill does not mark the others as bundled', async () => {
    await bootApp({ fixture: FIXTURE });
    click('#view-skills');
    await flush();

    const cards = Array.from(document.querySelectorAll<HTMLElement>('#skills-grid .skill-card'));
    const docsCard = cards.find(card => card.querySelector('.card-desc')?.textContent === 'CHANGELOG.md (docs flavour)');
    docsCard?.querySelector<HTMLButtonElement>('.bundle-add-btn')?.click();
    await flush();

    const bundledButtons = Array.from(document.querySelectorAll<HTMLElement>('#skills-grid .bundle-add-btn'))
      .filter(btn => (btn.textContent ?? '').includes('Bundled'));
    expect(bundledButtons).toHaveLength(1);
  });
});
