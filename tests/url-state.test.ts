import { describe, it, expect } from 'vitest';
import { bootApp, cardNames, click, typeIntoSearch, visibleGridId } from './harness.ts';

describe('URL state', () => {
  it('sync: writes search query to the hash', async () => {
    await bootApp();
    typeIntoSearch('slack');
    expect(location.hash).toContain('q=slack');
  });

  it('sync: writes the sort direction when not the default', async () => {
    await bootApp();
    click('#sort-btn');
    expect(location.hash).toContain('sort=za');
  });

  it('sync: writes the active view when not plugins', async () => {
    await bootApp();
    click('#view-skills');
    expect(location.hash).toContain('view=skills');
  });

  it('sync: appends repo and cat params', async () => {
    await bootApp();
    const docBtn = Array.from(document.querySelectorAll<HTMLElement>('#filters .filter-btn'))
      .find(b => b.textContent === 'Documentation')!;
    docBtn.click();
    expect(location.hash).toContain('cat=documentation');
  });

  it('restore: boots into the view specified in the hash', async () => {
    await bootApp({ hash: '#view=skills' });
    expect(visibleGridId()).toBe('skills-grid');
  });

  it('restore: pre-populates the search input', async () => {
    await bootApp({ hash: '#q=changelog' });
    const search = document.getElementById('search') as HTMLInputElement;
    expect(search.value).toBe('changelog');
    expect(cardNames('plugins-grid')).toEqual(['changelog']);
  });

  it('restore: applies sort=za from the hash', async () => {
    await bootApp({ hash: '#sort=za' });
    expect(cardNames('plugins-grid')[0]).toBe('slack-tools');
    expect(document.querySelector('#sort-btn .sort-label')!.textContent).toBe('Sort: Z→A');
  });
});
