import { describe, it, expect } from 'vitest';
import { bootApp, visibleGridId, cardNames } from './harness.ts';

describe('boot smoke', () => {
  it('boots the app and renders plugins by default', async () => {
    await bootApp();
    expect(visibleGridId()).toBe('plugins-grid');
    const names = cardNames('plugins-grid');
    expect(names.length).toBe(5);
    expect(names).toContain('changelog');
    expect(names).toContain('slack-tools');
  });

  it('shows the loaded plugin count in the header', async () => {
    await bootApp();
    const count = document.getElementById('skill-count')!.textContent;
    expect(count).toBe('5');
  });
});
