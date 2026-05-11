import { CopyButton } from '../CopyButton.tsx';
import type { Agent } from '../../types.ts';

interface Props {
  agent:       Agent;
  showSource:  boolean;
  showInstall: boolean;
  onOpen:      (a: Agent) => void;
}

export function AgentCard({ agent, showSource, showInstall, onOpen }: Props) {
  const activate = () => onOpen(agent);
  return (
    <div
      class="skill-card"
      role="button"
      tabindex={0}
      aria-label={`Open details for agent ${agent.name}`}
      style={{ cursor: 'pointer' }}
      onClick={activate}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } }}
    >
      <div class="card-header">
        <a
          class="card-name"
          href={agent.rawAgentUrl}
          target="_blank"
          rel="noopener"
          onClick={e => e.stopPropagation()}
        >{agent.name}</a>
        <div class="card-badges">
          {agent.background && <span class="badge badge-readonly">background</span>}
          <span class="badge badge-cat badge-automation">Agent</span>
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
