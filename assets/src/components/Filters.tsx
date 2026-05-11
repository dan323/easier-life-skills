import { titleCase } from '../utils.ts';

interface Props {
  categories:       string[];
  activeCategories: Set<string>;
  onToggle:         (cat: string) => void;
  hidden:           boolean;
}

export function Filters({ categories, activeCategories, onToggle, hidden }: Props) {
  return (
    <div class="filter-group" id="filters" style={hidden ? { display: 'none' } : undefined}>
      {categories.map(cat => {
        const active = activeCategories.has(cat);
        return (
          <button
            key={cat}
            class={'filter-btn' + (active ? ' active' : '')}
            aria-pressed={active ? 'true' : 'false'}
            onClick={() => onToggle(cat)}
          >
            {titleCase(cat)}
          </button>
        );
      })}
    </div>
  );
}
