import { titleCase } from '../../utils.ts';
import { CopyButton } from '../CopyButton.tsx';
import type { Command } from '../../types.ts';

interface Props {
  command:     Command;
  showSource:  boolean;
  showInstall: boolean;
  onOpen:      (c: Command) => void;
}

export function CommandCard({ command: cmd, showSource, showInstall, onOpen }: Props) {
  const catClass = cmd.category ? 'badge-' + cmd.category : 'badge-uncategorized';
  const catLabel = cmd.category ? titleCase(cmd.category) : 'Uncategorized';
  const activate = () => onOpen(cmd);
  return (
    <div class="skill-card">
      <div class="card-header">
        <button
          type="button"
          class="card-name"
          aria-label={`Open details for command ${cmd.name}`}
          onClick={activate}
        >
          <span class="card-name-text">{cmd.name}</span>
          <span class="card-name-chevron" aria-hidden="true">›</span>
        </button>
        <div class="card-badges">
          <span class={`badge badge-cat ${catClass}`}>{catLabel}</span>
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
            analyticsEvent={{
              name:   'install_copy',
              params: { kind: 'command', name: cmd.name, source: cmd._repo ?? '', command_type: 'install' },
            }}
          />
        </div>
      )}
    </div>
  );
}
