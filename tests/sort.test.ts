import { describe, it, expect } from 'vitest';
import { bootApp, cardNames, click, cardByName } from './harness.ts';

function sortLabel(): string {
  return document.querySelector('#sort-btn .sort-label')!.textContent ?? '';
}

function sortAriaLabel(): string {
  return document.getElementById('sort-btn')!.getAttribute('aria-label') ?? '';
}

describe('sort', () => {
  it('defaults to A→Z', async () => {
    await bootApp();
    expect(sortLabel()).toBe('Sort: A→Z');
    const names = cardNames('plugins-grid');
    expect([...names].sort()).toEqual(names);
  });

  it('aria-label starts with the visible label (WCAG 2.5.3 label-content-name-mismatch)', async () => {
    await bootApp();
    // A→Z state
    expect(sortAriaLabel().startsWith(sortLabel())).toBe(true);
    // Toggle to Z→A
    click('#sort-btn');
    expect(sortAriaLabel().startsWith(sortLabel())).toBe(true);
    // Toggle to Rating
    click('#sort-btn');
    expect(sortAriaLabel().startsWith(sortLabel())).toBe(true);
  });

  it('toggles to Z→A and reorders the cards', async () => {
    await bootApp();
    click('#sort-btn');
    expect(sortLabel()).toBe('Sort: Z→A');
    const names = cardNames('plugins-grid');
    expect(names).toEqual(['slack-tools', 'hooks-pack', 'docs', 'code-audit']);
  });

  it('cycles through A→Z → Z→A → Rating → A→Z', async () => {
    await bootApp();
    expect(sortLabel()).toBe('Sort: A→Z');
    click('#sort-btn');
    expect(sortLabel()).toBe('Sort: Z→A');
    click('#sort-btn');
    expect(sortLabel()).toBe('Sort: Rating');
    click('#sort-btn');
    expect(sortLabel()).toBe('Sort: A→Z');
    const names = cardNames('plugins-grid');
    expect(names[0]).toBe('code-audit');
  });
});

describe('rating badge', () => {
  it('shows star badge on skill card with a rating', async () => {
    await bootApp();
    click('#view-skills');
    const card = cardByName('skills-grid', 'changelog').closest('.skill-card')!;
    const badge = card.querySelector('.badge-rating');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toContain('4.5');
    expect(badge!.textContent).toContain('2');
  });

  it('does not show star badge on unrated skill card', async () => {
    await bootApp();
    click('#view-skills');
    const card = cardByName('skills-grid', 'find-dead-code').closest('.skill-card')!;
    expect(card.querySelector('.badge-rating')).toBeNull();
  });
});

describe('rating sort', () => {
  it('sorts skills by rating descending with unrated last', async () => {
    await bootApp();
    click('#view-skills');
    click('#sort-btn'); // az → za
    click('#sort-btn'); // za → rating
    expect(sortLabel()).toBe('Sort: Rating');
    const names = cardNames('skills-grid');
    // changelog (avg 4.5) should come first; unrated skills after
    expect(names[0]).toBe('changelog');
  });
});
