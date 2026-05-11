import { CopyButton } from '../CopyButton.tsx';
import type { Command } from '../../types.ts';

interface Props {
  command:     Command;
  showSource:  boolean;
  showInstall: boolean;
  onOpen:      (c: Command) => void;
}

export function CommandCard({ command: cmd, showSource, showInstall, onOpen }: Props) {
  const activate = () => onOpen(cmd);
  return (
    <div
      class="skill-card"
      role="button"
      tabindex={0}
      aria-label={`Open details for command ${cmd.name}`}
      style={{ cursor: 'pointer' }}
      onClick={activate}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } }}
    >
      <div class="card-header">
        <a
          class="card-name"
          href={cmd.rawCommandUrl}
          target="_blank"
          rel="noopener"
          onClick={e => e.stopPropagation()}
        >{cmd.name}</a>
        <div class="card-badges">
          <span class="badge badge-cat badge-automation">Command</span>
          {showSource && <span class="badge badge-source">{cmd._repo}</span>}
        </div>
      </div>
      <p class="card-desc">{cmd.description || '—'}</p>
      {showInstall && (
        <div class="card-install">
          <code>{cmd.installCommand}</code>
          <CopyButton
            text={cmd.installCommand}
            ariaLabel={`Copy install command for ${cmd.name}`}
            stopPropagation
          />
        </div>
      )}
    </div>
  );
}
