import { titleCase } from '../../utils.ts';
import { CopyButton } from '../CopyButton.tsx';
import type { Agent } from '../../types.ts';

interface Props {
  agent:       Agent;
  showSource:  boolean;
  showInstall: boolean;
  onOpen:      (a: Agent) => void;
}

export function AgentCard({ agent, showSource, showInstall, onOpen }: Props) {
  const catClass = agent.category ? 'badge-' + agent.category : 'badge-uncategorized';
  const catLabel = agent.category ? titleCase(agent.category) : 'Uncategorized';
  const activate = () => onOpen(agent);
  return (
    <div class="skill-card">
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
          <span class={`badge badge-cat ${catClass}`}>{catLabel}</span>
          {showSource && <span class="badge badge-source">{agent._repo}</span>}
        </div>
      </div>
      <p class="card-desc">{agent.description}</p>
      {showInstall && (
        <div class="card-install">
          <code>{agent.installCommand}</code>
          <CopyButton
            text={agent.installCommand}
            ariaLabel={`Copy install command for ${agent.name}`}
            stopPropagation
          />
        </div>
      )}
    </div>
  );
}
