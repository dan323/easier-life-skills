import { useEffect, useLayoutEffect, useMemo, useState } from 'preact/hooks';
import { Header }         from './Header.tsx';
import { QuickStart }     from './QuickStart.tsx';
import { Controls }       from './Controls.tsx';
import type { ViewKey }   from './Controls.tsx';
import { MarketplaceBar } from './MarketplaceBar.tsx';
import type { SourceItem } from './MarketplaceBar.tsx';
import { Footer }         from './Footer.tsx';
import { Grid }           from './Grid.tsx';
import { PluginPanel }    from './PluginPanel.tsx';
import { EntityPanel }    from './EntityPanel.tsx';
import type { EntityKind } from './EntityPanel.tsx';
import { loadMarketplace } from '../marketplace.ts';
import { readUrlState, writeUrlState } from '../url-state.ts';
import { BUILTIN_REPO } from '../constants.ts';
import type { Plugin, Skill, Agent, McpServer, Command, Hook, Bundle, SkillsIndexMeta } from '../types.ts';

const VALID_VIEWS: ViewKey[] = ['plugins', 'skills', 'agents', 'mcpServers', 'commands', 'hooks', 'bundles'];

interface OpenEntity {
  kind:   EntityKind;
  entity: Skill | Agent | McpServer | Command | Hook;
}

export function App() {
  const initial = readUrlState();

  const [query, setQuery] = useState(initial.query);
  const [sort,  setSort]  = useState<'az' | 'za'>(initial.sort);
  const [view,  setView]  = useState<ViewKey>(VALID_VIEWS.includes(initial.view as ViewKey) ? (initial.view as ViewKey) : 'plugins');
  const [activeRepos,      setActiveRepos]      = useState<Set<string>>(new Set(initial.repos));
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set(initial.cats));

  const [plugins,    setPlugins]    = useState<Plugin[]>([]);
  const [skills,     setSkills]     = useState<Skill[]>([]);
  const [agents,     setAgents]     = useState<Agent[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [commands,   setCommands]   = useState<Command[]>([]);
  const [hooks,      setHooks]      = useState<Hook[]>([]);
  const [bundles,    setBundles]    = useState<Bundle[]>([]);
  const [sources,    setSources]    = useState<SourceItem[]>([{ repo: BUILTIN_REPO, count: 0, builtin: true }]);
  const [meta,       setMeta]       = useState<SkillsIndexMeta | undefined>(undefined);

  const [openPlugin, setOpenPlugin] = useState<Plugin | null>(null);
  const [openEntity, setOpenEntity] = useState<OpenEntity | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadMarketplace(BUILTIN_REPO, true).then(result => {
      if (cancelled) return;
      if ('error' in result) {
        setSources(prev => prev.map(s => s.repo === result.repo ? { ...s, error: result.error } : s));
        return;
      }
      setPlugins(result.plugins);
      setSkills(result.skills);
      setAgents(result.agents);
      setMcpServers(result.mcpServers);
      setCommands(result.commands);
      setHooks(result.hooks);
      setBundles(result.bundles);
      setSources(result.sources);
      setMeta(result.meta);
    });
    return () => { cancelled = true; };
  }, []);

  useLayoutEffect(() => {
    writeUrlState({
      view, query: query.toLowerCase(), sort,
      repos: [...activeRepos],
      cats:  [...activeCategories],
    });
  }, [view, query, sort, activeRepos, activeCategories]);

  useLayoutEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as Element).tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        const search = document.getElementById('search') as HTMLInputElement | null;
        search?.focus();
        search?.select();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const categories = useMemo(() => {
    const src = view === 'skills' ? skills : plugins;
    const visible = activeRepos.size ? src.filter(s => activeRepos.has(s._repo ?? '')) : src;
    const cats = [...new Set(visible.map(s => s.category).filter((c): c is string => c !== null && c !== undefined))].sort();
    let updated = false;
    const next = new Set(activeCategories);
    for (const c of next) if (!cats.includes(c)) { next.delete(c); updated = true; }
    if (updated) setActiveCategories(next);
    return cats;
  }, [plugins, skills, view, activeRepos, activeCategories]);

  const toggleCategory = (cat: string) => {
    setActiveCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const toggleRepo = (repo: string) => {
    setActiveRepos(prev => {
      const next = new Set(prev);
      if (next.has(repo)) next.delete(repo); else next.add(repo);
      return next;
    });
  };

  const copyAdd = (repo: string) => {
    navigator.clipboard.writeText(`/plugin marketplace add ${repo}`);
  };

  const lowerQuery = query.toLowerCase();

  return (
    <>
      <a href="#main" class="skip-link">Skip to main content</a>

      <Header count={plugins.length} />
      <QuickStart />

      <Controls
        query={query}
        onSearch={setQuery}
        sort={sort}
        onToggleSort={() => setSort(s => s === 'az' ? 'za' : 'az')}
        view={view}
        onSwitchView={setView}
        categories={categories}
        activeCategories={activeCategories}
        onToggleCategory={toggleCategory}
      />

      <MarketplaceBar
        sources={sources}
        activeRepos={activeRepos}
        onToggle={toggleRepo}
        onCopyAdd={copyAdd}
      />

      <main id="main">
        <Grid
          view={view}
          query={lowerQuery}
          sort={sort}
          activeRepos={activeRepos}
          activeCategories={activeCategories}
          data={{ plugins, skills, agents, mcpServers, commands, hooks, bundles }}
          onOpenPlugin={setOpenPlugin}
          onOpenSkill={e => setOpenEntity({ kind: 'skill',     entity: e })}
          onOpenAgent={e => setOpenEntity({ kind: 'agent',     entity: e })}
          onOpenMcp={e   => setOpenEntity({ kind: 'mcpServer', entity: e })}
          onOpenCommand={e => setOpenEntity({ kind: 'command', entity: e })}
          onOpenHook={e  => setOpenEntity({ kind: 'hook',      entity: e })}
        />
      </main>

      <Footer generated={meta?.generated} />

      <PluginPanel
        plugin={openPlugin}
        skills={skills}
        agents={agents}
        mcpServers={mcpServers}
        commands={commands}
        hooks={hooks}
        bundles={bundles}
        onClose={() => setOpenPlugin(null)}
        onOpenSkill={s => setOpenEntity({ kind: 'skill',     entity: s })}
        onOpenAgent={a => setOpenEntity({ kind: 'agent',     entity: a })}
        onOpenMcp={m   => setOpenEntity({ kind: 'mcpServer', entity: m })}
        onOpenCommand={c => setOpenEntity({ kind: 'command', entity: c })}
        onOpenHook={h  => setOpenEntity({ kind: 'hook',      entity: h })}
      />

      <EntityPanel
        open={openEntity}
        bundles={bundles}
        onClose={() => setOpenEntity(null)}
      />

      <div id="sr-announce" aria-live="polite" aria-atomic="true" class="sr-only" />
    </>
  );
}
