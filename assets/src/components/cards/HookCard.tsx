import { titleCase } from '../../utils.ts';
import { CopyButton } from '../CopyButton.tsx';
import type { Hook } from '../../types.ts';

interface Props {
  hook:            Hook;
  showSource:      boolean;
  showInstall:     boolean;
  onOpen:          (h: Hook) => void;
  bundled?:        boolean;
  onToggleBundle?: (h: Hook) => void;
}

export function HookCard({ hook, showSource, showInstall, onOpen, bundled, onToggleBundle }: Props) {
  const catClass = hook.category ? 'badge-' + hook.category : 'badge-uncategorized';
  const catLabel = hook.category ? titleCase(hook.category) : 'Uncategorized';
  const activate = () => onOpen(hook);
  const events = hook.events.length ? hook.events : ['—'];
  return (
    <div class={`skill-card${bundled ? ' skill-card--bundled' : ''}`}>
      <div class="card-header">
        <button
          type="button"
          class="card-name"
          aria-label={`Open details for hook ${hook.name}`}
          onClick={activate}
        >
          <span class="card-name-text">{hook.name}</span>
          <span class="card-name-chevron" aria-hidden="true">›</span>
        </button>
        <div class="card-badges">
          <span class={`badge badge-cat ${catClass}`}>{catLabel}</span>
          {showSource && <span class="badge badge-source">{hook._repo}</span>}
        </div>
      </div>
      <p class="card-desc">{hook.description || '—'}</p>
      <div class="card-chips">
        {events.map(e => <span class="chip chip-hook">{e}</span>)}
      </div>
      <div class="card-actions">
        {showInstall && (
          <div class="card-install">
            <code>{hook.installCommand}</code>
            <CopyButton
              text={hook.installCommand}
              ariaLabel={`Copy install command for ${hook.name}`}
              stopPropagation
              analyticsEvent={{
                name:   'install_copy',
                params: { kind: 'hook', name: hook.name, source: hook._repo ?? '', command_type: 'install' },
              }}
            />
          </div>
        )}
        {onToggleBundle && (
          <button
            type="button"
            class={`bundle-add-btn${bundled ? ' bundle-add-btn--active' : ''}`}
            aria-label={bundled ? `Remove ${hook.name} from bundle` : `Add ${hook.name} to bundle`}
            aria-pressed={bundled}
            onClick={e => { e.stopPropagation(); onToggleBundle(hook); }}
          >
            {bundled ? '✓ Bundled' : '+ Bundle'}
          </button>
        )}
      </div>
    </div>
  );
}
