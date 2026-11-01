import { describe, it, expect } from 'vitest';
import { bootApp, cardByName, click } from './harness.ts';

const CHANGELOG_EXCERPT =
  '# Changelog\n\nGenerate release notes. <script>window.__xss = 1</script> <b>not bold</b>';

describe('SKILL.md preview — entity panel', () => {
  it('shows the excerpt for a skill as plain text', async () => {
    await bootApp();
    click('#view-skills');
    click(cardByName('skills-grid', 'changelog'));
    const pre = document.getElementById('entity-panel-preview')!;
    expect(pre).not.toBeNull();
    expect(pre.tagName).toBe('PRE');
    expect(pre.textContent).toBe(CHANGELOG_EXCERPT);
    // Untrusted text must never become markup.
    expect(pre.querySelector('script, b')).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
    const link = document.getElementById('entity-panel-preview-link') as HTMLAnchorElement;
    expect(link.href).toContain('plugins/docs/skills/changelog/SKILL.md');
  });

  it('omits the preview when the skill has no excerpt', async () => {
    await bootApp();
    click('#view-skills');
    click(cardByName('skills-grid', 'find-dead-code'));
    expect(document.getElementById('entity-panel-preview-section')).toBeNull();
  });

  it('does not show a preview for non-skill entities', async () => {
    await bootApp();
    click('#view-agents');
    click(cardByName('agents-grid', 'copilot-fixer'));
    expect(document.getElementById('entity-panel-preview-section')).toBeNull();
  });
});

describe('SKILL.md preview — plugin panel', () => {
  it('previews the first bundled skill that has an excerpt', async () => {
    await bootApp();
    click(cardByName('plugins-grid', 'docs'));
    const pre = document.getElementById('panel-preview')!;
    expect(pre).not.toBeNull();
    expect(pre.textContent).toBe(CHANGELOG_EXCERPT);
    expect(pre.querySelector('script, b')).toBeNull();
    expect(document.getElementById('panel-preview-skill')!.textContent).toBe('changelog');
  });

  it('omits the preview when no bundled skill has an excerpt', async () => {
    await bootApp();
    click(cardByName('plugins-grid', 'code-audit'));
    expect(document.getElementById('panel-preview-section')).toBeNull();
  });
});
