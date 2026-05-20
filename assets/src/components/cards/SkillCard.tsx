import { titleCase } from '../../utils.ts';
import { CopyButton } from '../CopyButton.tsx';
import type { Skill } from '../../types.ts';

interface Props {
  skill:        Skill;
  showSource:   boolean;
  showInstall:  boolean;
  onOpen:       (skill: Skill) => void;
  bundled?:     boolean;
  onToggleBundle?: (skill: Skill) => void;
}

export function SkillCard({ skill, showSource, showInstall, onOpen, bundled, onToggleBundle }: Props) {
  const catClass = skill.category ? 'badge-' + skill.category : 'badge-uncategorized';
  const catLabel = skill.category ? titleCase(skill.category) : 'Uncategorized';
  const activate = () => onOpen(skill);

  return (
    <div class={`skill-card${bundled ? ' skill-card--bundled' : ''}`}>
      <div class="card-header">
        <button
          type="button"
          class="card-name"
          aria-label={`Open details for skill ${skill.name}`}
          onClick={activate}
        >
          <span class="card-name-text">{skill.name}</span>
          <span class="card-name-chevron" aria-hidden="true">›</span>
        </button>
        <div class="card-badges">
          {skill.readOnly && <span class="badge badge-readonly">read-only</span>}
          {skill.rating && (
            <span class="badge badge-rating" aria-label={`Rating: ${skill.rating.avg} out of 5, ${skill.rating.count} review${skill.rating.count !== 1 ? 's' : ''}`}>
              ★ {skill.rating.avg} ({skill.rating.count})
            </span>
          )}
          <span class={`badge badge-cat ${catClass}`}>{catLabel}</span>
          {showSource && <span class="badge badge-source">{skill._repo}</span>}
        </div>
      </div>
      <p class="card-desc">{skill.description}</p>
      <div class="card-actions">
        {showInstall && (
          <div class="card-install">
            <code>{skill.installCommand}</code>
            <CopyButton
              text={skill.installCommand}
              ariaLabel={`Copy install command for ${skill.name}`}
              stopPropagation
              analyticsEvent={{
                name:   'install_copy',
                params: { kind: 'skill', name: skill.name, source: skill._repo ?? '', command_type: 'install' },
              }}
            />
          </div>
        )}
        {onToggleBundle && (
          <button
            type="button"
            class={`bundle-add-btn${bundled ? ' bundle-add-btn--active' : ''}`}
            aria-label={bundled ? `Remove ${skill.name} from bundle` : `Add ${skill.name} to bundle`}
            aria-pressed={bundled}
            onClick={e => { e.stopPropagation(); onToggleBundle(skill); }}
          >
            {bundled ? '✓ Bundled' : '+ Bundle'}
          </button>
        )}
      </div>
    </div>
  );
}
