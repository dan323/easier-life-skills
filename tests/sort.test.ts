import { describe, it, expect } from 'vitest';
import { bootApp, cardNames, click } from './harness.ts';

describe('sort', () => {
  it('defaults to A→Z', async () => {
    await bootApp();
    const btn = document.getElementById('sort-btn')!;
    expect(btn.textContent).toBe('Sort: A→Z');
    const names = cardNames('plugins-grid');
    expect([...names].sort()).toEqual(names);
  });

  it('toggles to Z→A and reorders the cards', async () => {
    await bootApp();
    click('#sort-btn');
    const btn = document.getElementById('sort-btn')!;
    expect(btn.textContent).toBe('Sort: Z→A');
    const names = cardNames('plugins-grid');
    expect(names).toEqual(['slack-tools', 'hooks-pack', 'find-dead-code', 'document-project', 'changelog']);
  });

  it('toggles back to A→Z on a second click', async () => {
    await bootApp();
    click('#sort-btn');
    click('#sort-btn');
    expect(document.getElementById('sort-btn')!.textContent).toBe('Sort: A→Z');
    const names = cardNames('plugins-grid');
    expect(names[0]).toBe('changelog');
  });
});
