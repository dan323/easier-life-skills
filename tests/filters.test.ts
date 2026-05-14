import { describe, it, expect } from 'vitest';
import { bootApp, cardNames, click } from './harness.ts';

function findFilterBtn(label: string): HTMLElement {
  const btn = Array.from(document.querySelectorAll<HTMLElement>('#filters .filter-btn'))
    .find(b => b.textContent === label);
  if (!btn) throw new Error(`Filter button not found: ${label}`);
  return btn;
}

function findSourceTag(label: string): HTMLElement {
  const tag = Array.from(document.querySelectorAll<HTMLElement>('#marketplace-sources .source-tag'))
    .find(t => (t.querySelector('.label')?.textContent ?? '').startsWith(label));
  if (!tag) throw new Error(`Source tag not found: ${label}`);
  return tag;
}

function toggleFor(tag: HTMLElement): HTMLElement {
  const btn = tag.querySelector('.source-toggle') as HTMLElement | null;
  if (!btn) throw new Error('Source toggle button not found inside tag');
  return btn;
}

describe('category filter', () => {
  it('narrows plugins to the active category', async () => {
    await bootApp();
    click(findFilterBtn('Documentation'));
    expect(cardNames('plugins-grid')).toEqual(['docs']);
    expect(findFilterBtn('Documentation').getAttribute('aria-pressed')).toBe('true');
    expect(findFilterBtn('Documentation').classList.contains('active')).toBe(true);
  });

  it('clicking the active category again removes it', async () => {
    await bootApp();
    click(findFilterBtn('Code Quality'));
    expect(cardNames('plugins-grid')).toEqual(['code-audit']);
    click(findFilterBtn('Code Quality'));
    expect(cardNames('plugins-grid').length).toBe(4);
    expect(findFilterBtn('Code Quality').getAttribute('aria-pressed')).toBe('false');
  });

  it('combines with search', async () => {
    await bootApp();
    click(findFilterBtn('Documentation'));
    const search = document.getElementById('search') as HTMLInputElement;
    search.value = 'document';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(cardNames('plugins-grid')).toEqual(['docs']);
  });

  it('narrows agents to the active category', async () => {
    await bootApp();
    click('#view-agents');
    click(findFilterBtn('Automation'));
    expect(cardNames('agents-grid')).toEqual(['copilot-fixer']);
    expect(findFilterBtn('Automation').getAttribute('aria-pressed')).toBe('true');
  });

  it('narrows MCP servers, commands, and hooks by their category', async () => {
    await bootApp();
    click('#view-mcp');
    click(findFilterBtn('Automation'));
    expect(cardNames('mcp-grid')).toEqual(['slack']);

    click(findFilterBtn('Automation'));   // clear before switching view
    click('#view-commands');
    click(findFilterBtn('Automation'));
    expect(cardNames('commands-grid')).toEqual(['post-slack']);

    click(findFilterBtn('Automation'));
    click('#view-hooks');
    click(findFilterBtn('Automation'));
    expect(cardNames('hooks-grid')).toEqual(['pre-commit-format']);
  });
});

describe('source filter', () => {
  it('clicking a source tag narrows cards to that repo', async () => {
    await bootApp();
    click(toggleFor(findSourceTag('external/slack-tools')));
    expect(cardNames('plugins-grid')).toEqual(['slack-tools']);
    expect(toggleFor(findSourceTag('external/slack-tools')).getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking again clears the source filter', async () => {
    await bootApp();
    click(toggleFor(findSourceTag('external/slack-tools')));
    expect(cardNames('plugins-grid').length).toBe(1);
    click(toggleFor(findSourceTag('external/slack-tools')));
    expect(cardNames('plugins-grid').length).toBe(4);
  });

  it('clicking the source tag\'s copy button does not toggle the filter', async () => {
    const { clipboardWrites } = await bootApp();
    const tag = findSourceTag('external/slack-tools');
    const copyBtn = tag.querySelector('.source-add-copy') as HTMLButtonElement;
    copyBtn.click();
    expect(toggleFor(tag).getAttribute('aria-pressed')).toBe('false');
    expect(clipboardWrites).toContain('/plugin marketplace add external/slack-tools');
  });
});
