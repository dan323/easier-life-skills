import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { titleCase } from '../utils.ts';
import { BUILTIN_REPO } from '../constants.ts';
import { CopyButton } from './CopyButton.tsx';
import { SkillCard }   from './cards/SkillCard.tsx';
import { AgentCard }   from './cards/AgentCard.tsx';
import { McpCard }     from './cards/McpCard.tsx';
import { CommandCard } from './cards/CommandCard.tsx';
import { HookCard }    from './cards/HookCard.tsx';
import { refMatchesSkill } from '../bundle-resolve.ts';
import type { Plugin, Skill, Agent, McpServer, Command, Hook, Bundle } from '../types.ts';

interface Props {
  plugin:     Plugin | null;
  skills:     Skill[];
  agents:     Agent[];
  mcpServers: McpServer[];
  commands:   Command[];
  hooks:      Hook[];
  bundles:    Bundle[];
  onClose:    () => void;
  onOpenSkill:   (s: Skill) => void;
  onOpenAgent:   (a: Agent) => void;
  onOpenMcp:     (m: McpServer) => void;
  onOpenCommand: (c: Command) => void;
  onOpenHook:    (h: Hook) => void;
}

export function PluginPanel(props: Props) {
  const { plugin, onClose } = props;
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!plugin) return;
    lastFocusedRef.current = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';
    const rafId = requestAnimationFrame(() => closeBtnRef.current?.focus());
    return () => {
      cancelAnimationFrame(rafId);
      document.body.style.overflow = '';
      const prev = lastFocusedRef.current;
      if (prev && document.body.contains(prev)) prev.focus();
    };
  }, [plugin]);

  useLayoutEffect(() => {
    if (!plugin) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [plugin, onClose]);

  const open = plugin !== null;

  return (
    <div
      id="plugin-panel"
      class={open ? 'open' : ''}
      aria-hidden={open ? undefined : 'true'}
      aria-modal="true"
      role="dialog"
      aria-label="Plugin details"
    >
      <div id="panel-overlay" onClick={onClose} />
      <div class="panel-content">
        {plugin && <PluginPanelBody {...props} plugin={plugin} closeBtnRef={closeBtnRef} />}
      </div>
    </div>
  );
}

