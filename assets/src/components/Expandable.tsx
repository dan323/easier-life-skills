import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

interface Props<T> {
  items:      T[];
  limit:      number;
  renderItem: (item: T) => ComponentChildren;
  itemType?:  string;
  className?: string;
}

export function Expandable<T>({ items, limit, renderItem, itemType = 'more', className }: Props<T>) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, limit);
  const more = items.length > limit;

  return (
    <div class={className}>
      {shown.map(renderItem)}
      {more && (
        <button
          class="expand-btn"
          onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
        >
          {expanded ? 'Show less' : `+${items.length - limit} ${itemType}`}
        </button>
      )}
    </div>
  );
}
