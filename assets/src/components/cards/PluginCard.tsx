import { titleCase } from '../../utils.ts';
import { CopyButton } from '../CopyButton.tsx';
import { Expandable } from '../Expandable.tsx';
import type { Plugin } from '../../types.ts';

const CHIP_LIMIT = 5;

interface Chip { cls: string; text: string; }

interface Props {
  plugin:     Plugin;
  showSource: boolean;
  onOpen:     (plugin: Plugin) => void;
}

export function PluginCard({ plugin, showSource, onOpen }: Props) {
  const catClass = plugin.category ? 'badge-' + plugin.category : 'badge-uncategorized';
  const catLabel = plugin.category ? titleCase(plugin.category) : 'Uncategorized';
  const description = plugin.description ?? '';

  const allChips: Chip[] = [
    ...plugin.skills.map(n         => ({ cls: 'chip-skill',   text: `skill: ${n}` })),
    ...plugin.agents.map(n         => ({ cls: 'chip-agent',   text: `agent: ${n}` })),
    ...plugin.mcpServers.map(n     => ({ cls: 'chip-mcp',     text: `mcp: ${n}`   })),
    ...(plugin.commands ?? []).map(n => ({ cls: 'chip-command', text: `cmd: ${n}` })),
  ];

  const activate = () => onOpen(plugin);

  return (
    <div
      class="skill-card"
      role="button"
      tabindex={0}
      aria-label={`Open details for ${plugin.name}`}
      style={{ cursor: 'pointer' }}
      onClick={activate}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } }}
    >
      <div class="card-header">
        {plugin.homepage
          ? <a class="card-name" href={plugin.homepage} target="_blank" rel="noopener" onClick={e => e.stopPropagation()}>{plugin.name}</a>
          : <span class="card-name">{plugin.name}</span>}
        <div class="card-badges">
          <span class={`badge badge-cat ${catClass}`}>{catLabel}</span>
          {showSource && <span class="badge badge-source">{plugin._repo}</span>}
        </div>
      </div>
      <p class="card-desc">{description || 'No description available'}</p>
      {allChips.length > 0 && (
        <Expandable
          className="plugin-chips"
          items={allChips}
          limit={CHIP_LIMIT}
          itemType="items"
          renderItem={({ cls, text }) => <span class={`chip ${cls}`}>{text}</span>}
        />
      )}
      <div class="card-install">
        <code>{plugin.installCommand}</code>
        <CopyButton
          text={plugin.installCommand}
          ariaLabel={`Copy install command for ${plugin.name}`}
          stopPropagation
        />
      </div>
    </div>
  );
}
