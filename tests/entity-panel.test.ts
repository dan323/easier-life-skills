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

  it('shows reviews section with rating summary for rated skill', async () => {
    await bootApp();
    click('#view-skills');
    click(cardByName('skills-grid', 'changelog'));
    const summary = document.getElementById('entity-panel-rating-summary');
    expect(summary).not.toBeNull();
    expect(summary!.textContent).toContain('4.5');
    expect(summary!.textContent).toContain('2');
    const reviews = document.querySelectorAll('#entity-panel-reviews-list .panel-review');
    expect(reviews.length).toBe(2);
  });

  it('shows no-reviews message for unrated skill', async () => {
    await bootApp();
    click('#view-skills');
    click(cardByName('skills-grid', 'find-dead-code'));
    const noReviews = document.getElementById('entity-panel-no-reviews');
    expect(noReviews).not.toBeNull();
    expect(noReviews!.textContent).toBe('No reviews yet.');
  });

  it('shows five star rating buttons in reviews section', async () => {
    await bootApp();
    click('#view-skills');
    click(cardByName('skills-grid', 'changelog'));
    const buttons = document.querySelectorAll<HTMLAnchorElement>('#entity-panel-rate-buttons .panel-rate-star');
    expect(buttons.length).toBe(5);
    // Each button links to the Discussion form with a different stars value
    const hrefs = Array.from(buttons).map(b => b.href);
    expect(hrefs[0]).toContain('stars=1');
    expect(hrefs[4]).toContain('stars=5');
    // All buttons carry the entity context
    for (const href of hrefs) {
      expect(href).toContain('category=ratings');
      expect(href).toContain('entity_type=skill');
      expect(href).toContain('changelog');
    }
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
