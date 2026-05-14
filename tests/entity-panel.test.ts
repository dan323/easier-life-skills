import { describe, it, expect } from 'vitest';
import { bootApp, cardByName, click } from './harness.ts';

describe('entity panel — skill', () => {
  it('opens with skill metadata', async () => {
    await bootApp();
    click('#view-skills');
    click(cardByName('skills-grid', 'find-dead-code'));
    const panel = document.getElementById('entity-panel')!;
    expect(panel.classList.contains('open')).toBe(true);
    expect(document.getElementById('entity-panel-name')!.textContent).toBe('find-dead-code');
    expect(document.getElementById('entity-panel-kind')!.textContent).toBe('Skill');
    expect(document.getElementById('entity-panel-category')!.textContent).toBe('Code Quality');
  });

  it('shows tools and keywords for skills', async () => {
    await bootApp();
    click('#view-skills');
    click(cardByName('skills-grid', 'find-dead-code'));
    const tools = Array.from(document.querySelectorAll<HTMLElement>('#entity-panel-tools-list .chip')).map(c => c.textContent);
    expect(tools).toEqual(['Read', 'Grep']);
    const keywords = Array.from(document.querySelectorAll<HTMLElement>('#entity-panel-keywords-list .chip')).map(c => c.textContent);
    expect(keywords).toEqual(['vulture', 'dead', 'unused']);
  });
});

describe('entity panel — agent', () => {
  it('opens with agent metadata and shows tools', async () => {
    await bootApp();
    click('#view-agents');
    click(cardByName('agents-grid', 'copilot-fixer'));
    expect(document.getElementById('entity-panel-kind')!.textContent).toBe('Agent');
    const tools = Array.from(document.querySelectorAll<HTMLElement>('#entity-panel-tools-list .chip')).map(c => c.textContent);
    expect(tools).toEqual(['Bash', 'Read', 'Edit']);
  });
});

describe('entity panel — MCP server', () => {
  it('opens with command shown', async () => {
    await bootApp();
    click('#view-mcp');
    click(cardByName('mcp-grid', 'slack'));
    expect(document.getElementById('entity-panel-kind')!.textContent).toBe('MCP Server');
    const section = document.getElementById('entity-panel-command-section') as HTMLElement;
    expect(section.hidden).toBe(false);
    expect(document.getElementById('entity-panel-command')!.textContent).toBe('npx -y @slack/mcp');
  });
});

describe('entity panel — hook', () => {
  it('opens with event chips', async () => {
    await bootApp();
    click('#view-hooks');
    click(cardByName('hooks-grid', 'pre-commit-format'));
    expect(document.getElementById('entity-panel-kind')!.textContent).toBe('Hook');
    const events = Array.from(document.querySelectorAll<HTMLElement>('#entity-panel-events-list .chip')).map(c => c.textContent);
    expect(events).toEqual(['PreCommit']);
  });
});

describe('entity panel — command', () => {
  it('opens with the command source link', async () => {
    await bootApp();
    click('#view-commands');
    click(cardByName('commands-grid', 'post-slack'));
    expect(document.getElementById('entity-panel-kind')!.textContent).toBe('Command');
    const link = document.getElementById('entity-panel-source-link') as HTMLAnchorElement;
    expect(link.href).toContain('commands/post-slack.md');
  });
});

describe('entity panel — common', () => {
  it('closes when the close button is clicked', async () => {
    await bootApp();
    click('#view-skills');
    click(cardByName('skills-grid', 'changelog'));
    click('#entity-panel-close');
    expect(document.getElementById('entity-panel')!.classList.contains('open')).toBe(false);
  });

  it('install copy puts the install command on the clipboard', async () => {
    const { clipboardWrites } = await bootApp();
    click('#view-skills');
    click(cardByName('skills-grid', 'changelog'));
    (document.getElementById('entity-panel-install-copy') as HTMLButtonElement).click();
    expect(clipboardWrites).toContain('/plugin install docs@easier-life-skills');
  });
});
