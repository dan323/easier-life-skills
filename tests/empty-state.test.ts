import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { bootApp, click } from './harness.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const baseFixture = JSON.parse(
  readFileSync(resolve(HERE, 'fixtures/skills_index.json'), 'utf8'),
);

describe('empty-state hint', () => {
  it('suggests other populated views when the active view has zero items in the dataset', async () => {
    // Strip every command/hook from the fixture so Commands and Hooks views are dataset-empty.
    const fixture = { ...baseFixture, commands: [], hooks: [] };
    await bootApp({ fixture });

    click('#view-commands');
    const commandsEmpty = document.querySelector('#commands-grid .empty');
    expect(commandsEmpty).not.toBeNull();
    expect(commandsEmpty!.textContent).toContain('No commands in this marketplace yet');

    const hint = document.querySelector('#commands-grid .empty-hint');
    expect(hint).not.toBeNull();
    // The hint should mention at least one populated view name.
    expect(hint!.textContent).toMatch(/(Plugins|Skills|Agents|MCP Servers|Bundles)/);
    expect(hint!.textContent).not.toContain('Commands'); // not the current view
    expect(hint!.textContent).not.toContain('Hooks');    // also dataset-empty
  });

  it('uses the search-mismatch wording when the dataset has items but filters drop them all', async () => {
    await bootApp();
    const search = document.getElementById('search') as HTMLInputElement;
    search.value = 'zzzzznothing';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    const empty = document.querySelector('#plugins-grid .empty');
    expect(empty!.textContent).toContain('match your search');
    // No suggestion hint when items exist globally — the user can clear the search.
    expect(document.querySelector('#plugins-grid .empty-hint')).toBeNull();
  });
});
