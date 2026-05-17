import * as claude from './claude.js';
import { writeShim } from './shim.js';
import { isMarketplaceSource, toInstallable } from './logic.js';
import type { Installable, Plugin, Skill, Sources } from './types.js';

interface InstallOptions {
  dryRun?: boolean;
}

// Single install pipeline that works for any installable (skill, plugin, or a
// bare {pluginName, source} pair). Marketplace sources go through
// `claude plugin marketplace add <owner>/<repo>` + `claude plugin install
// <pluginName>@<repo>`; plugin-only sources get a per-plugin shim marketplace.
// Marketplace registrations and plugin installs are deduped per run.
export async function installItemsRespectingSource(
  items: Array<Skill | Plugin | Installable>,
  sources: Sources,
  { dryRun = false }: InstallOptions = {},
): Promise<void> {
  if (!(await claude.claudeAvailable())) {
    throw new Error('`claude` is not on $PATH. Install Claude Code from https://claude.ai/code, then re-run.');
  }

  const registered = await claude.getRegisteredMarketplaces();
  const installedThisRun = new Set<string>();
  const shimsWritten = new Set<string>();

  for (const raw of items) {
    const inst: Installable = 'pluginName' in raw
      ? { pluginName: raw.pluginName, source: raw.source }
      : toInstallable(raw);

    if (isMarketplaceSource(inst, sources)) {
      const repoSlug = `${inst.source.owner}/${inst.source.repo}`;
      if (!registered.has(inst.source.repo)) {
        await claude.addMarketplace(repoSlug, dryRun);
        registered.add(inst.source.repo);
      }
      const target = `${inst.pluginName}@${inst.source.repo}`;
      if (!installedThisRun.has(target)) {
        await claude.installPlugin(inst.pluginName, inst.source.repo, dryRun);
        installedThisRun.add(target);
      }
    } else {
      const shimDir = writeShim(inst, shimsWritten, dryRun);
      if (!registered.has(inst.pluginName)) {
        await claude.addMarketplace(shimDir, dryRun);
        registered.add(inst.pluginName);
      }
      const target = `${inst.pluginName}@${inst.pluginName}`;
      if (!installedThisRun.has(target)) {
        await claude.installPlugin(inst.pluginName, inst.pluginName, dryRun);
        installedThisRun.add(target);
      }
    }
  }
}

// Back-compat alias — the CLI and existing tests still use this name.
export const installSkillsRespectingSource = installItemsRespectingSource;
