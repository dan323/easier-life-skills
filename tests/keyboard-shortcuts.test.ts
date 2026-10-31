import { describe, it, expect } from 'vitest';
import { bootApp, cardLabel, cardNames, click, typeIntoSearch } from './harness.ts';

function press(target: Element | Document, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
}

function focusedCardName(): string | null {
  const el = document.activeElement as HTMLElement | null;
  if (!el || !el.classList.contains('card-name')) return null;
  return cardLabel(el);
}

function cardButtons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('#main .skill-card .card-name'));
}

describe('keyboard shortcuts: j / k / Enter', () => {
  it('j focuses the first card when no card is focused, then moves forward', async () => {
    await bootApp();
    const names = cardNames('plugins-grid');
    expect(names.length).toBeGreaterThan(2);
    document.body.focus();

    const ev = press(document.body, 'j');
    expect(ev.defaultPrevented).toBe(true);
    expect(focusedCardName()).toBe(names[0]);

    press(document.activeElement!, 'j');
    expect(focusedCardName()).toBe(names[1]);
  });

  it('k moves backward and both keys clamp at the ends', async () => {
    await bootApp();
    const names = cardNames('plugins-grid');
    document.body.focus();

    press(document.body, 'k');
    expect(focusedCardName()).toBe(names[0]);
    press(document.activeElement!, 'k');
    expect(focusedCardName()).toBe(names[0]);

    for (let i = 0; i < names.length + 2; i++) press(document.activeElement!, 'j');
    expect(focusedCardName()).toBe(names[names.length - 1]);

    press(document.activeElement!, 'k');
    expect(focusedCardName()).toBe(names[names.length - 2]);
  });

  it('only moves between visible (filtered) cards', async () => {
    await bootApp();
    typeIntoSearch('docs');
    const names = cardNames('plugins-grid');
    expect(names).toEqual(['docs']);
    document.body.focus();

    press(document.body, 'j');
    expect(focusedCardName()).toBe('docs');
    press(document.activeElement!, 'j');
    expect(focusedCardName()).toBe('docs');
  });

  it('works in non-plugin views', async () => {
    await bootApp({ hash: '#view=skills' });
    const names = cardNames('skills-grid');
    expect(names.length).toBeGreaterThan(1);
    document.body.focus();

    press(document.body, 'j');
    press(document.activeElement!, 'j');
    expect(focusedCardName()).toBe(names[1]);
  });

  it('Enter opens the detail panel for the focused card', async () => {
    await bootApp();
    const names = cardNames('plugins-grid');
    document.body.focus();
    press(document.body, 'j');
    press(document.activeElement!, 'j');

    const ev = press(document.activeElement!, 'Enter');
    expect(ev.defaultPrevented).toBe(true);
    expect(document.getElementById('plugin-panel')!.classList.contains('open')).toBe(true);
    expect(document.getElementById('panel-name')!.textContent).toBe(names[1]);
  });

  it('Enter opens the entity panel for a focused skill card', async () => {
    await bootApp({ hash: '#view=skills' });
    const names = cardNames('skills-grid');
    document.body.focus();
    press(document.body, 'j');
    press(document.activeElement!, 'Enter');
    expect(document.getElementById('entity-panel')!.classList.contains('open')).toBe(true);
    expect(document.getElementById('entity-panel-name')!.textContent).toContain(names[0]!);
  });

  it('Enter does nothing when no card is focused', async () => {
    await bootApp();
    document.body.focus();
    const ev = press(document.body, 'Enter');
    expect(ev.defaultPrevented).toBe(false);
    expect(document.getElementById('plugin-panel')!.classList.contains('open')).toBe(false);
  });

  it('is ignored while typing in the search box', async () => {
    await bootApp();
    const search = document.getElementById('search') as HTMLInputElement;
    search.focus();
    const ev = press(search, 'j');
    expect(ev.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(search);
  });

  it('is ignored when a modifier key is held', async () => {
    await bootApp();
    document.body.focus();
    for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey'] as const) {
      const ev = press(document.body, 'j', { [mod]: true });
      expect(ev.defaultPrevented).toBe(false);
      expect(focusedCardName()).toBeNull();
    }
  });

  it('is ignored while a detail panel is open', async () => {
    await bootApp();
    const first = cardButtons()[0]!;
    click(first);
    expect(document.getElementById('plugin-panel')!.classList.contains('open')).toBe(true);

    first.focus();
    const ev = press(first, 'j');
    expect(ev.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(first);
  });
});
