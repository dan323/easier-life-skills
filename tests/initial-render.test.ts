import { describe, it, expect } from 'vitest';
import { bootApp, visibleGridId, cardNames } from './harness.ts';

describe('initial render', () => {
  it('defaults to the plugins view', async () => {
    await bootApp();
    expect(visibleGridId()).toBe('plugins-grid');
    const pluginsBtn = document.getElementById('view-plugins')!;
    expect(pluginsBtn.classList.contains('active')).toBe(true);
    expect(pluginsBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('renders all four plugins from the fixture, sorted A→Z', async () => {
    await bootApp();
    const names = cardNames('plugins-grid');
    expect(names).toEqual(['code-audit', 'docs', 'hooks-pack', 'slack-tools']);
  });

  it('renders the plugin count', async () => {
    await bootApp();
    expect(document.getElementById('count')!.textContent).toBe('4 of 4 plugins');
    expect(document.getElementById('skill-count')!.textContent).toBe('4');
  });

  it('renders source tags for every distinct plugin source', async () => {
    await bootApp();
    const tags = Array.from(document.querySelectorAll<HTMLElement>('#marketplace-sources .source-tag'));
    const labels = tags.map(t => t.querySelector('.label')?.textContent ?? '');
    expect(labels).toContain('dan323/easier-life-skills (2)');
    expect(labels).toContain('external/slack-tools (1)');
    expect(labels).toContain('external/hooks-pack (1)');
  });

  it('appends star count to source tag label when GitHub API returns a count', async () => {
    await bootApp({
      stars: {
        'dan323/easier-life-skills': 42,
        'external/slack-tools': 7,
      },
    });
    const tags = Array.from(document.querySelectorAll<HTMLElement>('#marketplace-sources .source-tag'));
    const labels = tags.map(t => t.querySelector('.label')?.textContent ?? '');
    expect(labels).toContain('dan323/easier-life-skills (2) ★ 42');
    expect(labels).toContain('external/slack-tools (1) ★ 7');
    // Repos not in the stars map keep the plain label
    expect(labels).toContain('external/hooks-pack (1)');
  });

  it('shows category filter buttons drawn from plugin categories', async () => {
    await bootApp();
    const cats = Array.from(document.querySelectorAll<HTMLElement>('#filters .filter-btn'))
      .map(b => b.textContent ?? '');
    expect(cats).toEqual(expect.arrayContaining(['Automation', 'Code Quality', 'Documentation']));
  });

  it('renders the formatted generated date', async () => {
    await bootApp();
    const gen = document.getElementById('generated')!.textContent ?? '';
    expect(gen).not.toBe('…');
    expect(gen.length).toBeGreaterThan(0);
  });
});
