import { useEffect, useLayoutEffect, useMemo, useState } from 'preact/hooks';
import { Header }         from './Header.tsx';
import { QuickStart }     from './QuickStart.tsx';
import { Controls }       from './Controls.tsx';
import { MarketplaceBar } from './MarketplaceBar.tsx';
import { Footer }         from './Footer.tsx';
import { Grid }           from './Grid.tsx';
import { PluginPanel }    from './PluginPanel.tsx';
import { EntityPanel }    from './EntityPanel.tsx';
import type { EntityKind } from './EntityPanel.tsx';
import { BundleDrawer }   from './BundleDrawer.tsx';
import { loadMarketplace, enrichSourcesWithStars } from '../marketplace.ts';
import { readUrlState, writeUrlState } from '../url-state.ts';
import type { SortKey } from '../url-state.ts';
import { track, getStoredConsent, setStoredConsent } from '../analytics.ts';
import type { ConsentState } from '../analytics.ts';
import { ConsentBanner } from './ConsentBanner.tsx';
import { BUILTIN_REPO } from '../constants.ts';
import { nlSearch, isNLQuery } from '../search.ts';
import { encodeItem, decodeItem, buildBundleItemId } from '../bundle-state.ts';
import type { BundleItem, BundleItemKind } from '../bundle-state.ts';
import type { Plugin, Skill, Agent, McpServer, Command, Hook, Bundle, SkillsIndexMeta, ViewKey, SourceItem } from '../types.ts';

const VALID_VIEWS: ViewKey[] = ['plugins', 'skills', 'agents', 'mcpServers', 'commands', 'hooks', 'bundles'];

interface OpenEntity {
  kind:   EntityKind;
  entity: Skill | Agent | McpServer | Command | Hook;
}

/** Build a BundleItem from a card entity. */
function makeItem(
  name: string,
  kind: BundleItemKind,
  installCommand: string,
  repo: string,
  pluginName = '',
): BundleItem {
  return {
    id:             buildBundleItemId(kind, name, repo, pluginName),
    name,
    kind,
    installCommand,
    repo,
    pluginName:     pluginName || undefined,
    isMarketplace:  true,   // refined later by buildInstallScript against live sources
  };
}

