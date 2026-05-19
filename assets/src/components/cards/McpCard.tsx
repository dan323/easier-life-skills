import { titleCase } from '../../utils.ts';
import { CopyButton } from '../CopyButton.tsx';
import type { McpServer } from '../../types.ts';

interface Props {
  mcp:             McpServer;
  showSource:      boolean;
  showInstall:     boolean;
  onOpen:          (m: McpServer) => void;
  bundled?:        boolean;
  onToggleBundle?: (m: McpServer) => void;
}

export function McpCard({ mcp, showSource, showInstall, onOpen, bundled, onToggleBundle }: Props) {
  const catClass = mcp.category ? 'badge-' + mcp.category : 'badge-uncategorized';
  const catLabel = mcp.category ? titleCase(mcp.category) : 'Uncategorized';
  const activate = () => onOpen(mcp);
  return (
    <div class={`skill-card${bundled ? ' skill-card--bundled' : ''}`}>
      <div class="card-header">
        <button
          type="button"
          class="card-name"
          aria-label={`Open details for MCP server ${mcp.name}`}
          onClick={activate}
        >
          <span class="card-name-text">{mcp.name}</span>
          <span class="card-name-chevron" aria-hidden="true">›</span>
        </button>
        <div class="card-badges">
          <span class={`badge badge-cat ${catClass}`}>{catLabel}</span>
          {showSource && <span class="badge badge-source">{mcp._repo}</span>}
        </div>
      </div>
      <p class="card-desc">{mcp.description}</p>
      <div class="card-actions">
        {showInstall && (
          <div class="card-install">
            <code>{mcp.installCommand}</code>
            <CopyButton
              text={mcp.installCommand}
              ariaLabel={`Copy install command for ${mcp.name}`}
              stopPropagation
              analyticsEvent={{
                name:   'install_copy',
                params: { kind: 'mcpServer', name: mcp.name, source: mcp._repo ?? '', command_type: 'install' },
              }}
            />
          </div>
        )}
        {onToggleBundle && (
          <button
            type="button"
            class={`bundle-add-btn${bundled ? ' bundle-add-btn--active' : ''}`}
            aria-label={bundled ? `Remove ${mcp.name} from bundle` : `Add ${mcp.name} to bundle`}
            aria-pressed={bundled}
            onClick={e => { e.stopPropagation(); onToggleBundle(mcp); }}
          >
            {bundled ? '✓ Bundled' : '+ Bundle'}
          </button>
        )}
      </div>
    </div>
  );
}
