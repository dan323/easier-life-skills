import { CopyButton } from '../CopyButton.tsx';
import { Expandable } from '../Expandable.tsx';
import type { Bundle, Skill } from '../../types.ts';

const SKILL_LIMIT = 4;

interface Props {
  bundle: Bundle;
  skills: Skill[];
}

export function BundleCard({ bundle, skills }: Props) {
  const bundleSkills = bundle.skills
    .map(name => skills.find(s => s.name === name))
    .filter((s): s is Skill => s !== undefined);

  const installBlock = bundleSkills
    .map(s => `/plugin install ${s.name}@${s.source.repo}`)
    .join('\n');

  return (
    <div class="bundle-card">
      <div>
        <div class="bundle-name">{bundle.name}</div>
        <div class="bundle-desc">{bundle.description}</div>
      </div>
      <Expandable
        className="bundle-skills"
        items={bundleSkills}
        limit={SKILL_LIMIT}
        renderItem={s => <div class="bundle-skill-item">{s.name}</div>}
      />
      <div class="bundle-install">
        <pre>{installBlock}</pre>
        <CopyButton text={installBlock} label="Copy all" className="bundle-copy-btn" />
      </div>
    </div>
  );
}