export function App() {
  const initial = readUrlState();

  const [query, setQuery] = useState(initial.query);
  const [sort,  setSort]  = useState<SortKey>(initial.sort);
  const [view,  setView]  = useState<ViewKey>(VALID_VIEWS.includes(initial.view as ViewKey) ? (initial.view as ViewKey) : 'plugins');
  const [activeRepos,      setActiveRepos]      = useState<Set<string>>(new Set(initial.repos));
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set(initial.cats));

  // Bundle state: ordered array of selected items, keyed by installCommand
  const [bundleItems, setBundleItems] = useState<BundleItem[]>(() =>
    initial.bundle.map(decodeItem).filter((x): x is BundleItem => x !== null)
  );

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
  const [nlScores,   setNlScores]   = useState<Map<string, number>>(new Map());

  // Map from "owner/repo" → { isMarketplace } for BundleDrawer.
  // meta.sources is the authoritative source — it records isMarketplace per repo
  // as determined at build time. Fall back to treating everything as a marketplace
  // when meta hasn't loaded yet.
  const sourcesMap = useMemo<Record<string, { isMarketplace: boolean }>>(() => {
    if (meta?.sources) return meta.sources;
    const map: Record<string, { isMarketplace: boolean }> = {};
    for (const s of sources) map[s.repo] = { isMarketplace: true };
    return map;
  }, [sources, meta]);

  const [openPlugin, setOpenPlugin] = useState<Plugin | null>(null);
  const [openEntity, setOpenEntity] = useState<OpenEntity | null>(null);
  const [consent,    setConsent]    = useState<ConsentState>(getStoredConsent());

  useEffect(() => {
    let cancelled = false;
    void loadMarketplace(BUILTIN_REPO, true).then(async result => {
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
      // Fetch GitHub star counts asynchronously — does not block initial render.
      const enriched = await enrichSourcesWithStars(result.sources);
      if (!cancelled) setSources(enriched);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const lq = query.toLowerCase();
    if (!isNLQuery(lq)) {
      setNlScores(new Map());
      return;
    }
    let cancelled = false;
    void nlSearch(lq)
      .then(scores => { if (!cancelled) setNlScores(scores); })
      .catch(() => { if (!cancelled) setNlScores(new Map()); });
    return () => { cancelled = true; };
  }, [query]);

  // Sync all app state → URL hash
  useLayoutEffect(() => {
    writeUrlState({
      view, query: query.toLowerCase(), sort,
      repos:  [...activeRepos],
      cats:   [...activeCategories],
      bundle: bundleItems.map(encodeItem),
    });
  }, [view, query, sort, activeRepos, activeCategories, bundleItems]);

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

  // --- Bundle toggle helpers ---
  const toggleBundle = (item: BundleItem) => {
    setBundleItems(prev => {
      if (prev.some(i => i.id === item.id)) {
        return prev.filter(i => i.id !== item.id);
      }
      return [...prev, item];
    });
  };

  // bundledIds maps entity id ("kind/repo/plugin?/name") → true for O(1) card lookups
  const bundledIds = useMemo(() => new Set(bundleItems.map(i => i.id)), [bundleItems]);

  const handleRemoveFromBundle = (id: string) => {
    setBundleItems(prev => prev.filter(i => i.id !== id));
  };

  const handleClearBundle = () => setBundleItems([]);

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
        onToggleSort={() => setSort(s => s === 'az' ? 'za' : s === 'za' ? 'rating' : 'az')}
        isNLSearch={nlScores.size > 0}
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
          nlScores={nlScores}
          sort={sort}
          activeRepos={activeRepos}
          activeCategories={activeCategories}
          data={{ plugins, skills, agents, mcpServers, commands, hooks, bundles }}
          sources={meta?.sources}
          bundledIds={bundledIds}
          onOpenPlugin={handleOpenPlugin}
          onOpenSkill={e => handleOpenEntity('skill',     e)}
          onOpenAgent={e => handleOpenEntity('agent',     e)}
          onOpenMcp={e   => handleOpenEntity('mcpServer', e)}
          onOpenCommand={e => handleOpenEntity('command', e)}
          onOpenHook={e  => handleOpenEntity('hook',      e)}
          onToggleBundlePlugin={p  => toggleBundle(makeItem(p.name,  'plugin',    p.installCommand, p._repo ?? ''))}
          onToggleBundleSkill={s   => toggleBundle(makeItem(s.name,  'skill',     s.installCommand, s._repo ?? '', s.pluginName))}
          onToggleBundleAgent={a   => toggleBundle(makeItem(a.name,  'agent',     a.installCommand, a._repo ?? '', a.pluginName))}
          onToggleBundleMcp={m     => toggleBundle(makeItem(m.name,  'mcpServer', m.installCommand, m._repo ?? '', m.pluginName))}
          onToggleBundleCommand={c => toggleBundle(makeItem(c.name,  'command',   c.installCommand, c._repo ?? '', c.pluginName))}
          onToggleBundleHook={h    => toggleBundle(makeItem(h.name,  'hook',      h.installCommand, h._repo ?? '', h.pluginName))}
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

      <BundleDrawer
        items={bundleItems}
        sources={sourcesMap}
        bundles={bundles}
        onRemove={handleRemoveFromBundle}
        onClear={handleClearBundle}
        onGotoBundle={() => setView('bundles')}
      />

      <ConsentBanner consent={consent} onChoice={handleConsentChoice} />

      <div id="sr-announce" aria-live="polite" aria-atomic="true" class="sr-only" />
    </>
  );
}
