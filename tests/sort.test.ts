import { describe, it, expect } from 'vitest';
import { bootApp, cardNames, click } from './harness.ts';

function sortLabel(): string {
  return document.querySelector('#sort-btn .sort-label')!.textContent ?? '';
}

function sortAriaLabel(): string {
  return document.getElementById('sort-btn')!.getAttribute('aria-label') ?? '';
}

describe('sort', () => {
  it('defaults to A→Z', async () => {
    await bootApp();
    expect(sortLabel()).toBe('Sort: A→Z');
    const names = cardNames('plugins-grid');
    expect([...names].sort()).toEqual(names);
  });

  it('aria-label starts with the visible label (WCAG 2.5.3 label-content-name-mismatch)', async () => {
    await bootApp();
    // A→Z state
    expect(sortAriaLabel().startsWith(sortLabel())).toBe(true);
    // Toggle to Z→A
    click('#sort-btn');
    expect(sortAriaLabel().startsWith(sortLabel())).toBe(true);
  });

  it('toggles to Z→A and reorders the cards', async () => {
    await bootApp();
    click('#sort-btn');
    expect(sortLabel()).toBe('Sort: Z→A');
    const names = cardNames('plugins-grid');
    expect(names).toEqual(['slack-tools', 'hooks-pack', 'find-dead-code', 'document-project', 'changelog']);
  });

  it('toggles back to A→Z on a second click', async () => {
    await bootApp();
    click('#sort-btn');
    click('#sort-btn');
    expect(sortLabel()).toBe('Sort: A→Z');
    const names = cardNames('plugins-grid');
    expect(names[0]).toBe('changelog');
  });
});
