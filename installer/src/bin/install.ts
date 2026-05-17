#!/usr/bin/env node
// @dan323/easier-life-skills CLI installer
//
// Discovery uses the marketplace index at
//   https://dan323.github.io/easier-life-skills/skills_index.json
//
// Installation always goes through Claude Code's own `claude plugin` CLI so
// every install lands in `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`
// and is tracked in `~/.claude/plugins/installed_plugins.json` — meaning
// `claude plugin list`, `claude plugin update`, and `claude plugin uninstall`
// all see and operate on what this installer puts down.
//
//  • For skills whose source repo carries `.claude-plugin/marketplace.json`,
//    we register the upstream repo via `claude plugin marketplace add <owner>/<repo>`
//    and install the plugin from it.
//  • For skills whose source repo is plugin-only (no marketplace.json — e.g.
//    `mattpocock/skills`), we synthesise a per-plugin shim marketplace.json
//    under `~/.config/easier-life-skills/shims/<plugin>/.claude-plugin/`,
//    register that local path as a marketplace named after the plugin, and
//    `claude plugin install <plugin>@<plugin>`. Claude Code resolves the
//    `source: { source: "url", url: "https://github.com/<owner>/<repo>" }`
//    entry and fetches the upstream plugin itself.
//
// Usage: npx @dan323/easier-life-skills --list
//        npx @dan323/easier-life-skills --search <query>
//        npx @dan323/easier-life-skills --skill <name>
//        npx @dan323/easier-life-skills --bundle <id>
//        npx @dan323/easier-life-skills --update
//        npx @dan323/easier-life-skills --update <name>

import { createInterface } from 'readline';
import {
  filterSkills, resolveBundle, describeTarget,
  computeKnownMarketplaces, filterForUpdate, marketplacesForSkills,
} from '../lib/logic.js';
import { claudeAvailable, listInstalledPlugins, pluginUpdate } from '../lib/claude.js';
import { installSkillsRespectingSource } from '../lib/actions.js';
import type { Index } from '../lib/types.js';

const INDEX_URL = process.env.EASIER_LIFE_SKILLS_INDEX_URL
  || 'https://dan323.github.io/easier-life-skills/skills_index.json';
const LOCAL_MARKETPLACE = 'easier-life-skills';

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(name);
const flagVal = (name: string): string | null => {
  const i = args.indexOf(name);
  return i !== -1 ? (args[i + 1] ?? null) : null;
};

const skillName  = flagVal('--skill');
const bundleId   = flagVal('--bundle');
const listOnly   = flag('--list');
const searchTerm = flagVal('--search');
const updateMode = flag('--update');
const updateRaw  = flagVal('--update');
const updateTarget = updateRaw && !updateRaw.startsWith('--') ? updateRaw : null;
const dryRun     = flag('--dry-run');
const yes        = flag('--yes');

if (args.includes('--search') && (searchTerm == null || searchTerm.startsWith('--'))) {
  console.error('Error: --search requires a query, e.g. --search logging');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json() as Promise<T>;
}

