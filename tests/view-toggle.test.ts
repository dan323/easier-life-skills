import { describe, it, expect } from 'vitest';
import { bootApp, visibleGridId, cardNames, click } from './harness.ts';

describe('view toggle', () => {
  it('switches to the skills view', async () => {
    await bootApp();
    click('#view-skills');
    expect(visibleGridId()).toBe('skills-grid');
    expect(cardNames('skills-grid')).toEqual(['changelog', 'document-project', 'find-dead-code']);
    expect(document.getElementById('count')!.textContent).toBe('3 of 3 skills');
  });

  it('switches to the agents view', async () => {
    await bootApp();
    click('#view-agents');
    expect(visibleGridId()).toBe('agents-grid');
    expect(cardNames('agents-grid')).toEqual(['copilot-fixer']);
  });

  it('switches to the MCP servers view', async () => {
    await bootApp();
    click('#view-mcp');
    expect(visibleGridId()).toBe('mcp-grid');
    expect(cardNames('mcp-grid')).toEqual(['slack']);
  });

  it('switches to the commands view', async () => {
    await bootApp();
    click('#view-commands');
    expect(visibleGridId()).toBe('commands-grid');
    expect(cardNames('commands-grid')).toEqual(['post-slack']);
  });

  it('switches to the hooks view', async () => {
    await bootApp();
    click('#view-hooks');
    expect(visibleGridId()).toBe('hooks-grid');
    expect(cardNames('hooks-grid')).toEqual(['pre-commit-format']);
  });

  it('switches to the bundles view', async () => {
    await bootApp();
    click('#view-bundles');
    expect(visibleGridId()).toBe('bundles-grid');
    expect(document.getElementById('count')!.textContent).toBe('1 bundles');
    const bundleNames = Array.from(document.querySelectorAll<HTMLElement>('#bundles-grid .bundle-name')).map(b => b.textContent);
    expect(bundleNames).toEqual(['docs-bundle']);
  });

  it('only marks the active view as aria-pressed', async () => {
    await bootApp();
    click('#view-skills');
    const buttons = [
      'view-plugins', 'view-skills', 'view-agents',
      'view-mcp', 'view-commands', 'view-hooks', 'view-bundles',
    ];
    for (const id of buttons) {
      const btn = document.getElementById(id)!;
      const expectedActive = id === 'view-skills';
      expect(btn.getAttribute('aria-pressed')).toBe(String(expectedActive));
      expect(btn.classList.contains('active')).toBe(expectedActive);
    }
  });

  it('hides the category filter bar outside plugins/skills views', async () => {
    await bootApp();
    const filters = document.getElementById('filters')!;
    click('#view-skills');
    expect(filters.style.display).not.toBe('none');
    click('#view-agents');
    expect(filters.style.display).toBe('none');
    click('#view-plugins');
    expect(filters.style.display).not.toBe('none');
  });
});
