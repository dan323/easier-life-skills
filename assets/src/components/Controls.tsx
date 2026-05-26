import { Filters } from './Filters.tsx';
import type { SortKey } from '../url-state.ts';
import type { ViewKey } from '../types.ts';

interface Props {
  query:            string;
  onSearch:         (q: string) => void;
  sort:             SortKey;
  onToggleSort:     () => void;
  isNLSearch:       boolean;
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
  query, onSearch, sort, onToggleSort, isNLSearch, view, onSwitchView,
  categories, activeCategories, onToggleCategory,
}: Props) {
  const sortLabel = isNLSearch ? 'Sort: Relevance' : sort === 'az' ? 'Sort: A→Z' : sort === 'za' ? 'Sort: Z→A' : 'Sort: Rating';
  const sortTitle = isNLSearch
    ? 'Results are ranked by relevance while a multi-word query is active'
    : sort === 'az' ? 'Click to sort Z→A' : sort === 'za' ? 'Click to sort by Rating' : 'Click to sort A→Z';
  // WCAG 2.5.3 (label-content-name-mismatch): the accessible name must
  // contain the visible text. Lead the aria-label with the visible label so
  // screen-reader users hear the same words a sighted user reads.
  const sortAria  = isNLSearch
    ? 'Sort: Relevance. Results ranked by search relevance.'
    : sort === 'az'
      ? 'Sort: A→Z. Click to sort Z to A.'
      : sort === 'za'
        ? 'Sort: Z→A. Click to sort by Rating.'
        : 'Sort: Rating. Click to sort A to Z.';

  // Filter bar shows for every entity view (all but bundles), but only when
  // there is at least one category to filter by — otherwise the bar would
  // render as an empty strip.
  const filtersVisible = view !== 'bundles' && categories.length > 0;

  return (
    <section class="controls" aria-label="Filters and view">
      <form
        role="search"
        class="search-form"
        onSubmit={e => e.preventDefault()}
      >
        <div class="search-wrap">
          <input
            id="search"
            type="search"
            placeholder="Search or describe a task…"
            autocomplete="off"
            aria-label="Search marketplace — type a name or describe what you want in plain English"
            aria-keyshortcuts="/"
            title="Type a plugin or skill name, or describe what you want in plain English (e.g. 'find unused code', 'generate a changelog')"
            value={query}
            onInput={e => onSearch((e.currentTarget as HTMLInputElement).value)}
          />
          <kbd class="search-kbd" aria-hidden="true">/</kbd>
          {/* WCAG 3.2.2: explicit submit control so keyboard/AT users can
              trigger the form. Filtering happens live on input, so submit
              is a no-op handled by the form's onSubmit. */}
          <button type="submit" class="sr-only">Search</button>
        </div>
      </form>

      <Filters
        categories={categories}
        activeCategories={activeCategories}
        onToggle={onToggleCategory}
        hidden={!filtersVisible}
      />

      <button
        id="sort-btn"
        class={'sort-btn' + (isNLSearch ? ' sort-btn--nl' : '')}
        title={sortTitle}
        aria-label={sortAria}
        disabled={isNLSearch}
        onClick={onToggleSort}
      >
        <span class="sort-icon" aria-hidden="true">⇅</span><span class="sort-label">{sortLabel}</span>
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
    </section>
  );
}
