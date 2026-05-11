import { titleCase } from '../../utils.ts';
import { CopyButton } from '../CopyButton.tsx';
import type { Skill } from '../../types.ts';

interface Props {
  skill:       Skill;
  showSource:  boolean;
  showInstall: boolean;
  onOpen:      (skill: Skill) => void;
}

export function SkillCard({ skill, showSource, showInstall, onOpen }: Props) {
  const catClass = skill.category ? 'badge-' + skill.category : 'badge-uncategorized';
  const catLabel = skill.category ? titleCase(skill.category) : 'Uncategorized';
  const activate = () => onOpen(skill);

  return (
    <div class="skill-card">
      <div class="card-header">
        <button
          type="button"
          class="card-name"
          aria-label={`Open details for skill ${skill.name}`}
          onClick={activate}
        >{skill.name}</button>
        <div class="card-badges">
          {skill.readOnly && <span class="badge badge-readonly">read-only</span>}
          <span class={`badge badge-cat ${catClass}`}>{catLabel}</span>
          {showSource && <span class="badge badge-source">{skill._repo}</span>}
        </div>
      </div>
      <p class="card-desc">{skill.description}</p>
      {showInstall && (
        <div class="card-install">
          <code>{skill.installCommand}</code>
          <CopyButton
            text={skill.installCommand}
            ariaLabel={`Copy install command for ${skill.name}`}
            stopPropagation
          />
        </div>
      )}
    </div>
  );
}
