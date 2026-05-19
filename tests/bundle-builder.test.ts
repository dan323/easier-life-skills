/**
 * Custom Bundle Builder regression tests.
 *
 * Covers:
 *  - add/remove skill cards via + Bundle button
 *  - bundle drawer opens on first selection, hides when empty
 *  - install-script generation (deduplication, correct commands)
 *  - URL hash persistence (b= params)
 *  - URL round-trip (boot from hash)
 *  - Copy-all button copies the install script
 *  - Clear button empties the bundle
 */

import { describe, it, expect } from 'vitest';
import { bootApp, click, flush } from './harness.ts';
import { buildInstallScript, findContainingBundle } from '../assets/src/bundle-state.ts';
import type { BundleItem } from '../assets/src/bundle-state.ts';

const SOURCES = {
  'dan323/easier-life-skills': { isMarketplace: true },
  'external/slack-tools':      { isMarketplace: false },
};

function makeItem(overrides: Partial<BundleItem>): BundleItem {
  return {
    id:             'skill/dan323/easier-life-skills/docs/changelog',
    name:           'changelog',
    kind:           'skill',
    installCommand: '/plugin install docs@easier-life-skills',
    repo:           'dan323/easier-life-skills',
    isMarketplace:  true,
    ...overrides,
  };
}

