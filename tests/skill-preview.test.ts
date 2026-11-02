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

  it('labels a partial preview as partial', async () => {
    await bootApp();
    click('#view-skills');
    click(cardByName('skills-grid', 'changelog'));
    expect(document.getElementById('entity-panel-preview-badge')!.textContent).toBe('Partial');
    expect(document.getElementById('entity-panel-preview')!.classList.contains('truncated')).toBe(true);
    expect(document.getElementById('entity-panel-preview-note')!.textContent).toContain('Only the beginning');
    expect(document.getElementById('entity-panel-preview-link')!.textContent).toContain('View full SKILL.md');
  });

  it('labels a complete excerpt as the full body, without a truncation note', async () => {
    await bootApp();
    click('#view-skills');
    click(cardByName('skills-grid', 'document-project'));
    expect(document.getElementById('entity-panel-preview-badge')!.textContent).toBe('Full body');
    expect(document.getElementById('entity-panel-preview')!.classList.contains('truncated')).toBe(false);
    expect(document.getElementById('entity-panel-preview-note')).toBeNull();
  });
});

describe('file preview — agents and commands', () => {
  it('shows a partial preview for an agent', async () => {
    await bootApp();
    click('#view-agents');
    click(cardByName('agents-grid', 'copilot-fixer'));
    expect(document.getElementById('entity-panel-preview')!.textContent).toContain('You fix Copilot review comments.');
    expect(document.querySelector('#entity-panel-preview-section h3')!.textContent).toContain('agent file');
    expect(document.getElementById('entity-panel-preview-badge')!.textContent).toBe('Partial');
    expect(document.getElementById('entity-panel-preview-note')).not.toBeNull();
  });

  it('shows a full preview for a command as plain text', async () => {
    await bootApp();
    click('#view-commands');
    click(cardByName('commands-grid', 'post-slack'));
    const pre = document.getElementById('entity-panel-preview')!;
    expect(pre.textContent).toBe('Post $ARGUMENTS to Slack. <b>not bold</b>');
    expect(pre.querySelector('b')).toBeNull();
    expect(document.querySelector('#entity-panel-preview-section h3')!.textContent).toContain('command file');
    expect(document.getElementById('entity-panel-preview-badge')!.textContent).toBe('Full body');
  });

  it('shows no preview for MCP servers (no Markdown file)', async () => {
    await bootApp();
    click('#view-mcp');
    click(cardByName('mcp-grid', 'slack'));
    expect(document.getElementById('entity-panel-kind')!.textContent).toBe('MCP Server');
    expect(document.getElementById('entity-panel-preview-section')).toBeNull();
  });
});

describe('SKILL.md preview — plugin panel', () => {
  it('does not preview any skill (only the skill panel does)', async () => {
    await bootApp();
    click(cardByName('plugins-grid', 'docs'));
    expect(document.getElementById('panel-preview-section')).toBeNull();
  });
});
