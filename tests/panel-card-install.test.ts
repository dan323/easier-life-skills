/**
 * The plugin panel embeds entity cards (skills, agents, MCP servers,
 * commands, hooks). Each card normally renders a `.card-install` row with a
 * Copy button — but inside the plugin panel that's redundant: the single
 * "Copy install" row at the bottom of the panel covers the *plugin* install,
 * and the bottom row is the affordance users are expected to act on.
 *
 * Embedded cards therefore receive `showInstall={false}` and must NOT render
 * `.card-install`. The bottom rows live inside `#panel-install-footer`, which
 * stays visible while the panel content scrolls.
 */

import { describe, it, expect } from 'vitest';
import { bootApp, cardByName, click } from './harness.ts';

describe('plugin panel — embedded entity cards omit copy buttons', () => {
  it('renders no `.card-install` elements anywhere inside the plugin panel', async () => {
    await bootApp();
    click(cardByName('plugins-grid', 'slack-tools'));
    const panel = document.getElementById('plugin-panel')!;
    const installs = panel.querySelectorAll('.card-install');
    expect(installs.length).toBe(0);
  });

  it('renders no per-card copy buttons inside the plugin panel', async () => {
    await bootApp();
    click(cardByName('plugins-grid', 'slack-tools'));
    const panel = document.getElementById('plugin-panel')!;
    const cardCopies = panel.querySelectorAll('#panel-skills-list .copy-btn, #panel-agents-list .copy-btn, #panel-mcp-list .copy-btn, #panel-commands-list .copy-btn, #panel-hooks-list .copy-btn');
    expect(cardCopies.length).toBe(0);
  });

  it('still keeps the plugin install + marketplace copy buttons at the bottom', async () => {
    await bootApp();
    click(cardByName('plugins-grid', 'slack-tools'));
    expect(document.getElementById('panel-install-copy')).not.toBeNull();
    expect(document.getElementById('panel-marketplace-copy')).not.toBeNull();
  });

  it('keeps `.card-install` in the grid view (so showInstall regression only hits the panel)', async () => {
    await bootApp();
    click('#view-skills');
    const grid = document.getElementById('skills-grid')!;
    const installs = grid.querySelectorAll('.card-install');
    expect(installs.length).toBeGreaterThan(0);
  });
});

describe('plugin panel — install footer is positioned to stay visible', () => {
  it('groups the install rows inside #panel-install-footer', async () => {
    await bootApp();
    click(cardByName('plugins-grid', 'slack-tools'));
    const footer = document.getElementById('panel-install-footer')!;
    expect(footer).not.toBeNull();
    expect(footer.querySelector('#panel-install-cmd')).not.toBeNull();
    expect(footer.querySelector('#panel-marketplace-cmd')).not.toBeNull();
  });

  it('keeps the install footer as the last child of the scrollable panel content', async () => {
    await bootApp();
    click(cardByName('plugins-grid', 'slack-tools'));
    const content = document.querySelector('#plugin-panel .panel-content') as HTMLElement;
    const last = content.lastElementChild as HTMLElement;
    expect(last.id).toBe('panel-install-footer');
  });
});