describe('buildInstallScript — unit', () => {
  it('emits marketplace-add before install for marketplace repos', () => {
    const script = buildInstallScript([makeItem({})], SOURCES);
    const lines = script.split('\n');
    expect(lines[0]).toBe('/plugin marketplace add dan323/easier-life-skills');
    expect(lines[1]).toBe('');
    expect(lines[2]).toBe('/plugin install docs@easier-life-skills');
  });

  it('does NOT emit marketplace-add for plugin-only repos', () => {
    const item = makeItem({
      name:           'post-slack',
      kind:           'skill',
      pluginName:     'slack-tools',
      installCommand: '/plugin install slack-tools@slack-tools',
      repo:           'external/slack-tools',
      isMarketplace:  false,
    });
    const script = buildInstallScript([item], SOURCES);
    expect(script).not.toContain('/plugin marketplace add');
    expect(script).toContain('npx @dan323/easier-life-skills --plugin slack-tools');
  });

  it('deduplicates plugin-only npx commands by plugin name', () => {
    const makePluginOnlySkill = (name: string) => makeItem({
      name,
      kind:           'skill',
      pluginName:     'slack-tools',
      installCommand: '/plugin install slack-tools@slack-tools',
      repo:           'external/slack-tools',
      isMarketplace:  false,
      id:             `skill/external/slack-tools/slack-tools/${name}`,
    });
    const script = buildInstallScript([makePluginOnlySkill('post-slack'), makePluginOnlySkill('get-slack')], SOURCES);
    const matches = script.match(/npx @dan323\/easier-life-skills --plugin slack-tools/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('deduplicates marketplace-add when multiple items share a repo', () => {
    const items = [
      makeItem({ name: 'changelog',       installCommand: '/plugin install docs@easier-life-skills' }),
      makeItem({ name: 'document-project', installCommand: '/plugin install docs@easier-life-skills', id: 'skill/dan323/easier-life-skills/docs/document-project' }),
    ];
    const script = buildInstallScript(items, SOURCES);
    const addMatches = script.match(/\/plugin marketplace add dan323\/easier-life-skills/g) ?? [];
    expect(addMatches.length).toBe(1);
  });
});

// Switch to the skills view, returning card name buttons
async function openSkillsView() {
  await bootApp();
  click('#view-skills');
  await flush();
}

function bundleButton(skillName: string): HTMLButtonElement | null {
  const cards = document.querySelectorAll('#skills-grid .skill-card');
  for (const card of Array.from(cards)) {
    const nameEl = card.querySelector('.card-name-text');
    if (nameEl?.textContent === skillName) {
      return card.querySelector<HTMLButtonElement>('.bundle-add-btn');
    }
  }
  return null;
}

function drawerVisible(): boolean {
  return document.querySelector('#bundle-drawer')?.classList.contains('bundle-drawer--open') ?? false;
}

function drawerItems(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('#bundle-drawer .bundle-drawer-item-name')
  ).map(el => el.textContent ?? '');
}

function scriptText(): string {
  return document.querySelector<HTMLElement>('#bundle-script')?.textContent ?? '';
}

describe('Custom bundle builder — add/remove', () => {
  it('bundle drawer is hidden when nothing is selected', async () => {
    await openSkillsView();
    expect(drawerVisible()).toBe(false);
  });

  it('clicking + Bundle on a skill opens the drawer', async () => {
    await openSkillsView();
    bundleButton('changelog')?.click();
    await flush();
    expect(drawerVisible()).toBe(true);
  });

  it('selected skill appears in the drawer list', async () => {
    await openSkillsView();
    bundleButton('changelog')?.click();
    await flush();
    expect(drawerItems()).toContain('changelog');
  });

  it('button label changes to "✓ Bundled" after selection', async () => {
    await openSkillsView();
    bundleButton('changelog')?.click();
    await flush();
    const btn = bundleButton('changelog');
    expect(btn?.textContent).toContain('Bundled');
  });

  it('clicking the button again removes the item and reverts label', async () => {
    await openSkillsView();
    bundleButton('changelog')?.click();
    await flush();
    bundleButton('changelog')?.click();
    await flush();
    expect(drawerItems()).not.toContain('changelog');
    const btn = bundleButton('changelog');
    expect(btn?.textContent).toContain('+ Bundle');
  });

  it('drawer hides when all items are removed', async () => {
    await openSkillsView();
    bundleButton('changelog')?.click();
    await flush();
    bundleButton('changelog')?.click();
    await flush();
    expect(drawerVisible()).toBe(false);
  });

  it('can add multiple skills and all appear in the drawer', async () => {
    await openSkillsView();
    bundleButton('changelog')?.click();
    bundleButton('find-dead-code')?.click();
    await flush();
    const items = drawerItems();
    expect(items).toContain('changelog');
    expect(items).toContain('find-dead-code');
  });

  it('remove button inside drawer removes that item', async () => {
    await openSkillsView();
    bundleButton('changelog')?.click();
    bundleButton('find-dead-code')?.click();
    await flush();
    // Find the remove button for 'changelog'
    const drawerItemEls = document.querySelectorAll<HTMLElement>('#bundle-drawer .bundle-drawer-item');
    for (const el of Array.from(drawerItemEls)) {
      if (el.querySelector('.bundle-drawer-item-name')?.textContent === 'changelog') {
        el.querySelector<HTMLButtonElement>('.bundle-drawer-remove')?.click();
        break;
      }
    }
    await flush();
    expect(drawerItems()).not.toContain('changelog');
    expect(drawerItems()).toContain('find-dead-code');
  });

  it('clear button empties the drawer', async () => {
    await openSkillsView();
    bundleButton('changelog')?.click();
    bundleButton('find-dead-code')?.click();
    await flush();
    click('#bundle-drawer .bundle-drawer-clear');
    await flush();
    expect(drawerVisible()).toBe(false);
    expect(drawerItems()).toHaveLength(0);
  });
});

describe('Custom bundle builder — install script', () => {
  it('generates an install command for the selected skill', async () => {
    await openSkillsView();
    bundleButton('changelog')?.click();
    await flush();
    const script = scriptText();
    expect(script).toContain('/plugin marketplace add dan323/easier-life-skills');
    expect(script).toContain('/plugin install');
    expect(script).toContain('easier-life-skills');
  });

  it('deduplicates skills that share the same install command', async () => {
    await openSkillsView();
    // Both changelog and document-project belong to the docs plugin
    bundleButton('changelog')?.click();
    bundleButton('document-project')?.click();
    await flush();
    const script = scriptText();
    // The install command should appear only once, not twice
    const installMatches = script.match(/\/plugin install docs@easier-life-skills/g) ?? [];
    expect(installMatches.length).toBe(1);
    // The marketplace-add command should also appear only once
    const addMatches = script.match(/\/plugin marketplace add dan323\/easier-life-skills/g) ?? [];
    expect(addMatches.length).toBe(1);
  });

  it('copy-all button copies the install script', async () => {
    const { clipboardWrites } = await bootApp();
    click('#view-skills');
    await flush();
    bundleButton('changelog')?.click();
    await flush();
    click('#bundle-drawer .bundle-drawer-copy');
    await flush();
    expect(clipboardWrites.length).toBeGreaterThan(0);
    expect(clipboardWrites[clipboardWrites.length - 1]).toContain('/plugin install');
  });
});

describe('Custom bundle builder — URL persistence', () => {
  it('selected items are encoded in the URL hash', async () => {
    await openSkillsView();
    bundleButton('changelog')?.click();
    await flush();
    expect(location.hash).toContain('b=');
  });

  it('round-trips: bundle survives a page reload (boot from hash)', async () => {
    // First boot: select a skill to get the hash
    await openSkillsView();
    bundleButton('changelog')?.click();
    await flush();
    const hash = location.hash;
    expect(hash).toContain('b=');

    // Second boot: restore state from hash
    await bootApp({ hash });
    click('#view-skills');
    await flush();
    expect(drawerVisible()).toBe(true);
    expect(drawerItems()).toContain('changelog');
  });

  it('corrupt b= token in hash is silently ignored', async () => {
    await bootApp({ hash: '#b=corrupt%7Ctoken' });
    await flush();
    // Should not crash, drawer should be empty
    expect(drawerVisible()).toBe(false);
  });
});

const BUNDLES = [
  { id: 'docs-bundle', name: 'Docs Bundle', skills: ['changelog', 'document-project'] },
  { id: 'audit-bundle', name: 'Audit Bundle', skills: ['find-dead-code'] },
];

const BUNDLES_WITH_AGENTS = [
  { id: 'docs-bundle',  name: 'Docs Bundle',  skills: ['changelog', 'document-project'], agents: ['doc-agent'] },
  { id: 'audit-bundle', name: 'Audit Bundle', skills: ['find-dead-code'] },
];

describe('findContainingBundle — unit', () => {
  const skill = (name: string): BundleItem => makeItem({ name, kind: 'skill', id: `skill/dan323/easier-life-skills/docs/${name}` });
  const agent = (name: string): BundleItem => makeItem({ name, kind: 'agent', id: `agent/dan323/easier-life-skills/docs/${name}` });

  it('returns null for empty items', () => {
    expect(findContainingBundle([], BUNDLES_WITH_AGENTS)).toBeNull();
  });

  it('finds a bundle that covers all selected skills', () => {
    const result = findContainingBundle([skill('changelog'), skill('document-project')], BUNDLES_WITH_AGENTS);
    expect(result?.name).toBe('Docs Bundle');
  });

  it('finds a bundle when only a subset of its skills are selected', () => {
    const result = findContainingBundle([skill('changelog')], BUNDLES_WITH_AGENTS);
    expect(result?.name).toBe('Docs Bundle');
  });

  it('finds a bundle that covers a mix of skills and agents', () => {
    const result = findContainingBundle([skill('changelog'), agent('doc-agent')], BUNDLES_WITH_AGENTS);
    expect(result?.name).toBe('Docs Bundle');
  });

  it('returns null when an agent is not in any bundle', () => {
    const result = findContainingBundle([agent('unknown-agent')], BUNDLES_WITH_AGENTS);
    expect(result).toBeNull();
  });

  it('returns null when items span multiple bundles', () => {
    const result = findContainingBundle([skill('changelog'), skill('find-dead-code')], BUNDLES_WITH_AGENTS);
    expect(result).toBeNull();
  });

  it('returns null when no bundle covers the selected item', () => {
    const result = findContainingBundle([skill('unknown-skill')], BUNDLES_WITH_AGENTS);
    expect(result).toBeNull();
  });
});

describe('Custom bundle builder — bundle suggestion', () => {
  it('shows a suggestion when all selected skills are in a named bundle', async () => {
    await openSkillsView();
    // docs-bundle covers both changelog and document-project
    bundleButton('changelog')?.click();
    bundleButton('document-project')?.click();
    await flush();
    const suggestion = document.querySelector('.bundle-drawer-suggestion');
    expect(suggestion).not.toBeNull();
    expect(suggestion?.textContent).toContain('docs-bundle');
  });

  it('hides the suggestion when skills span multiple bundles', async () => {
    await openSkillsView();
    bundleButton('changelog')?.click();
    bundleButton('find-dead-code')?.click();
    await flush();
    expect(document.querySelector('.bundle-drawer-suggestion')).toBeNull();
  });

  it('clicking "Go to bundle" switches to the bundles view', async () => {
    await openSkillsView();
    bundleButton('changelog')?.click();
    bundleButton('document-project')?.click();
    await flush();
    click('.bundle-drawer-goto');
    await flush();
    expect(document.getElementById('view-bundles')?.getAttribute('aria-pressed')).toBe('true');
  });
});
