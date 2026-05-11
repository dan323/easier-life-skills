import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { titleCase } from '../utils.ts';
import { BUILTIN_REPO } from '../constants.ts';
import { CopyButton } from './CopyButton.tsx';
import type { Skill, Agent, McpServer, Command, Hook, Bundle } from '../types.ts';

export type EntityKind = 'skill' | 'agent' | 'mcpServer' | 'command' | 'hook';

interface OpenEntity {
  kind:   EntityKind;
  entity: Skill | Agent | McpServer | Command | Hook;
}

interface Props {
  open:    OpenEntity | null;
  bundles: Bundle[];
  onClose: () => void;
}

const KIND_META: Record<EntityKind, { label: string; badgeCls: string }> = {
  skill:     { label: 'Skill',      badgeCls: 'badge-skill'      },
  agent:     { label: 'Agent',      badgeCls: 'badge-automation' },
  mcpServer: { label: 'MCP Server', badgeCls: 'badge-database'   },
  command:   { label: 'Command',    badgeCls: 'badge-automation' },
  hook:      { label: 'Hook',       badgeCls: 'badge-automation' },
};

function hrefFor(kind: EntityKind, e: Skill | Agent | McpServer | Command | Hook): string | null {
  switch (kind) {
    case 'skill':     return (e as Skill).rawSkillUrl;
    case 'agent':     return (e as Agent).rawAgentUrl;
    case 'command':   return (e as Command).rawCommandUrl;
    case 'hook':      return (e as Hook).rawHookUrl;
    case 'mcpServer': return null;
  }
}

export function EntityPanel({ open, bundles, onClose }: Props) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocusedRef.current = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => closeBtnRef.current?.focus());
    return () => {
      document.body.style.overflow = '';
      const prev = lastFocusedRef.current;
      if (prev && document.body.contains(prev)) prev.focus();
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const isOpen = open !== null;

  return (
    <div
      id="entity-panel"
      class={isOpen ? 'open' : ''}
      aria-hidden={isOpen ? undefined : 'true'}
      aria-modal="true"
      role="dialog"
      aria-label="Item details"
    >
      <div id="entity-panel-overlay" onClick={onClose} />
      <div class="entity-panel-content">
        {open && <EntityPanelBody open={open} bundles={bundles} onClose={onClose} closeBtnRef={closeBtnRef} />}
      </div>
    </div>
  );
}

function EntityPanelBody({
  open: { kind, entity }, bundles, onClose, closeBtnRef,
}: { open: OpenEntity; bundles: Bundle[]; onClose: () => void; closeBtnRef: { current: HTMLButtonElement | null } }) {
  const meta = KIND_META[kind];
  const href = hrefFor(kind, entity);
  const category = (entity as Skill).category;

  const sourceKey = entity._repo ?? `${entity.source.owner}/${entity.source.repo}`;
  const isBuiltin = sourceKey === BUILTIN_REPO;
  const marketplaceCmd = `/plugin marketplace add ${sourceKey}`;

  const tools    = (entity as Skill | Agent).tools ?? [];
  const events   = kind === 'hook'  ? (entity as Hook).events ?? []   : [];
  const keywords = kind === 'skill' ? (entity as Skill).keywords ?? [] : [];

  const mcpCommand = kind === 'mcpServer' ? (entity as McpServer).command : '';

  const skillBundles = kind === 'skill'
    ? bundles.filter(b => b.skills.includes(entity.name))
    : [];

  return (
    <>
      <div class="panel-header">
        <div class="panel-title-row">
          {href
            ? <a
                id="entity-panel-name"
                class="panel-name"
                href={href}
                target="_blank"
                rel="noopener"
              >{entity.name}</a>
            : <a
                id="entity-panel-name"
                class="panel-name"
                aria-disabled="true"
                rel="noopener"
              >{entity.name}</a>}
          <span id="entity-panel-kind" class={`badge badge-cat ${meta.badgeCls}`}>{meta.label}</span>
          <span id="entity-panel-category" class={category ? `badge badge-cat badge-${category}` : 'badge'} hidden={!category}>
            {category ? titleCase(category) : ''}
          </span>
          <span id="entity-panel-source" class="badge badge-source">{sourceKey}</span>
        </div>
        <button
          ref={closeBtnRef}
          id="entity-panel-close"
          class="panel-close-btn"
          aria-label="Close"
          onClick={onClose}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <p id="entity-panel-desc" class="panel-desc" style={{ display: entity.description ? '' : 'none' }}>
        {entity.description || ''}
      </p>

      <ChipSection
        sectionId="entity-panel-tools-section"
        listId="entity-panel-tools-list"
        countId="entity-panel-tools-count"
        title="Tools"
        items={tools}
        chipCls="chip-skill"
      />

      <ChipSection
        sectionId="entity-panel-events-section"
        listId="entity-panel-events-list"
        title="Triggers on"
        items={events}
        chipCls="chip-hook"
      />

      <ChipSection
        sectionId="entity-panel-keywords-section"
        listId="entity-panel-keywords-list"
        title="Keywords"
        items={keywords}
        chipCls="chip-command"
      />

      <div id="entity-panel-bundles-section" class="panel-section" hidden={!skillBundles.length}>
        <h3 class="panel-section-title">Part of bundles</h3>
        <div id="entity-panel-bundles-list" class="panel-items">
          {skillBundles.map(b => (
            <div key={b.name} class="panel-bundle-item">
              <span class="panel-bundle-name">{b.name}</span>
              <span class="panel-bundle-desc">{b.description}</span>
            </div>
          ))}
        </div>
      </div>

      <div id="entity-panel-command-section" class="panel-section" hidden={kind !== 'mcpServer' || !mcpCommand}>
        <h3 class="panel-section-title">Command</h3>
        <code id="entity-panel-command" class="panel-code-block">{mcpCommand}</code>
      </div>

      <div id="entity-panel-source-link-section" class="panel-section" hidden={!href}>
        <h3 class="panel-section-title">Source</h3>
        <a id="entity-panel-source-link" href={href ?? '#'} target="_blank" rel="noopener" class="panel-source-link">
          {href ?? ''}
        </a>
      </div>

      <div id="entity-panel-marketplace-row" class="panel-install-row" hidden={isBuiltin}>
        <code id="entity-panel-marketplace-cmd">{marketplaceCmd}</code>
        <CopyButton
          id="entity-panel-marketplace-copy"
          text={marketplaceCmd}
          label="Copy add"
          className="panel-copy-btn"
          ariaLabel={`Copy marketplace add command for ${sourceKey}`}
        />
      </div>
      <div class="panel-install-row">
        <code id="entity-panel-install-cmd">{entity.installCommand}</code>
        <CopyButton
          id="entity-panel-install-copy"
          text={entity.installCommand}
          label="Copy install"
          className="panel-copy-btn"
          ariaLabel={`Copy install command for ${entity.name}`}
        />
      </div>
    </>
  );
}

function ChipSection({
  sectionId, listId, countId, title, items, chipCls,
}: {
  sectionId: string; listId: string; countId?: string;
  title: string; items: string[]; chipCls: string;
}) {
  return (
    <div id={sectionId} class="panel-section" hidden={!items.length}>
      <h3 class="panel-section-title">
        {title}
        {countId && <> <span id={countId} class="panel-count">{items.length}</span></>}
      </h3>
      <div id={listId} class="panel-chips">
        {items.map(item => <span class={`chip ${chipCls}`}>{item}</span>)}
      </div>
    </div>
  );
}
