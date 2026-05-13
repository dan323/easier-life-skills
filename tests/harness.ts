import { vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { options as preactOptions } from 'preact';

preactOptions.debounceRendering = (cb: () => void) => cb();

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

const indexHtml = readFileSync(resolve(REPO_ROOT, 'index.html'), 'utf8');
const fixtureJson = readFileSync(resolve(HERE, 'fixtures/skills_index.json'), 'utf8');
const fixture = JSON.parse(fixtureJson);

function extractBody(html: string): string {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!match) throw new Error('No <body> found in index.html');
  return match[1]!;
}

const BODY_HTML = extractBody(indexHtml).replace(/<script[\s\S]*?<\/script>/g, '');

export interface BootOptions {
  hash?: string;
  fixture?: unknown;
}

export interface Booted {
  clipboardWrites: string[];
}

export async function bootApp(opts: BootOptions = {}): Promise<Booted> {
  vi.resetModules();

  document.documentElement.innerHTML = `<head></head><body></body>`;
  document.body.innerHTML = BODY_HTML;

  // happy-dom v20 ships a no-op localStorage when no --localstorage-file path
  // is configured (warning visible in the test logs), which silently drops
  // setItem calls. Replace it with a working in-memory Map-backed store so
  // tests that exercise localStorage (consent banner, …) behave like a real
  // browser. Fresh instance per bootApp call → isolation between tests.
  const storage = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem:    (key: string) => storage.get(key) ?? null,
      setItem:    (key: string, val: string) => { storage.set(key, String(val)); },
      removeItem: (key: string) => { storage.delete(key); },
      clear:      () => { storage.clear(); },
      key:        (i: number) => Array.from(storage.keys())[i] ?? null,
      get length() { return storage.size; },
    },
  });

  if (opts.hash) location.hash = opts.hash;
  else if (location.hash) history.replaceState(null, '', location.pathname);

  const clipboardWrites: string[] = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: (text: string) => {
        clipboardWrites.push(text);
        return Promise.resolve();
      },
    },
  });

  const body = opts.fixture ?? fixture;
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('skills_index.json')) {
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(new Response('not found', { status: 404 }));
  });

  await import('../assets/src/app.tsx');

  await flush();
  await flush();

  return { clipboardWrites };
}

export async function flush(): Promise<void> {
  await new Promise<void>(r => setTimeout(r, 0));
}

export function cardNames(gridId: string): string[] {
  const grid = document.getElementById(gridId);
  if (!grid) return [];
  return Array.from(grid.querySelectorAll<HTMLElement>('.card-name'))
    .map(el => cardLabel(el));
}

/** Return the visible card name (ignores decorative chevron span). */
export function cardLabel(btn: HTMLElement): string {
  return btn.querySelector('.card-name-text')?.textContent ?? btn.textContent ?? '';
}

/** Find a card title button by its visible name. */
export function cardByName(gridId: string, name: string): HTMLElement {
  const button = Array.from(document.querySelectorAll<HTMLElement>(`#${gridId} .skill-card .card-name`))
    .find(b => cardLabel(b) === name);
  if (!button) throw new Error(`Card not found: ${name}`);
  return button;
}

export function visibleGridId(): string | null {
  for (const id of [
    'plugins-grid',
    'skills-grid',
    'agents-grid',
    'mcp-grid',
    'commands-grid',
    'hooks-grid',
    'bundles-grid',
  ]) {
    const el = document.getElementById(id);
    if (el && el.style.display !== 'none') return id;
  }
  return null;
}

export function typeIntoSearch(value: string): void {
  const search = document.getElementById('search') as HTMLInputElement;
  search.value = value;
  search.dispatchEvent(new Event('input', { bubbles: true }));
}

export function click(selectorOrEl: string | Element | null): void {
  const el = typeof selectorOrEl === 'string' ? document.querySelector(selectorOrEl) : selectorOrEl;
  if (!el) throw new Error(`Element not found: ${selectorOrEl}`);
  (el as HTMLElement).click();
}

export function pressKey(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}
