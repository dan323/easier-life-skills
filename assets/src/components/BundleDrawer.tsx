import { useLayoutEffect, useMemo, useRef } from 'preact/hooks';
import { CopyButton } from './CopyButton.tsx';
import { buildInstallScript, findContainingBundle } from '../bundle-state.ts';
import type { BundleItem } from '../bundle-state.ts';
import type { Bundle } from '../types.ts';

interface Props {
  items:          BundleItem[];
  sources:        Record<string, { isMarketplace: boolean }>;
  bundles:        Bundle[];
  onRemove:       (id: string) => void;
  onClear:        () => void;
  onGotoBundle:   () => void;
}

const KIND_LABEL: Record<string, string> = {
  skill:     'skill',
  agent:     'agent',
  mcpServer: 'mcp',
  command:   'cmd',
  hook:      'hook',
  plugin:    'plugin',
};

export function BundleDrawer({ items, sources, bundles, onRemove, onClear, onGotoBundle }: Props) {
  const open = items.length > 0;
  const script = buildInstallScript(items, sources);
  const containingBundle = useMemo(() => findContainingBundle(items, bundles), [items, bundles]);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Move initial focus into the drawer when it opens (accessibility)
  useLayoutEffect(() => {
    if (!open) return;
    const el = drawerRef.current;
    if (!el) return;
    // Move focus to the drawer when it first opens
    const first = el.querySelector<HTMLElement>('button, [tabindex]');
    first?.focus();
  }, [open]);

  // ESC closes (removes all items)
  useLayoutEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClear();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClear]);

  return (
    <div
      id="bundle-drawer"
      class={`bundle-drawer${open ? ' bundle-drawer--open' : ''}`}
      aria-live="polite"
      aria-label="Custom bundle builder"
      ref={drawerRef}
    >
      {open && (
        <>
          <div class="bundle-drawer-header">
            <span class="bundle-drawer-title">
              Bundle ({items.length})
            </span>
            <button
              type="button"
              class="bundle-drawer-clear"
              aria-label="Clear bundle"
              onClick={onClear}
            >
              Clear
            </button>
          </div>

          <ul class="bundle-drawer-list" aria-label="Selected items">
            {items.map(item => (
              <li key={item.id} class="bundle-drawer-item">
                <span class="bundle-drawer-item-kind">{KIND_LABEL[item.kind] ?? item.kind}</span>
                <span class="bundle-drawer-item-name">{item.name}</span>
                <button
                  type="button"
                  class="bundle-drawer-remove"
                  aria-label={`Remove ${item.name} from bundle`}
                  onClick={() => onRemove(item.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          {containingBundle && (
            <div class="bundle-drawer-suggestion">
              Everything here is in the <strong>{containingBundle.name}</strong> bundle.{' '}
              <button type="button" class="bundle-drawer-goto" onClick={onGotoBundle}>
                Go to bundle →
              </button>
            </div>
          )}

          {script && (
            <div class="bundle-drawer-script">
              <pre id="bundle-script">{script}</pre>
              <CopyButton
                text={script}
                label="Copy all"
                ariaLabel="Copy install script for bundle"
                className="bundle-drawer-copy"
                analyticsEvent={{
                  name:   'install_copy',
                  params: {
                    kind:         'bundle',
                    name:         `custom-${items.length}`,
                    source:       items[0]?.repo ?? '',
                    command_type: 'bundle_copy',
                  },
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
