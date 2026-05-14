import { describe, it, expect } from 'vitest';
import { bootApp, cardByName, click, pressKey } from './harness.ts';

describe('plugin panel', () => {
  it('opens when a plugin card is clicked', async () => {
    await bootApp();
    click(cardByName('plugins-grid', 'docs'));
    const panel = document.getElementById('plugin-panel')!;
    expect(panel.classList.contains('open')).toBe(true);
    expect(document.getElementById('panel-name')!.textContent).toBe('docs');
    expect(document.getElementById('panel-desc')!.textContent).toBe('Documentation bundle — changelog and document-project skills.');
  });

  it('shows install command and copies it', async () => {
    const { clipboardWrites } = await bootApp();
    click(cardByName('plugins-grid', 'docs'));
    expect(document.getElementById('panel-install-cmd')!.textContent).toBe('/plugin install docs@easier-life-skills');
    (document.getElementById('panel-install-copy') as HTMLButtonElement).click();
    expect(clipboardWrites).toContain('/plugin install docs@easier-life-skills');
  });

  it('hides the marketplace add row for builtin plugins', async () => {
    await bootApp();
    click(cardByName('plugins-grid', 'docs'));
    expect((document.getElementById('panel-marketplace-row') as HTMLElement).hidden).toBe(true);
  });

  it('shows the marketplace add row for external plugins', async () => {
    await bootApp();
    click(cardByName('plugins-grid', 'slack-tools'));
    expect((document.getElementById('panel-marketplace-row') as HTMLElement).hidden).toBe(false);
    expect(document.getElementById('panel-marketplace-cmd')!.textContent).toBe('/plugin marketplace add external/slack-tools');
  });

  it('lists referenced skills, mcp servers, commands, hooks and agents', async () => {
    await bootApp();
    click(cardByName('plugins-grid', 'slack-tools'));
    expect((document.getElementById('panel-mcp-section') as HTMLElement).style.display).not.toBe('none');
    expect(document.getElementById('panel-mcp-count')!.textContent).toBe('1');
    expect((document.getElementById('panel-commands-section') as HTMLElement).style.display).not.toBe('none');
    expect(document.getElementById('panel-commands-count')!.textContent).toBe('1');
    expect((document.getElementById('panel-skills-section') as HTMLElement).style.display).toBe('none');
    expect((document.getElementById('panel-hooks-section') as HTMLElement).style.display).toBe('none');
  });

  it('shows the "Try asking" prompt when the plugin has no description', async () => {
    await bootApp();
    click(cardByName('plugins-grid', 'hooks-pack'));
    const prompt = document.getElementById('panel-prompt') as HTMLElement;
    const desc = document.getElementById('panel-desc') as HTMLElement;
    expect(prompt.style.display).not.toBe('none');
    expect(desc.style.display).toBe('none');
  });

  it('shows bundle membership for plugins whose skills appear in a bundle', async () => {
    await bootApp();
    click(cardByName('plugins-grid', 'docs'));
    const bundlesSection = document.getElementById('panel-bundles-section') as HTMLElement;
    expect(bundlesSection.style.display).not.toBe('none');
    expect(document.getElementById('panel-bundles-list')!.textContent).toContain('docs-bundle');
  });

  it('closes when the close button is clicked', async () => {
    await bootApp();
    click(cardByName('plugins-grid', 'docs'));
    click('#panel-close');
    expect(document.getElementById('plugin-panel')!.classList.contains('open')).toBe(false);
  });

  it('closes when the overlay is clicked', async () => {
    await bootApp();
    click(cardByName('plugins-grid', 'docs'));
    click('#panel-overlay');
    expect(document.getElementById('plugin-panel')!.classList.contains('open')).toBe(false);
  });

  it('closes when Escape is pressed', async () => {
    await bootApp();
    click(cardByName('plugins-grid', 'docs'));
    pressKey(document.body, 'Escape');
    expect(document.getElementById('plugin-panel')!.classList.contains('open')).toBe(false);
  });
});