function PluginPanelBody({
  plugin, skills, agents, mcpServers, commands, hooks, bundles,
  onClose, onOpenSkill, onOpenAgent, onOpenMcp, onOpenCommand, onOpenHook,
  closeBtnRef,
}: Props & { plugin: Plugin; closeBtnRef: { current: HTMLButtonElement | null } }) {
  const catClass = plugin.category ? `badge-${plugin.category}` : 'badge-uncategorized';
  const catLabel = plugin.category ? titleCase(plugin.category) : 'Uncategorized';
  const hasDesc = (plugin.description ?? '').trim().length > 0;
  const pluginUrl = plugin.homepage ?? `https://github.com/${plugin.source.owner}/${plugin.source.repo}`;
  const promptText = `Explain to me what I would find in plugin ${pluginUrl} and what would it be used for`;

  // Match by (repo, pluginName, name) — two plugins in the same repo could ship
  // entities with the same name; scoping by `_repo` alone would mis-resolve them.
  const relatedSkills = plugin.skills
    .map(n => skills.find(s => s.name === n && s._repo === plugin._repo && s.pluginName === plugin.name))
    .filter((s): s is Skill => s !== undefined);
  const relatedAgents = plugin.agents
    .map(n => agents.find(a => a.name === n && a._repo === plugin._repo && a.pluginName === plugin.name))
    .filter((a): a is Agent => a !== undefined);
  const relatedMcp = plugin.mcpServers
    .map(n => mcpServers.find(m => m.name === n && m._repo === plugin._repo && m.pluginName === plugin.name))
    .filter((m): m is McpServer => m !== undefined);
  const relatedCmds = (plugin.commands ?? [])
    .map(n => commands.find(c => c.name === n && c._repo === plugin._repo && c.pluginName === plugin.name))
    .filter((c): c is Command => c !== undefined);
  const relatedHooks = (plugin.hooks ?? [])
    .map(n => hooks.find(h => h.name === n && h._repo === plugin._repo && h.pluginName === plugin.name))
    .filter((h): h is Hook => h !== undefined);

  // A plugin is part of a bundle only if one of the bundle's skill refs
  // actually resolves to a skill belonging to this plugin (same repo + pluginName).
  // Plain-string bundle refs are matched against the plugin's own skill names;
  // object refs additionally honour their source/pluginName narrowing.
  const memberBundles = bundles.filter(b =>
    (b.skills ?? []).some(ref =>
      relatedSkills.some(s => refMatchesSkill(ref, s))));
  const sourceKey = `${plugin.source.owner}/${plugin.source.repo}`;
  const isBuiltin = sourceKey === BUILTIN_REPO;
  const marketplaceCmd = `/plugin marketplace add ${sourceKey}`;

  return (
    <>
      <div class="panel-header">
        <div class="panel-title-row">
          <a
            id="panel-name"
            class="panel-name"
            href={plugin.homepage ?? '#'}
            target={plugin.homepage ? '_blank' : undefined}
            rel="noopener"
          >{plugin.name}</a>
          <span id="panel-category" class={`badge badge-cat ${catClass}`}>{catLabel}</span>
        </div>
        <button
          ref={closeBtnRef}
          id="panel-close"
          class="panel-close-btn"
          aria-label="Close"
          onClick={onClose}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <p id="panel-desc" class="panel-desc" style={{ display: hasDesc ? '' : 'none' }}>
        {plugin.description ?? ''}
      </p>

      <div id="panel-prompt" class="panel-prompt" style={{ display: hasDesc ? 'none' : '' }}>
        <span class="panel-prompt-label">Try asking:</span>
        <span id="panel-prompt-text" class="panel-prompt-text">{promptText}</span>
        <CopyButton id="panel-prompt-copy" text={promptText} className="panel-copy-btn" />
      </div>

      <CardSection
        id="panel-skills-section" listId="panel-skills-list" countId="panel-skills-count"
        title="Skills" items={relatedSkills}
        render={s => <SkillCard key={`${s._repo}/${s.pluginName}/${s.name}`} skill={s} showSource={false} showInstall={false} onOpen={onOpenSkill} />}
      />
      <CardSection
        id="panel-agents-section" listId="panel-agents-list" countId="panel-agents-count"
        title="Agents" items={relatedAgents}
        render={a => <AgentCard key={`${a._repo}/${a.pluginName}/${a.name}`} agent={a} showSource={false} showInstall={false} onOpen={onOpenAgent} />}
      />
      <CardSection
        id="panel-mcp-section" listId="panel-mcp-list" countId="panel-mcp-count"
        title="MCP Servers" items={relatedMcp}
        render={m => <McpCard key={`${m._repo}/${m.pluginName}/${m.name}`} mcp={m} showSource={false} showInstall={false} onOpen={onOpenMcp} />}
      />
      <CardSection
        id="panel-commands-section" listId="panel-commands-list" countId="panel-commands-count"
        title="Commands" items={relatedCmds}
        render={c => <CommandCard key={`${c._repo}/${c.pluginName}/${c.name}`} command={c} showSource={false} showInstall={false} onOpen={onOpenCommand} />}
      />
      <CardSection
        id="panel-hooks-section" listId="panel-hooks-list" countId="panel-hooks-count"
        title="Hooks" items={relatedHooks}
        render={h => <HookCard key={`${h._repo}/${h.pluginName}/${h.name}`} hook={h} showSource={false} showInstall={false} onOpen={onOpenHook} />}
      />

      <div
        id="panel-bundles-section"
        class="panel-section"
        style={{ display: memberBundles.length ? '' : 'none' }}
      >
        <h3 class="panel-section-title">Part of bundles</h3>
        <div id="panel-bundles-list" class="panel-items">
          {memberBundles.map(b => (
            <div key={b.name} class="panel-bundle-item">
              <span class="panel-bundle-name">{b.name}</span>
              <span class="panel-bundle-desc">{b.description}</span>
            </div>
          ))}
        </div>
      </div>

      <div id="panel-install-footer" class="panel-install-footer">
        <div id="panel-marketplace-row" class="panel-install-row" hidden={isBuiltin}>
          <code id="panel-marketplace-cmd">{marketplaceCmd}</code>
          <CopyButton
            id="panel-marketplace-copy"
            text={marketplaceCmd}
            label="Copy add"
            className="panel-copy-btn"
            ariaLabel={`Copy marketplace add command for ${sourceKey}`}
            analyticsEvent={{
              name:   'install_copy',
              params: { kind: 'plugin', name: plugin.name, source: sourceKey, command_type: 'marketplace_add' },
            }}
          />
        </div>
        <div class="panel-install-row">
          <code id="panel-install-cmd">{plugin.installCommand}</code>
          <CopyButton
            id="panel-install-copy"
            text={plugin.installCommand}
            label="Copy install"
            className="panel-copy-btn"
            ariaLabel={`Copy install command for ${plugin.name}`}
            analyticsEvent={{
              name:   'install_copy',
              params: { kind: 'plugin', name: plugin.name, source: sourceKey, command_type: 'install' },
            }}
          />
        </div>
      </div>
    </>
  );
}

interface CardSectionProps<T> {
  id:      string;
  listId:  string;
  countId: string;
  title:   string;
  items:   T[];
  render:  (item: T) => preact.JSX.Element;
}

function CardSection<T>({ id, listId, countId, title, items, render }: CardSectionProps<T>) {
  const has = items.length > 0;
  return (
    <div id={id} class="panel-section" style={{ display: has ? '' : 'none' }}>
      <h3 class="panel-section-title">
        {title} <span id={countId} class="panel-count">{has ? String(items.length) : ''}</span>
      </h3>
      <div id={listId} class="panel-items">
        {items.map(render)}
      </div>
    </div>
  );
}
