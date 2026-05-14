import { describe, it, expect } from 'vitest';
import { bootApp, cardNames, typeIntoSearch } from './harness.ts';

describe('search', () => {
  it('filters plugins by name substring', async () => {
    await bootApp();
    typeIntoSearch('slack');
    expect(cardNames('plugins-grid')).toEqual(['slack-tools']);
    expect(document.getElementById('count')!.textContent).toBe('1 of 4 plugins');
  });

  it('filters plugins by description substring', async () => {
    await bootApp();
    typeIntoSearch('unused');
    expect(cardNames('plugins-grid')).toEqual(['code-audit']);
  });

  it('shows an empty state when nothing matches', async () => {
    await bootApp();
    typeIntoSearch('zzzzznothing');
    const grid = document.getElementById('plugins-grid')!;
    expect(grid.querySelector('.empty')).not.toBeNull();
    expect(grid.querySelectorAll('.skill-card').length).toBe(0);
    expect(document.getElementById('count')!.textContent).toBe('0 of 4 plugins');
  });

  it('clearing the search restores the full list', async () => {
    await bootApp();
    typeIntoSearch('slack');
    expect(cardNames('plugins-grid').length).toBe(1);
    typeIntoSearch('');
    expect(cardNames('plugins-grid').length).toBe(4);
  });

  it('the slash key focuses the search field when not already typing', async () => {
    await bootApp();
    const search = document.getElementById('search') as HTMLInputElement;
    document.body.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(search);
  });
});