async function confirm(message: string): Promise<boolean> {
  if (yes) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (ans) => {
      rl.close();
      resolve(ans.trim().toLowerCase() === 'y');
    });
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  let index: Index;
  try {
    process.stdout.write('Fetching skill index… ');
    index = await fetchJson<Index>(INDEX_URL);
    console.log('done');
  } catch (err) {
    console.error(`\nFailed to fetch index: ${(err as Error).message}`);
    process.exit(1);
  }

  const { skills, bundles, meta } = index;
  const sources = meta?.sources ?? {};

  // ── --list ────────────────────────────────────────────────────────────────
  if (listOnly) {
    console.log(`\n═══ easier-life-skills (${meta.skillCount} skills across ${meta.marketplaces?.length ?? 1} marketplace(s)) ═══\n`);
    console.log('SKILLS\n');
    skills.forEach((s) => {
      const ro = s.readOnly ? ' [read-only]' : '';
      const src = `${s.source.owner}/${s.source.repo}`;
      console.log(`  ${s.name.padEnd(28)} ${s.description.slice(0, 45).padEnd(46)} ${src}${ro}`);
    });
    console.log('\nBUNDLES\n');
    bundles.forEach((b) => {
      const skillNames = b.skills.map((r) => (typeof r === 'string' ? r : r.name)).join(', ');
      console.log(`  ${(b.id ?? b.name).padEnd(28)} ${skillNames}`);
    });
    console.log(`\nInstall: npx @dan323/easier-life-skills --skill <name>`);
    console.log(`         npx @dan323/easier-life-skills --bundle <id>\n`);
    return;
  }

  // ── --search ──────────────────────────────────────────────────────────────
  if (searchTerm) {
    const matches = filterSkills(skills, searchTerm);

    if (matches.length === 0) {
      console.log(`\nNo skills match "${searchTerm}". Run --list to see everything available.\n`);
      return;
    }

    const label = `${matches.length} skill${matches.length === 1 ? '' : 's'} matching "${searchTerm}"`;
    console.log(`\n═══ ${label} ═══\n`);
    matches.forEach((s) => {
      const ro = s.readOnly ? ' [read-only]' : '';
      const src = `${s.source.owner}/${s.source.repo}`;
      console.log(`  ${s.name.padEnd(28)} ${s.description.slice(0, 45).padEnd(46)} ${src}${ro}`);
    });
    console.log(`\nInstall: npx @dan323/easier-life-skills --skill <name>\n`);
    return;
  }

  // ── --update ──────────────────────────────────────────────────────────────
  if (updateMode) {
    if (!(await claudeAvailable())) {
      console.error('\nError: `claude` is not on $PATH. Install Claude Code from https://claude.ai/code, then re-run.\n');
      process.exit(1);
    }

    const knownMarketplaces = computeKnownMarketplaces(skills, sources, LOCAL_MARKETPLACE);
    const installed = await listInstalledPlugins();
    const targets = filterForUpdate(installed, knownMarketplaces, updateTarget);

    if (updateTarget && targets.length === 0) {
      console.error(`\n"${updateTarget}" is not installed from any of the marketplaces this index knows about. Run --update with no name to update every installed plugin, or --list to see what's available.`);
      process.exit(1);
    }

    if (targets.length === 0) {
      console.log(`\nNo plugins installed from the marketplaces this index covers. Nothing to update.\n`);
      return;
    }

    console.log(`\nWill update ${targets.length} plugin${targets.length === 1 ? '' : 's'}:`);
    targets.forEach((p) => console.log(`  ${p.id.padEnd(40)} (currently ${p.version})`));
    console.log();

    if (!dryRun) {
      const ok = await confirm(`Update ${targets.length} plugin${targets.length === 1 ? '' : 's'}?`);
      if (!ok) { console.log('Cancelled.'); return; }
    }

    for (const p of targets) {
      const at = p.id.lastIndexOf('@');
      await pluginUpdate(p.id.slice(0, at), p.id.slice(at + 1), dryRun);
    }

    if (!dryRun) {
      console.log(`\nDone! Restart Claude Code to load the updated plugin${targets.length === 1 ? '' : 's'}.\n`);
    }
    return;
  }

  // ── --skill ───────────────────────────────────────────────────────────────
  if (skillName) {
    const skill = skills.find((s) => s.name === skillName);
    if (!skill) {
      console.error(`\nSkill "${skillName}" not found. Run --list to see available skills.`);
      process.exit(1);
    }

    const marketplaces = marketplacesForSkills([skill], sources);
    console.log(`\nWill register marketplace: ${marketplaces[0]}`);
    console.log(`Will install: ${describeTarget(skill, sources)}\n`);

    if (!dryRun) {
      const ok = await confirm('Install?');
      if (!ok) { console.log('Cancelled.'); return; }
    }

    try {
      await installSkillsRespectingSource([skill], sources, { dryRun });
    } catch (err) {
      console.error(`\nError: ${(err as Error).message}\n`);
      process.exit(1);
    }

    if (!dryRun) {
      console.log(`\nDone! Restart Claude Code to activate ${skill.name}.\n`);
    }
    return;
  }

  // ── --bundle ──────────────────────────────────────────────────────────────
  if (bundleId) {
    const bundle = bundles.find((b) => (b.id ?? b.name) === bundleId);
    if (!bundle) {
      console.error(`\nBundle "${bundleId}" not found. Available bundles:`);
      bundles.forEach((b) => console.error(`  ${b.id ?? b.name}`));
      process.exit(1);
    }

    const bundleSkills = resolveBundle(bundle, skills);
    if (bundleSkills.length === 0) {
      console.error(`\nBundle "${bundleId}" has no resolvable skills in the current index.\n`);
      process.exit(1);
    }

    console.log(`\nBundle: ${bundle.name}`);
    console.log(`${bundle.description}\n`);

    const marketplaces = marketplacesForSkills(bundleSkills, sources);
    console.log(`Will register ${marketplaces.length} marketplace${marketplaces.length === 1 ? '' : 's'}:`);
    marketplaces.forEach((m) => console.log(`  • ${m}`));
    console.log();

    console.log(`Will install ${bundleSkills.length} skill${bundleSkills.length === 1 ? '' : 's'}:`);
    bundleSkills.forEach((s) => {
      const src = `${s.source.owner}/${s.source.repo}`;
      console.log(`  • ${s.name.padEnd(36)} → ${describeTarget(s, sources).padEnd(60)} (${src})`);
    });
    console.log();

    if (!dryRun) {
      const ok = await confirm(`Install ${bundleSkills.length} plugin${bundleSkills.length === 1 ? '' : 's'}?`);
      if (!ok) { console.log('Cancelled.'); return; }
    }

    try {
      await installSkillsRespectingSource(bundleSkills, sources, { dryRun });
    } catch (err) {
      console.error(`\nError: ${(err as Error).message}\n`);
      process.exit(1);
    }

    if (!dryRun) {
      console.log(`\nDone! Restart Claude Code to activate the bundle.\n`);
    }
    return;
  }

  // ── No flag ───────────────────────────────────────────────────────────────
  console.log(`
easier-life-skills installer

Discovers skills from the easier-life-skills marketplace index and installs
them through Claude Code's plugin system — so \`claude plugin list\`,
\`claude plugin update\`, and \`claude plugin uninstall\` see everything we
put down. For source repos without a marketplace.json, the installer
generates a per-plugin shim marketplace under
\`~/.config/easier-life-skills/shims/<plugin>/\` and registers that with
Claude Code, then installs the plugin normally.

Requires:
  • \`claude\` on \$PATH for install / update operations

Usage:
  npx @dan323/easier-life-skills --list
  npx @dan323/easier-life-skills --search <query>
  npx @dan323/easier-life-skills --skill <name>
  npx @dan323/easier-life-skills --bundle <id>
  npx @dan323/easier-life-skills --update
  npx @dan323/easier-life-skills --update <name>
  npx @dan323/easier-life-skills --bundle <id> --dry-run
  npx @dan323/easier-life-skills --skill <name> --yes

Flags:
  --list            Show all available skills and bundles (no claude required)
  --search <query>  Filter skills by name, description, or keywords (no claude required)
  --skill <name>    Install a single skill via the right path for its source
  --bundle <id>     Install every skill in a bundle, routed by source
  --update [name]   Update installed plugins from any of the indexed marketplaces
  --dry-run         Print what would happen, don't execute
  --yes             Skip confirmation prompt
`);
})();
