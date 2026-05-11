import { CopyButton } from '../CopyButton.tsx';
import type { McpServer } from '../../types.ts';

interface Props {
  mcp:         McpServer;
  showSource:  boolean;
  showInstall: boolean;
  onOpen:      (m: McpServer) => void;
}

export function McpCard({ mcp, showSource, showInstall, onOpen }: Props) {
  const activate = () => onOpen(mcp);
  return (
    <div
      class="skill-card"
      role="button"
      tabindex={0}
      aria-label={`Open details for MCP server ${mcp.name}`}
      style={{ cursor: 'pointer' }}
      onClick={activate}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } }}
    >
      <div class="card-header">
        <span class="card-name">{mcp.name}</span>
        <div class="card-badges">
          <span class="badge badge-cat badge-database">MCP Server</span>
          {showSource && <span class="badge badge-source">{mcp._repo}</span>}
        </div>
      </div>
      <p class="card-desc">{mcp.description}</p>
      {showInstall && (
        <div class="card-install">
          <code>{mcp.installCommand}</code>
          <CopyButton
            text={mcp.installCommand}
            ariaLabel={`Copy install command for ${mcp.name}`}
            stopPropagation
          />
        </div>
      )}
    </div>
  );
}
