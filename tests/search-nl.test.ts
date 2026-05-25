import { describe, it, expect } from 'vitest';
import { bootApp, cardNames, typeIntoSearch, flush, click } from './harness.ts';
import { tokenize } from '../shared/search-tokenize.ts';
import fixtureRaw from './fixtures/skills_index.json';

// Cast to typed shape needed for index building
type Source = { owner: string; repo: string };
type SkillEntry   = { name: string; description: string; keywords?: string[]; pluginName: string; source: Source };
type AgentEntry   = { name: string; description: string; pluginName: string; source: Source };
type PluginEntry  = { name: string; description: string; source: Source };
type McpEntry     = { name: string; description: string; pluginName: string; source: Source };
type CommandEntry = { name: string; description: string; pluginName: string; source: Source };
type HookEntry    = { name: string; description: string; events: string[]; pluginName: string; source: Source };

interface FixtureShape {
  skills:     SkillEntry[];
  agents:     AgentEntry[];
  plugins:    PluginEntry[];
  mcpServers: McpEntry[];
  commands:   CommandEntry[];
  hooks:      HookEntry[];
}

const fixture = fixtureRaw as FixtureShape;

// ---------------------------------------------------------------------------
// Mirror of scripts/build-index.ts scoring logic.
// KEEP IN SYNC with the production build when scoring changes.
// ---------------------------------------------------------------------------

const BM25_K1 = 1.2;

function buildSearchIndex(f: FixtureShape): Record<string, [string, number][]> {
  const docs: Array<{ id: string; text: string }> = [
    ...f.skills.map(s => ({
      id:   `s:${s.source.owner}/${s.source.repo}/${s.pluginName}/${s.name}`,
      text: [s.name, s.description, ...(s.keywords ?? [])].join(' '),
    })),
    ...f.agents.map(a => ({
      id:   `a:${a.source.owner}/${a.source.repo}/${a.pluginName}/${a.name}`,
      text: [a.name, a.description].join(' '),
    })),
    ...f.plugins.map(p => ({
      id:   `p:${p.source.owner}/${p.source.repo}/${p.name}`,
      text: [p.name, p.description].join(' '),
    })),
    ...f.mcpServers.map(m => ({
      id:   `m:${m.source.owner}/${m.source.repo}/${m.pluginName}/${m.name}`,
      text: [m.name, m.description].join(' '),
    })),
    ...f.commands.map(c => ({
      id:   `c:${c.source.owner}/${c.source.repo}/${c.pluginName}/${c.name}`,
      text: [c.name, c.description].join(' '),
    })),
    ...f.hooks.map(h => ({
      id:   `h:${h.source.owner}/${h.source.repo}/${h.pluginName}/${h.name}`,
      text: [h.name, h.description, ...h.events].join(' '),
    })),
  ];

  const docCount = docs.length;
  const dfMap    = new Map<string, number>();
  const docTfMap = new Map<string, Map<string, number>>();

  for (const doc of docs) {
    const tokens = tokenize(doc.text);
    if (tokens.length === 0) continue;
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const [term, n] of tf) tf.set(term, n / tokens.length);
    docTfMap.set(doc.id, tf);
    for (const term of tf.keys()) dfMap.set(term, (dfMap.get(term) ?? 0) + 1);
  }

  const idx: Record<string, [string, number][]> = {};
  for (const [docId, tf] of docTfMap) {
    for (const [term, tfScore] of tf) {
      const df     = dfMap.get(term) ?? 1;
      const idf    = Math.log(1 + (docCount - df + 0.5) / (df + 0.5)); // Robertson IDF
      const bm25TF = tfScore * (BM25_K1 + 1) / (tfScore + BM25_K1);   // BM25 saturation
      const score  = Math.round(bm25TF * idf * idf * 10000) / 10000;
      if (!idx[term]) idx[term] = [];
      idx[term].push([docId, score]);
    }
  }
  return idx;
}

const searchIndex = buildSearchIndex(fixture);

async function nlSearch(query: string): Promise<void> {
  typeIntoSearch(query);
  await flush();
  await flush();
  await flush();
}

