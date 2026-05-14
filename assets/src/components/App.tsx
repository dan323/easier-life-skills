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
import { track, getStoredConsent, setStoredConsent } from '../analytics.ts';
import type { ConsentState } from '../analytics.ts';
import { ConsentBanner } from './ConsentBanner.tsx';
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
  const [loaded,     setLoaded]     = useState(false);

  const [openPlugin, setOpenPlugin] = useState<Plugin | null>(null);
  const [openEntity, setOpenEntity] = useState<OpenEntity | null>(null);
  const [consent,    setConsent]    = useState<ConsentState>(getStoredConsent());

  useEffect(() => {
    let cancelled = false;
    void loadMarketplace(BUILTIN_REPO, true).then(result => {
      if (cancelled) return;
      if ('error' in result) {
        setSources(prev => prev.map(s => s.repo === result.repo ? { ...s, error: result.error } : s));
        setLoaded(true);
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
      setLoaded(true);
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
    const srcByView: Record<ViewKey, Array<{ category?: string | null; _repo?: string }>> = {
      plugins,
      skills,
      agents,
      mcpServers,
      commands,
      hooks,
      bundles: [],
    };
    const src = srcByView[view] ?? [];
    const visible = activeRepos.size ? src.filter(s => activeRepos.has(s._repo ?? '')) : src;
    const cats = [...new Set(visible.map(s => s.category).filter((c): c is string => c !== null && c !== undefined))].sort();
    let updated = false;
    const next = new Set(activeCategories);
    for (const c of next) if (!cats.includes(c)) { next.delete(c); updated = true; }
    if (updated) setActiveCategories(next);
    return cats;
  }, [plugins, skills, agents, mcpServers, commands, hooks, view, activeRepos, activeCategories]);

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
    track('install_copy', { kind: 'marketplace', name: repo, source: repo, command_type: 'marketplace_add' });
  };

  const handleOpenPlugin = (p: Plugin) => {
    track('entity_open', { kind: 'plugin', name: p.name, source: p._repo ?? '' });
    setOpenPlugin(p);
  };

  type AnyEntity = Skill | Agent | McpServer | Command | Hook;
  const handleOpenEntity = (kind: EntityKind, entity: AnyEntity) => {
    track('entity_open', { kind, name: entity.name, source: entity._repo ?? '' });
    setOpenEntity({ kind, entity });
  };

  const handleConsentChoice = (choice: 'granted' | 'denied') => {
    setConsent(choice);
    setStoredConsent(choice);
  };

  const handleManageConsent = () => {
    setConsent(null);
    setStoredConsent(null);
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
          loaded={loaded}
          query={lowerQuery}
          sort={sort}
          activeRepos={activeRepos}
          activeCategories={activeCategories}
          data={{ plugins, skills, agents, mcpServers, commands, hooks, bundles }}
          sources={meta?.sources}
          onOpenPlugin={handleOpenPlugin}
          onOpenSkill={e => handleOpenEntity('skill',     e)}
          onOpenAgent={e => handleOpenEntity('agent',     e)}
          onOpenMcp={e   => handleOpenEntity('mcpServer', e)}
          onOpenCommand={e => handleOpenEntity('command', e)}
          onOpenHook={e  => handleOpenEntity('hook',      e)}
        />
      </main>

      <Footer generated={meta?.generated} onManageConsent={handleManageConsent} />

      <PluginPanel
        plugin={openPlugin}
        skills={skills}
        agents={agents}
        mcpServers={mcpServers}
        commands={commands}
        hooks={hooks}
        bundles={bundles}
        onClose={() => setOpenPlugin(null)}
        onOpenSkill={s => handleOpenEntity('skill',     s)}
        onOpenAgent={a => handleOpenEntity('agent',     a)}
        onOpenMcp={m   => handleOpenEntity('mcpServer', m)}
        onOpenCommand={c => handleOpenEntity('command', c)}
        onOpenHook={h  => handleOpenEntity('hook',      h)}
      />

      <EntityPanel
        open={openEntity}
        bundles={bundles}
        onClose={() => setOpenEntity(null)}
      />

      <ConsentBanner consent={consent} onChoice={handleConsentChoice} />

      <div id="sr-announce" aria-live="polite" aria-atomic="true" class="sr-only" />
    </>
  );
}
