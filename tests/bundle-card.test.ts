import { describe, it, expect } from 'vitest';
import { bootApp, click, flush } from './harness.ts';

/**
 * Regression coverage for the cross-marketplace bundle rendering logic.
 *  - manual install block must use each skill's `installCommand` (i.e. the
 *    pluginName, not the skillName) and de-dupe skills that share a plugin.
 *  - plugin-only sources (meta.sources[...].isMarketplace === false) must
 *    NOT emit a `/plugin install <plugin>@<marketplace>` line they have no
 *    marketplace for, and must instead point users at the npx command (which
 *    auto-creates a shim marketplace and installs through that).
 *  - top-of-card npx command must use the bundle id.
 */
const FIXTURE = {
  meta: {
    generated: '2026-05-13T00:00:00.000Z',
    marketplaces: ['anthropics/skills', 'mattpocock/skills'],
    sources: {
      'anthropics/skills':  { isMarketplace: true  },
      'mattpocock/skills':  { isMarketplace: false },
    },
    pluginCount: 0, skillCount: 3, agentCount: 0, mcpServerCount: 0, commandCount: 0, hookCount: 0,
  },
  plugins: [],
  skills: [
    {
      name: 'algorithmic-art',
      pluginName: 'example-skills',
      description: 'A',
      category: 'design',
      keywords: [],
      tools: [],
      readOnly: false,
      rawSkillUrl: 'https://raw.githubusercontent.com/anthropics/skills/main/example-skills/algorithmic-art/SKILL.md',
      installCommand: '/plugin install example-skills@skills',
      source: { owner: 'anthropics', repo: 'skills', repoUrl: 'https://github.com/anthropics/skills' },
    },
    {
      name: 'canvas-design',
      pluginName: 'example-skills',
      description: 'B',
      category: 'design',
      keywords: [],
      tools: [],
      readOnly: false,
      rawSkillUrl: 'https://raw.githubusercontent.com/anthropics/skills/main/example-skills/canvas-design/SKILL.md',
      installCommand: '/plugin install example-skills@skills',
      source: { owner: 'anthropics', repo: 'skills', repoUrl: 'https://github.com/anthropics/skills' },
    },
    {
      name: 'tdd',
      pluginName: 'mattpocock-skills',
      description: 'C',
      category: 'testing',
      keywords: [],
      tools: [],
      readOnly: false,
      rawSkillUrl: 'https://raw.githubusercontent.com/mattpocock/skills/main/skills/testing/tdd/SKILL.md',
      installCommand: '/plugin install mattpocock-skills@skills',
      source: { owner: 'mattpocock', repo: 'skills', repoUrl: 'https://github.com/mattpocock/skills' },
    },
  ],
  agents: [], mcpServers: [], commands: [], hooks: [],
  bundles: [
    {
      id: 'mixed-sources',
      name: 'Mixed Sources',
      description: 'Two anthropics skills + one plugin-only mattpocock skill',
      skills: ['algorithmic-art', 'canvas-design', 'tdd'],
    },
  ],
};

async function openBundlesView() {
  await bootApp({ fixture: FIXTURE });
  click('#view-bundles');
  await flush();
}

describe('BundleCard cross-marketplace rendering', () => {
  it('renders the npx command as the primary install action with the bundle id', async () => {
    await openBundlesView();
    const primary = document.querySelector<HTMLElement>('#bundles-grid .bundle-install-primary pre');
    expect(primary?.textContent).toBe('npx @dan323/easier-life-skills --bundle mixed-sources');
  });

  it('manual block uses pluginName and dedupes skills sharing a plugin', async () => {
    await openBundlesView();
    const manualPre = document.querySelector<HTMLElement>('#bundles-grid .bundle-install-manual-body pre');
    expect(manualPre).toBeTruthy();
    const text = manualPre!.textContent ?? '';
    // example-skills plugin install appears once (two skills from it deduped)
    const occurrences = text.match(/\/plugin install example-skills@skills/g) ?? [];
    expect(occurrences.length).toBe(1);
    // plugin-only mattpocock skill must NOT pretend to install via the upstream marketplace
    expect(text).not.toMatch(/\/plugin install mattpocock-skills@skills/);
    // Instead it points at the shim flow that the npx command (top of card) runs automatically
    expect(text).toMatch(/Plugin-only repo mattpocock\/skills/);
    expect(text).toMatch(/shim marketplace at ~\/\.config\/easier-life-skills\/shims\/mattpocock-skills\//);
    expect(text).toMatch(/claude plugin install mattpocock-skills@mattpocock-skills/);
  });

  it('primary copy button copies the npx command', async () => {
    const { clipboardWrites } = await bootApp({ fixture: FIXTURE });
    click('#view-bundles');
    await flush();
    const btn = document.querySelector<HTMLButtonElement>('#bundles-grid .bundle-install-primary .bundle-copy-btn')!;
    btn.click();
    expect(clipboardWrites).toContain('npx @dan323/easier-life-skills --bundle mixed-sources');
  });
});
