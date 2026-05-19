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
    const matches = script.match(/\/plugin install docs@easier-life-skills/g) ?? [];
    expect(matches.length).toBe(1);
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
