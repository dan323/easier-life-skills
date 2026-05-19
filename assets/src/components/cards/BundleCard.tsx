import { CopyButton } from '../CopyButton.tsx';
import { Expandable } from '../Expandable.tsx';
import { resolveBundleEntityArray, resolveBundlePlugins } from '../../bundle-resolve.ts';
import type { Bundle, Skill, Agent, Hook, Command, McpServer, Plugin } from '../../types.ts';

const ITEM_LIMIT = 4;

interface Props {
  bundle:     Bundle;
  skills:     Skill[];
  agents:     Agent[];
  hooks:      Hook[];
  commands:   Command[];
  mcpServers: McpServer[];
  plugins:    Plugin[];
  sources?:   Record<string, { isMarketplace: boolean }>;
}

type BundleEntry = { name: string; kind: string; installCommand: string; source: { owner: string; repo: string }; pluginName?: string };

const KIND_LABEL: Record<string, string> = {
  skill:     'skill',
  agent:     'agent',
  hook:      'hook',
  command:   'cmd',
  mcpServer: 'mcp',
  plugin:    'plugin',
};

function isMarketplaceSource(item: { source: { owner: string; repo: string } }, sources?: Record<string, { isMarketplace: boolean }>): boolean {
  if (!sources) return true;
  const key = `${item.source.owner}/${item.source.repo}`;
  return sources[key]?.isMarketplace !== false;
}

export function BundleCard({ bundle, skills, agents, hooks, commands, mcpServers, plugins, sources }: Props) {
  const allItems: BundleEntry[] = [
    ...resolveBundleEntityArray(bundle.skills,     skills).map(e => ({ name: e.name, kind: 'skill',     installCommand: e.installCommand, source: e.source, pluginName: e.pluginName })),
    ...resolveBundleEntityArray(bundle.agents,     agents).map(e => ({ name: e.name, kind: 'agent',     installCommand: e.installCommand, source: e.source, pluginName: e.pluginName })),
    ...resolveBundleEntityArray(bundle.hooks,      hooks).map(e  => ({ name: e.name, kind: 'hook',      installCommand: e.installCommand, source: e.source, pluginName: e.pluginName })),
    ...resolveBundleEntityArray(bundle.commands,   commands).map(e => ({ name: e.name, kind: 'command',  installCommand: e.installCommand, source: e.source, pluginName: e.pluginName })),
    ...resolveBundleEntityArray(bundle.mcpServers, mcpServers).map(e => ({ name: e.name, kind: 'mcpServer', installCommand: e.installCommand, source: e.source, pluginName: e.pluginName })),
    ...resolveBundlePlugins(    bundle.plugins,    plugins).map(e => ({ name: e.name, kind: 'plugin',   installCommand: e.installCommand, source: e.source, pluginName: e.name })),
  ];

  const marketplaceCommands = [...new Set(
    allItems
      .filter(e => isMarketplaceSource(e, sources))
      .map(e => e.installCommand)
  )];
  const pluginOnlyItems = allItems.filter(e => !isMarketplaceSource(e, sources));
  const hasPluginOnly = pluginOnlyItems.length > 0;

  const npxCommand = `npx @dan323/easier-life-skills --bundle ${bundle.id ?? bundle.name}`;

  const shimHints = hasPluginOnly
    ? Array.from(
        pluginOnlyItems.reduce((acc, e) => {
          const pluginName = e.kind === 'plugin' ? e.name : (e.pluginName ?? e.name);
          if (!acc.has(pluginName)) acc.set(pluginName, e);
          return acc;
        }, new Map<string, BundleEntry>())
      ).map(([pluginName, e]) =>
        `# Plugin-only repo ${e.source.owner}/${e.source.repo} — use the npx command above.\n` +
        `# (auto-creates a shim marketplace at ~/.config/easier-life-skills/shims/${pluginName}/\n` +
        `#  then runs: claude plugin install ${pluginName}@${pluginName})`
      )
    : [];

  const manualBlock = [
    ...marketplaceCommands,
    ...(shimHints.length > 0 ? ['', ...shimHints] : []),
  ].join('\n');

  return (
    <div class="bundle-card">
      <div>
        <div class="bundle-name">{bundle.name}</div>
        <div class="bundle-desc">{bundle.description}</div>
      </div>
      <Expandable
        className="bundle-skills"
        items={allItems}
        limit={ITEM_LIMIT}
        renderItem={e => (
          <div class="bundle-skill-item">
            <span class="bundle-item-kind">{KIND_LABEL[e.kind] ?? e.kind}</span>
            {e.name}
          </div>
        )}
      />
      <div class="bundle-install">
        <div class="bundle-install-primary">
          <pre>{npxCommand}</pre>
          <CopyButton text={npxCommand} label="Copy" className="bundle-copy-btn" />
        </div>
        {manualBlock && (
          <details class="bundle-install-manual">
            <summary>Or install manually</summary>
            <div class="bundle-install-manual-body">
              <pre>{manualBlock}</pre>
              <CopyButton text={manualBlock} label="Copy all" className="bundle-copy-btn" />
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
