import { describe, it, expect } from 'vitest';
import { bootApp } from './harness.ts';

describe('copy buttons', () => {
  it('quick-start step 1 copies the marketplace add command', async () => {
    const { clipboardWrites } = await bootApp();
    const btn = document.querySelector<HTMLButtonElement>('.copy-btn[data-copy*="marketplace add"]')!;
    btn.click();
    expect(clipboardWrites).toContain('/plugin marketplace add dan323/easier-life-skills');
  });

  it('quick-start step 2 copies the example install command', async () => {
    const { clipboardWrites } = await bootApp();
    const btn = document.querySelector<HTMLButtonElement>('.copy-btn[data-copy*="install changelog"]')!;
    btn.click();
    expect(clipboardWrites).toContain('/plugin install changelog@easier-life-skills');
  });

  it('plugin card copy button copies the install command without opening the panel', async () => {
    const { clipboardWrites } = await bootApp();
    const card = Array.from(document.querySelectorAll<HTMLElement>('#plugins-grid .skill-card'))
      .find(c => c.querySelector('.card-name')?.textContent === 'changelog')!;
    const btn = card.querySelector('.copy-btn') as HTMLButtonElement;
    btn.click();
    expect(clipboardWrites).toContain('/plugin install changelog@easier-life-skills');
    expect(document.getElementById('plugin-panel')!.classList.contains('open')).toBe(false);
  });
});
