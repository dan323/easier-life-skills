import { CopyButton } from '../CopyButton.tsx';
import { Expandable } from '../Expandable.tsx';
import type { Bundle, Skill } from '../../types.ts';

const SKILL_LIMIT = 4;

interface Props {
  bundle: Bundle;
  skills: Skill[];
  sources?: Record<string, { isMarketplace: boolean }>;
}

function isMarketplaceSource(skill: Skill, sources?: Record<string, { isMarketplace: boolean }>): boolean {
  if (!sources) return true;
  const key = `${skill.source.owner}/${skill.source.repo}`;
  return sources[key]?.isMarketplace !== false;
}

export function BundleCard({ bundle, skills, sources }: Props) {
  const bundleSkills = bundle.skills
    .map(name => skills.find(s => s.name === name))
    .filter((s): s is Skill => s !== undefined);

  const marketplaceCommands = [...new Set(
    bundleSkills
      .filter(s => isMarketplaceSource(s, sources))
      .map(s => s.installCommand)
  )];
  const pluginOnlySkills = bundleSkills.filter(s => !isMarketplaceSource(s, sources));
  const hasPluginOnly = pluginOnlySkills.length > 0;

  // Always-works one-liner — the npx CLI routes per source automatically
  const npxCommand = `npx @dan323/easier-life-skills --bundle ${bundle.id ?? bundle.name}`;

  // What goes inside the <pre>: the manual-install alternative for users who
  // prefer pasting into Claude Code directly. For plugin-only sources we point
  // back at the npx command (which auto-generates a shim marketplace) since
  // the manual equivalent is a multi-step shell recipe rather than a single
  // pasteable `/plugin install …` line.
  const shimHints = hasPluginOnly
    ? Array.from(
        pluginOnlySkills.reduce((acc, s) => {
          const pluginName = s.pluginName ?? s.name;
          if (!acc.has(pluginName)) acc.set(pluginName, s);
          return acc;
        }, new Map<string, Skill>())
      ).map(([pluginName, s]) =>
        `# Plugin-only repo ${s.source.owner}/${s.source.repo} — use the npx command above.\n` +
        `# (auto-creates a shim marketplace at ~/.config/easier-life-skills/shims/${pluginName}/\n` +
        `#  then runs: claude plugin install ${pluginName}@${pluginName})`
      )
    : [];

  const manualBlock = [
    ...marketplaceCommands,
    ...(shimHints.length > 0 ? ['', ...shimHints] : []),
  ].join('\n');

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
        <div class="bundle-install-primary">
          <pre>{npxCommand}</pre>
          <CopyButton text={npxCommand} label="Copy" className="bundle-copy-btn" />
        </div>
        {manualBlock && (
          <details class="bundle-install-manual">
            <summary>Or install manually</summary>
            <div class="bundle-install-manual-body">
              <pre>{manualBlock}</pre>
              <CopyButton text={manualBlock} label="Copy all" className="bundle-copy-btn" />
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
