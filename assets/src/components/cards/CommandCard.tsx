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
    <div class="skill-card">
      <div class="card-header">
        <button
          type="button"
          class="card-name"
          aria-label={`Open details for command ${cmd.name}`}
          onClick={activate}
        >{cmd.name}</button>
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
