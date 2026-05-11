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
    <div class="skill-card">
      <div class="card-header">
        <button
          type="button"
          class="card-name"
          aria-label={`Open details for MCP server ${mcp.name}`}
          onClick={activate}
        >{mcp.name}</button>
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
