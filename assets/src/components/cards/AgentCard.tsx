import { titleCase } from '../../utils.ts';
import { CopyButton } from '../CopyButton.tsx';
import type { Agent } from '../../types.ts';

interface Props {
  agent:           Agent;
  showSource:      boolean;
  showInstall:     boolean;
  onOpen:          (a: Agent) => void;
  bundled?:        boolean;
  onToggleBundle?: (a: Agent) => void;
}

export function AgentCard({ agent, showSource, showInstall, onOpen, bundled, onToggleBundle }: Props) {
  const catClass = agent.category ? 'badge-' + agent.category : 'badge-uncategorized';
  const catLabel = agent.category ? titleCase(agent.category) : 'Uncategorized';
  const activate = () => onOpen(agent);
  return (
    <div class={`skill-card${bundled ? ' skill-card--bundled' : ''}`}>
      <div class="card-header">
        <button
          type="button"
          class="card-name"
          aria-label={`Open details for agent ${agent.name}`}
          onClick={activate}
        >
          <span class="card-name-text">{agent.name}</span>
          <span class="card-name-chevron" aria-hidden="true">›</span>
        </button>
        <div class="card-badges">
          {agent.background && <span class="badge badge-readonly">background</span>}
          {agent.scanResult && (
            agent.scanResult.passed
              ? <span class="badge badge-scan-ok" title={`Content scanned at v${agent.scanResult.scannedVersion} — no injection patterns detected`}>✓ scanned</span>
              : <span class="badge badge-scan-warn" title={`Flagged at v${agent.scanResult.scannedVersion}: ${agent.scanResult.flags.map(f => f.detail).join('; ')}`}>⚠ flagged</span>
          )}
          <span class={`badge badge-cat ${catClass}`}>{catLabel}</span>
          {showSource && <span class="badge badge-source">{agent._repo}</span>}
        </div>
      </div>
      <p class="card-desc">{agent.description}</p>
      <div class="card-actions">
        {showInstall && (
          <div class="card-install">
            <code>{agent.installCommand}</code>
            <CopyButton
              text={agent.installCommand}
              ariaLabel={`Copy install command for ${agent.name}`}
              stopPropagation
              analyticsEvent={{
                name:   'install_copy',
                params: { kind: 'agent', name: agent.name, source: agent._repo ?? '', command_type: 'install' },
              }}
            />
          </div>
        )}
        {onToggleBundle && (
          <button
            type="button"
            class={`bundle-add-btn${bundled ? ' bundle-add-btn--active' : ''}`}
            aria-label={bundled ? `Remove ${agent.name} from bundle` : `Add ${agent.name} to bundle`}
            aria-pressed={bundled}
            onClick={e => { e.stopPropagation(); onToggleBundle(agent); }}
          >
            {bundled ? '✓ Bundled' : '+ Bundle'}
          </button>
        )}
      </div>
    </div>
  );
}
