export interface SourceItem {
  repo:    string;
  count:   number;
  builtin: boolean;
  error?:  string;
}

interface Props {
  sources:     SourceItem[];
  activeRepos: Set<string>;
  onToggle:    (repo: string) => void;
  onCopyAdd:   (repo: string) => void;
}

export function MarketplaceBar({ sources, activeRepos, onToggle, onCopyAdd }: Props) {
  return (
    <div class="marketplace-bar">
      <div class="marketplace-sources" id="marketplace-sources">
        {sources.map(s => {
          const active = activeRepos.has(s.repo);
          return (
            <div
              key={s.repo}
              class={
                'source-tag' +
                (s.builtin ? ' builtin' : '') +
                (active ? ' active' : '') +
                (s.error ? ' source-error' : '')
              }
              data-repo={s.repo}
              role="button"
              tabindex={0}
              aria-pressed={active ? 'true' : 'false'}
              title={s.error}
              onClick={e => {
                if ((e.target as HTMLElement).closest('.source-add-copy')) return;
                onToggle(s.repo);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggle(s.repo);
                }
              }}
            >
              <span class="label">
                {s.error ? `${s.repo} ✕` : `${s.repo} (${s.count})`}
              </span>
              <button
                type="button"
                class="source-add-copy"
                title={`Copy "/plugin marketplace add ${s.repo}"`}
                aria-label={`Copy marketplace add command for ${s.repo}`}
                onClick={e => { e.stopPropagation(); onCopyAdd(s.repo); }}
              >
                +
              </button>
            </div>
          );
        })}
      </div>
      <a
        class="marketplace-add-cta"
        href="https://github.com/dan323/easier-life-skills/issues/new?template=add-marketplace.yml"
        target="_blank"
        rel="noopener"
      >
        Add your marketplace →
      </a>
    </div>
  );
}