describe('NL search (multi-word queries)', () => {
  it('single-word query does not trigger NL — uses substring match', async () => {
    await bootApp({ searchIndex });
    click('#view-skills');
    typeIntoSearch('changelog');
    const names = cardNames('skills-grid');
    expect(names).toContain('changelog');
    expect(names).not.toContain('find-dead-code');
  });

  it('multi-word query triggers NL search and filters by score on skills view', async () => {
    await bootApp({ searchIndex });
    click('#view-skills');
    await nlSearch('unused code');
    const names = cardNames('skills-grid');
    expect(names).toContain('find-dead-code');
    expect(names).not.toContain('changelog');
    expect(names).not.toContain('document-project');
  });

  it('NL search on plugins view: code quality matches code-audit', async () => {
    await bootApp({ searchIndex });
    await nlSearch('code quality');
    const names = cardNames('plugins-grid');
    expect(names).toContain('code-audit');
    expect(names).not.toContain('docs');
    expect(names).not.toContain('slack-tools');
  });

  it('NL query with no matching tokens shows empty state', async () => {
    await bootApp({ searchIndex });
    await nlSearch('xyzzy quux blorfl');
    const grid = document.getElementById('plugins-grid')!;
    expect(grid.querySelector('.empty')).not.toBeNull();
    expect(cardNames('plugins-grid')).toHaveLength(0);
  });

  it('clearing a multi-word query restores the full list', async () => {
    await bootApp({ searchIndex });
    click('#view-skills');
    await nlSearch('unused code');
    expect(cardNames('skills-grid').length).toBeLessThan(3);
    await nlSearch('');
    expect(cardNames('skills-grid')).toHaveLength(3);
  });

  it('NL search results are ordered by relevance score, not alphabetically', async () => {
    await bootApp({ searchIndex });
    click('#view-skills');
    await nlSearch('documentation changelog');
    const names = cardNames('skills-grid');
    const idxChangelog       = names.indexOf('changelog');
    const idxDocumentProject = names.indexOf('document-project');
    expect(idxChangelog).toBeGreaterThanOrEqual(0);
    expect(idxDocumentProject).toBeGreaterThanOrEqual(0);
    expect(idxChangelog).toBeLessThan(idxDocumentProject);
  });

  it('"creating tests" ranks the testing skill above skill-creator via Robertson IDF + BM25', async () => {
    // Regression for: "I want a skill for creating tests" returning skill-creator skills at the top.
    //
    // Root cause: raw TF-IDF let skill-creator's dense "creat" tokens dominate because:
    //   - "creat" had high TF in a short description (few non-stopword tokens left)
    //   - The coverage multiplier (hitCount/tokens.length) gave skill-creator a 2×
    //     advantage because it matched both "creat" and "test" tokens.
    //
    // Fix applied:
    //   1. Robertson IDF — log(1+(N-df+0.5)/(df+0.5)) — strong discrimination.
    //   2. IDF² — squaring IDF exponentially amplifies rare terms ("test" df=1)
    //      over common ones ("creat" df=3), so webapp-testing dominates even if
    //      skill-creator also contains "test" tokens at low TF.
    //   3. BM25 TF saturation — caps the gain from repeating "create" many times.
    //   4. No coverage multiplier — raw score sum, not penalised by partial match.
    //
    // The fixture supplies enough "creat"-bearing skills to give "creat" high df
    // (→ low Robertson IDF²), while "test" appears only in webapp-testing (→ high IDF²).

    const regressionFixture: FixtureShape = {
      // Minimal plugin to satisfy the loader (PluginCard requires skills/agents arrays).
      plugins:    [{
        name: 'test-market', description: 'Test marketplace',
        source: { owner: 'x', repo: 'y' },
        skills: [], agents: [], hooks: [], commands: [], mcpServers: [],
        installCommand: '/plugin install test-market@test-market',
      } as unknown as PluginEntry],
      agents:     [],
      mcpServers: [],
      commands:   [],
      hooks:      [],
      skills: [
        // Three skills with prominent "create" usage → df_creat = 3 → low Robertson IDF.
        {
          name: 'skill-creator',
          description: 'Create a new Claude Code skill from a template.',
          keywords: ['create', 'scaffold'],
          pluginName: 'skill-creator',
          source: { owner: 'x', repo: 'y' },
        },
        {
          name: 'changelog',
          description: 'Creates a CHANGELOG.md tracking your project changes.',
          keywords: ['changelog'],
          pluginName: 'docs',
          source: { owner: 'x', repo: 'y' },
        },
        {
          name: 'document-project',
          description: 'Creates comprehensive README and documentation files.',
          keywords: ['docs', 'readme'],
          pluginName: 'docs',
          source: { owner: 'x', repo: 'y' },
        },
        // One testing skill → df_test = 1 → high Robertson IDF for "test".
        {
          name: 'webapp-testing',
          description: 'Write and run automated test suites for web apps.',
          keywords: ['tests', 'testing', 'vitest'],
          pluginName: 'webapp-testing',
          source: { owner: 'x', repo: 'y' },
        },
      ],
    };

    const idx = buildSearchIndex(regressionFixture);
    await bootApp({ fixture: regressionFixture, searchIndex: idx });
    click('#view-skills');
    await nlSearch('creating tests');

    const names = cardNames('skills-grid');
    const idxWebapp      = names.indexOf('webapp-testing');
    const idxSkillCreator = names.indexOf('skill-creator');

    // webapp-testing must appear (it's the only skill with "test" tokens).
    expect(idxWebapp).toBeGreaterThanOrEqual(0);
    // skill-creator should either not appear (no "test" match) or rank below webapp-testing.
    if (idxSkillCreator !== -1) {
      expect(idxWebapp).toBeLessThan(idxSkillCreator);
    }
  });

  it('NL search on default view shows plugins matching the query', async () => {
    await bootApp({ searchIndex });
    await nlSearch('documentation readme');
    const names = cardNames('plugins-grid');
    expect(names).toContain('docs');
    expect(names).not.toContain('slack-tools');
  });
});
