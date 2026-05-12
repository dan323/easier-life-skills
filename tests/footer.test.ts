import { describe, it, expect } from 'vitest';
import { bootApp } from './harness.ts';

describe('footer', () => {
  it('links Full catalog to the in-site catalog.html', async () => {
    await bootApp();
    const link = Array.from(document.querySelectorAll<HTMLAnchorElement>('footer a'))
      .find(a => (a.textContent ?? '').trim() === 'Full catalog');
    expect(link).toBeDefined();
    expect(link!.getAttribute('href')).toBe('./catalog.html');
    expect(link!.getAttribute('target')).toBeNull();
  });
});
