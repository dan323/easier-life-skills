import * as claude from './claude.js';
import { writeShim } from './shim.js';
import { isMarketplaceSource } from './logic.js';
import type { Skill, Sources } from './types.js';

interface InstallOptions {
  dryRun?: boolean;
}

export async function installSkillsRespectingSource(
  skillsList: Skill[],
  sources: Sources,
  { dryRun = false }: InstallOptions = {},
): Promise<void> {
  if (!(await claude.claudeAvailable())) {
    throw new Error('`claude` is not on $PATH. Install Claude Code from https://claude.ai/code, then re-run.');
  }

  const registered = await claude.getRegisteredMarketplaces();
  const installedThisRun = new Set<string>();
  const shimsWritten = new Set<string>();

  for (const skill of skillsList) {
    if (isMarketplaceSource(skill, sources)) {
      const repoSlug = `${skill.source.owner}/${skill.source.repo}`;
      if (!registered.has(skill.source.repo)) {
        await claude.addMarketplace(repoSlug, dryRun);
        registered.add(skill.source.repo);
      }
      const target = `${skill.pluginName}@${skill.source.repo}`;
      if (!installedThisRun.has(target)) {
        await claude.installPlugin(skill.pluginName, skill.source.repo, dryRun);
        installedThisRun.add(target);
      }
    } else {
      const shimDir = writeShim(skill, shimsWritten, dryRun);
      if (!registered.has(skill.pluginName)) {
        await claude.addMarketplace(shimDir, dryRun);
        registered.add(skill.pluginName);
      }
      const target = `${skill.pluginName}@${skill.pluginName}`;
      if (!installedThisRun.has(target)) {
        await claude.installPlugin(skill.pluginName, skill.pluginName, dryRun);
        installedThisRun.add(target);
      }
    }
  }
}
