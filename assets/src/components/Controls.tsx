import { Filters } from './Filters.tsx';

export type ViewKey = 'plugins' | 'skills' | 'agents' | 'mcpServers' | 'commands' | 'hooks' | 'bundles';

interface Props {
  query:            string;
  onSearch:         (q: string) => void;
  sort:             'az' | 'za';
  onToggleSort:     () => void;
  view:             ViewKey;
  onSwitchView:     (v: ViewKey) => void;
  categories:       string[];
  activeCategories: Set<string>;
  onToggleCategory: (cat: string) => void;
}

const VIEWS: { key: ViewKey; id: string; label: string }[] = [
  { key: 'plugins',    id: 'view-plugins',  label: 'Plugins' },
  { key: 'skills',     id: 'view-skills',   label: 'Skills' },
  { key: 'agents',     id: 'view-agents',   label: 'Agents' },
  { key: 'mcpServers', id: 'view-mcp',      label: 'MCP Servers' },
  { key: 'commands',   id: 'view-commands', label: 'Commands' },
  { key: 'hooks',      id: 'view-hooks',    label: 'Hooks' },
  { key: 'bundles',    id: 'view-bundles',  label: 'Bundles' },
];

export function Controls({
  query, onSearch, sort, onToggleSort, view, onSwitchView,
  categories, activeCategories, onToggleCategory,
}: Props) {
  const sortLabel = sort === 'az' ? 'Sort: A→Z' : 'Sort: Z→A';
  const sortTitle = sort === 'az' ? 'Click to sort Z→A' : 'Click to sort A→Z';
  const sortAria  = sort === 'az'
    ? 'Currently sorted A to Z. Click to sort Z to A.'
    : 'Currently sorted Z to A. Click to sort A to Z.';

  const filtersVisible = view === 'plugins' || view === 'skills';

  return (
    <div class="controls">
      <form role="search" style={{ display: 'contents' }}>
        <input
          id="search"
          type="search"
          placeholder="Search skills… (press / to focus)"
          autocomplete="off"
          aria-label="Search skills"
          value={query}
          onInput={e => onSearch((e.currentTarget as HTMLInputElement).value)}
        />
      </form>

      <Filters
        categories={categories}
        activeCategories={activeCategories}
        onToggle={onToggleCategory}
        hidden={!filtersVisible}
      />

      <button
        id="sort-btn"
        class="sort-btn"
        title={sortTitle}
        aria-label={sortAria}
        onClick={onToggleSort}
      >
        {sortLabel}
      </button>

      <div class="view-toggle" role="group" aria-label="View type">
        {VIEWS.map(v => {
          const active = v.key === view;
          return (
            <button
              key={v.key}
              id={v.id}
              class={'view-btn' + (active ? ' active' : '')}
              aria-pressed={active ? 'true' : 'false'}
              onClick={() => onSwitchView(v.key)}
            >
              {v.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
