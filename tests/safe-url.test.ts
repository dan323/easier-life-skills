import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { safeHttpUrl } from '../shared/safe-url.ts';
import { bootApp, cardByName, click } from './harness.ts';

describe('safeHttpUrl', () => {
  it.each(['https://example.com/x', 'http://example.com', '  https://example.com/a  '])('accepts %s', u => {
    expect(safeHttpUrl(u)).toBe(u.trim());
  });
  it.each(['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>', 'vbscript:x', '//evil.com', 'not a url', '', null, undefined, 42])(
    'rejects %s', u => { expect(safeHttpUrl(u)).toBeNull(); });
});

describe('plugin panel homepage', () => {
  it('does not render a javascript: homepage as the title link', async () => {
    const base = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/skills_index.json'), 'utf8'));
    const fixture = { ...base, plugins: base.plugins.map((p: any, i: number) =>
      i === 0 ? { ...p, homepage: 'javascript:alert(1)' } : p) };
    await bootApp({ fixture });
    click(cardByName('plugins-grid', fixture.plugins[0].name));
    const link = document.getElementById('panel-name') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('#');
    expect(link.getAttribute('target')).toBeNull();
  });
});
