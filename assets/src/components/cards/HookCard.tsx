import { CopyButton } from '../CopyButton.tsx';
import type { Hook } from '../../types.ts';

interface Props {
  hook:        Hook;
  showSource:  boolean;
  showInstall: boolean;
  onOpen:      (h: Hook) => void;
}

export function HookCard({ hook, showSource, showInstall, onOpen }: Props) {
  const activate = () => onOpen(hook);
  const events = hook.events.length ? hook.events : ['—'];
  return (
    <div class="skill-card">
      <div class="card-header">
        <button
          type="button"
          class="card-name"
          aria-label={`Open details for hook ${hook.name}`}
          onClick={activate}
        >{hook.name}</button>
        <div class="card-badges">
          <span class="badge badge-cat badge-automation">Hook</span>
          {showSource && <span class="badge badge-source">{hook._repo}</span>}
        </div>
      </div>
      <p class="card-desc">{hook.description || '—'}</p>
      <div class="card-chips">
        {events.map(e => <span class="chip chip-hook">{e}</span>)}
      </div>
      {showInstall && (
        <div class="card-install">
          <code>{hook.installCommand}</code>
          <CopyButton
            text={hook.installCommand}
            ariaLabel={`Copy install command for ${hook.name}`}
            stopPropagation
          />
        </div>
      )}
    </div>
  );
}
