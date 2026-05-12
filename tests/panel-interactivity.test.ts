/**
 * Regression tests for a previously-introduced bug where opening a panel made
 * the panel itself uninteractable.
 *
 * Root cause: an ancestor of the panel (`#root`) was being given the `inert`
 * attribute while the panel was open. The panel lives inside `#root`, so the
 * panel itself — including its close button and overlay — became inert.
 *
 * happy-dom does NOT enforce `inert` (or `aria-hidden`), so any test that
 * merely calls `click('#panel-close')` and asserts the panel closes passes
 * even when the bug is present. These tests instead make DOM-state
 * assertions: while a panel is open, no ancestor of its interactive elements
 * may carry attributes that would block interaction in a real browser.
 */

import { describe, it, expect } from 'vitest';
import { bootApp, cardByName, click } from './harness.ts';

function ancestorWithAttr(el: Element | null, attr: string, value?: string): Element | null {
  let cur: Element | null = el;
  while (cur) {
    if (cur.hasAttribute(attr)) {
      if (value === undefined || cur.getAttribute(attr) === value) return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

function describeEl(el: Element): string {
  const id = el.id ? `#${el.id}` : '';
  const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(/\s+/).join('.')}` : '';
  return `<${el.tagName.toLowerCase()}${id}${cls}>`;
}

describe('plugin panel interactivity', () => {
  it('does not put `inert` on any ancestor of the open panel', async () => {
    await bootApp();
    click(cardByName('plugins-grid', 'changelog'));

    const closeBtn = document.getElementById('panel-close')!;
    const overlay  = document.getElementById('panel-overlay')!;

    const closeInert   = ancestorWithAttr(closeBtn, 'inert');
    const overlayInert = ancestorWithAttr(overlay,  'inert');

    expect(
      closeInert,
      `close button has inert ancestor: ${closeInert ? describeEl(closeInert) : ''}`,
    ).toBeNull();
    expect(
      overlayInert,
      `overlay has inert ancestor: ${overlayInert ? describeEl(overlayInert) : ''}`,
    ).toBeNull();
  });

  it('does not put aria-hidden="true" on any ancestor of the open panel', async () => {
    await bootApp();
    click(cardByName('plugins-grid', 'changelog'));

    const closeBtn = document.getElementById('panel-close')!;
    const hiddenAncestor = ancestorWithAttr(closeBtn, 'aria-hidden', 'true');

    expect(
      hiddenAncestor,
      `close button has aria-hidden=true ancestor: ${hiddenAncestor ? describeEl(hiddenAncestor) : ''}`,
    ).toBeNull();
  });

  it('marks the panel itself as aria-hidden when closed', async () => {
    await bootApp();
    expect(document.getElementById('plugin-panel')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('removes aria-hidden from the panel when opened', async () => {
    await bootApp();
    click(cardByName('plugins-grid', 'changelog'));
    expect(document.getElementById('plugin-panel')!.getAttribute('aria-hidden')).toBeNull();
  });

  it('restores #root interactivity after closing the panel', async () => {
    await bootApp();
    click(cardByName('plugins-grid', 'changelog'));
    click('#panel-close');

    const root = document.getElementById('root')!;
    expect(root.hasAttribute('inert')).toBe(false);
    expect(root.getAttribute('aria-hidden')).not.toBe('true');
  });
});

describe('entity panel interactivity', () => {
  it('does not put `inert` on any ancestor of the open entity panel', async () => {
    await bootApp();
    click('#view-skills');
    click(cardByName('skills-grid', 'find-dead-code'));

    const closeBtn = document.getElementById('entity-panel-close')!;
    const overlay  = document.getElementById('entity-panel-overlay')!;

    const closeInert   = ancestorWithAttr(closeBtn, 'inert');
    const overlayInert = ancestorWithAttr(overlay,  'inert');

    expect(
      closeInert,
      `entity close button has inert ancestor: ${closeInert ? describeEl(closeInert) : ''}`,
    ).toBeNull();
    expect(
      overlayInert,
      `entity overlay has inert ancestor: ${overlayInert ? describeEl(overlayInert) : ''}`,
    ).toBeNull();
  });

  it('does not put aria-hidden="true" on any ancestor of the open entity panel', async () => {
    await bootApp();
    click('#view-skills');
    click(cardByName('skills-grid', 'find-dead-code'));

    const closeBtn = document.getElementById('entity-panel-close')!;
    const hiddenAncestor = ancestorWithAttr(closeBtn, 'aria-hidden', 'true');

    expect(
      hiddenAncestor,
      `entity close button has aria-hidden=true ancestor: ${hiddenAncestor ? describeEl(hiddenAncestor) : ''}`,
    ).toBeNull();
  });

  it('marks the entity panel itself as aria-hidden when closed', async () => {
    await bootApp();
    expect(document.getElementById('entity-panel')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('removes aria-hidden from the entity panel when opened', async () => {
    await bootApp();
    click('#view-skills');
    click(cardByName('skills-grid', 'find-dead-code'));
    expect(document.getElementById('entity-panel')!.getAttribute('aria-hidden')).toBeNull();
  });
});

describe('panel interactivity — both panels at once', () => {
  it('neither panel leaves stale `inert` or aria-hidden on #root after both have been opened and closed', async () => {
    await bootApp();

    click(cardByName('plugins-grid', 'changelog'));
    click('#panel-close');

    click('#view-skills');
    click(cardByName('skills-grid', 'find-dead-code'));
    click('#entity-panel-close');

    const root = document.getElementById('root')!;
    expect(root.hasAttribute('inert')).toBe(false);
    expect(root.getAttribute('aria-hidden')).not.toBe('true');
  });
});
