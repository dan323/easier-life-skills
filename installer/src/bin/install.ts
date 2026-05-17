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
//  • For sources whose repo carries `.claude-plugin/marketplace.json`,
//    we register the upstream repo via `claude plugin marketplace add <owner>/<repo>`
//    and install the plugin from it.
//  • For sources whose repo is plugin-only (no marketplace.json — e.g.
//    `mattpocock/skills`), we synthesise a per-plugin shim marketplace.json
//    under `~/.config/easier-life-skills/shims/<plugin>/.claude-plugin/`,
//    register that local path as a marketplace named after the plugin, and
//    `claude plugin install <plugin>@<plugin>`. Claude Code resolves the
//    `source: { source: "url", url: "https://github.com/<owner>/<repo>" }`
//    entry and fetches the upstream plugin itself.
//
// Plugins are the unit of installation (`--plugin <name>`); skills, hooks,
// agents, commands, and MCP servers are entities the plugin ships. The
// `--skill <name>` flag is a discovery shortcut that resolves to its parent
// plugin and installs that.

import { createInterface } from 'readline';
import {
  resolveBundle, describeTarget,
  computeKnownMarketplaces, filterForUpdate, marketplacesForItems,
  searchAll, resolveInstallTarget,
} from '../lib/logic.js';
import { claudeAvailable, listInstalledPlugins, pluginUpdate } from '../lib/claude.js';
import { installItemsRespectingSource } from '../lib/actions.js';
import type { Index, Plugin } from '../lib/types.js';

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

const installName = flagVal('--install');
const pluginName = flagVal('--plugin');
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

// Short, comma-joined list of entity names the plugin ships, capped to
// keep `--list` rows narrow.
function entitySummary(p: Plugin): string {
  const parts: string[] = [];
  if (p.skills?.length) parts.push(`${p.skills.length} skill${p.skills.length === 1 ? '' : 's'}`);
  if (p.agents?.length) parts.push(`${p.agents.length} agent${p.agents.length === 1 ? '' : 's'}`);
  if (p.hooks?.length) parts.push(`${p.hooks.length} hook${p.hooks.length === 1 ? '' : 's'}`);
  if (p.commands?.length) parts.push(`${p.commands.length} command${p.commands.length === 1 ? '' : 's'}`);
  if (p.mcpServers?.length) parts.push(`${p.mcpServers.length} MCP`);
  return parts.length ? parts.join(', ') : '—';
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
  const plugins = index.plugins ?? [];
  const agents = index.agents ?? [];
  const hooks = index.hooks ?? [];
  const commands = index.commands ?? [];
  const mcpServers = index.mcpServers ?? [];
  const sources = meta?.sources ?? {};

  // ── --list ────────────────────────────────────────────────────────────────
  if (listOnly) {
    const counts = [
      `${plugins.length} plugins`,
      `${skills.length} skills`,
      agents.length ? `${agents.length} agents` : null,
      hooks.length ? `${hooks.length} hooks` : null,
      commands.length ? `${commands.length} commands` : null,
      mcpServers.length ? `${mcpServers.length} MCP servers` : null,
    ].filter(Boolean).join(', ');
    console.log(`\n═══ easier-life-skills (${counts}; ${meta.marketplaces?.length ?? 1} marketplace(s)) ═══\n`);

    if (plugins.length) {
      console.log('PLUGINS\n');
      plugins.forEach((p) => {
        const src = `${p.source.owner}/${p.source.repo}`;
        console.log(`  ${p.name.padEnd(28)} ${entitySummary(p).padEnd(28)} ${(p.category ?? '').padEnd(14)} ${src}`);
      });
      console.log();
    }

    console.log('SKILLS\n');
    skills.forEach((s) => {
      const ro = s.readOnly ? ' [read-only]' : '';
      const src = `${s.source.owner}/${s.source.repo}`;
      console.log(`  ${s.name.padEnd(28)} ${s.description.slice(0, 45).padEnd(46)} ${src}${ro}`);
    });

    const printEntities = (label: string, list: Array<{ name: string; pluginName: string; description?: string; source: { owner: string; repo: string } }>) => {
      if (!list.length) return;
      console.log(`\n${label}\n`);
      list.forEach((e) => {
        const src = `${e.source.owner}/${e.source.repo}`;
        const desc = (e.description ?? '').slice(0, 45).padEnd(46);
        console.log(`  ${e.name.padEnd(28)} ${desc} ${`(plugin: ${e.pluginName})`.padEnd(34)} ${src}`);
      });
    };
    printEntities('AGENTS', agents);
    printEntities('HOOKS', hooks);
    printEntities('COMMANDS', commands);
    printEntities('MCP SERVERS', mcpServers);

    console.log('\nBUNDLES\n');
    bundles.forEach((b) => {
      const skillNames = b.skills.map((r) => (typeof r === 'string' ? r : r.name)).join(', ');
      console.log(`  ${(b.id ?? b.name).padEnd(28)} ${skillNames}`);
    });
    console.log(`\nInstall: npx @dan323/easier-life-skills --install <name>   (plugin or any entity name; routes to plugin)`);
    console.log(`         npx @dan323/easier-life-skills --plugin <name>    (explicit plugin)`);
    console.log(`         npx @dan323/easier-life-skills --bundle <id>\n`);
    return;
  }

  // ── --search ──────────────────────────────────────────────────────────────
  if (searchTerm) {
    const results = searchAll(index, searchTerm);
    const total = results.plugins.length + results.skills.length
      + results.agents.length + results.hooks.length
      + results.commands.length + results.mcpServers.length;

    if (total === 0) {
      console.log(`\nNo plugins, skills, agents, hooks, commands, or MCP servers match "${searchTerm}". Run --list to see everything available.\n`);
      return;
    }

    console.log(`\n═══ matches for "${searchTerm}" ═══\n`);

    if (results.plugins.length) {
      console.log(`PLUGINS (${results.plugins.length})\n`);
      results.plugins.forEach((p) => {
        const src = `${p.source.owner}/${p.source.repo}`;
        console.log(`  ${p.name.padEnd(28)} ${entitySummary(p).padEnd(28)} ${(p.category ?? '').padEnd(14)} ${src}`);
      });
      console.log();
    }

    if (results.skills.length) {
      console.log(`SKILLS (${results.skills.length})\n`);
      results.skills.forEach((s) => {
        const ro = s.readOnly ? ' [read-only]' : '';
        const src = `${s.source.owner}/${s.source.repo}`;
        console.log(`  ${s.name.padEnd(28)} ${(s.description ?? '').slice(0, 45).padEnd(46)} ${`(plugin: ${s.pluginName})`.padEnd(34)} ${src}${ro}`);
      });
      console.log();
    }

    const printMatches = (label: string, list: Array<{ name: string; pluginName: string; description?: string; source: { owner: string; repo: string } }>) => {
      if (!list.length) return;
      console.log(`${label} (${list.length})\n`);
      list.forEach((e) => {
        const src = `${e.source.owner}/${e.source.repo}`;
        const desc = (e.description ?? '').slice(0, 45).padEnd(46);
        console.log(`  ${e.name.padEnd(28)} ${desc} ${`(plugin: ${e.pluginName})`.padEnd(34)} ${src}`);
      });
      console.log();
    };
    printMatches('AGENTS', results.agents);
    printMatches('HOOKS', results.hooks);
    printMatches('COMMANDS', results.commands);
    printMatches('MCP SERVERS', results.mcpServers);

    console.log(`Install (any entity name routes to its parent plugin):`);
    console.log(`  npx @dan323/easier-life-skills --install <name>\n`);
    return;
  }

  // ── --update ──────────────────────────────────────────────────────────────
  if (updateMode) {
    if (!(await claudeAvailable())) {
      console.error('\nError: `claude` is not on $PATH. Install Claude Code from https://claude.ai/code, then re-run.\n');
      process.exit(1);
    }

    const knownMarketplaces = computeKnownMarketplaces(
      [...plugins, ...skills],
      sources,
      LOCAL_MARKETPLACE,
    );
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

  // ── --install ─────────────────────────────────────────────────────────────
  // Accepts a plugin name OR any entity name (skill / agent / hook / command /
  // mcp). Routes to the parent plugin; errors with a disambiguation list if
  // the same entity name appears across multiple plugins.
  if (installName) {
    const resolved = resolveInstallTarget(installName, index);
    if (!resolved) {
      console.error(`\n"${installName}" is not a plugin or any indexed entity. Run --search ${installName} or --list.\n`);
      process.exit(1);
    }
    if ('candidates' in resolved) {
      console.error(`\n"${installName}" is ambiguous — multiple plugins ship something by that name:`);
      resolved.candidates.forEach((c) => {
        console.error(`  • plugin "${c.pluginName}" (${c.source.owner}/${c.source.repo}) — via ${c.via}`);
      });
      console.error(`\nDisambiguate with --plugin <pluginName>.\n`);
      process.exit(1);
    }

    const plugin: Plugin = resolved.plugin;
    const marketplaces = marketplacesForItems([plugin], sources);
    console.log(`\nWill register marketplace: ${marketplaces[0]}`);
    console.log(`Will install: ${describeTarget(plugin, sources)}`);
    const summary = entitySummary(plugin);
    if (summary !== '—') console.log(`Provides: ${summary}`);
    console.log();

    if (!dryRun) {
      const ok = await confirm('Install?');
      if (!ok) { console.log('Cancelled.'); return; }
    }

    try {
      await installItemsRespectingSource([plugin], sources, { dryRun });
    } catch (err) {
      console.error(`\nError: ${(err as Error).message}\n`);
      process.exit(1);
    }

    if (!dryRun) {
      console.log(`\nDone! Restart Claude Code to activate ${plugin.name}.\n`);
    }
    return;
  }

  // ── --plugin ──────────────────────────────────────────────────────────────
  if (pluginName) {
    const plugin = plugins.find((p) => p.name === pluginName);
    if (!plugin) {
      console.error(`\nPlugin "${pluginName}" not found. Run --list to see available plugins.`);
      process.exit(1);
    }

    const marketplaces = marketplacesForItems([plugin], sources);
    console.log(`\nWill register marketplace: ${marketplaces[0]}`);
    console.log(`Will install: ${describeTarget(plugin, sources)}`);
    const summary = entitySummary(plugin);
    if (summary !== '—') console.log(`Provides: ${summary}`);
    console.log();

    if (!dryRun) {
      const ok = await confirm('Install?');
      if (!ok) { console.log('Cancelled.'); return; }
    }

    try {
      await installItemsRespectingSource([plugin], sources, { dryRun });
    } catch (err) {
      console.error(`\nError: ${(err as Error).message}\n`);
      process.exit(1);
    }

    if (!dryRun) {
      console.log(`\nDone! Restart Claude Code to activate ${plugin.name}.\n`);
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

    const marketplaces = marketplacesForItems([skill], sources);
    console.log(`\nWill register marketplace: ${marketplaces[0]}`);
    console.log(`Will install: ${describeTarget(skill, sources)}\n`);

    if (!dryRun) {
      const ok = await confirm('Install?');
      if (!ok) { console.log('Cancelled.'); return; }
    }

    try {
      await installItemsRespectingSource([skill], sources, { dryRun });
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

    const marketplaces = marketplacesForItems(bundleSkills, sources);
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
      await installItemsRespectingSource(bundleSkills, sources, { dryRun });
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

Discovers plugins from the easier-life-skills marketplace index and installs
them through Claude Code's plugin system — so \`claude plugin list\`,
\`claude plugin update\`, and \`claude plugin uninstall\` see everything we
put down. For source repos without a marketplace.json, the installer
generates a per-plugin shim marketplace under
\`~/.config/easier-life-skills/shims/<plugin>/\` and registers that with
Claude Code, then installs the plugin normally.

Plugins are the unit of installation. Skills, agents, hooks, commands, and
MCP servers are entities a plugin ships. Use \`--install <name>\` and name
either a plugin or any entity — the installer figures out the right plugin.

Requires:
  • \`claude\` on \$PATH for install / update operations

Usage:
  npx @dan323/easier-life-skills --list
  npx @dan323/easier-life-skills --search <query>
  npx @dan323/easier-life-skills --install <name>
  npx @dan323/easier-life-skills --plugin <name>
  npx @dan323/easier-life-skills --skill <name>
  npx @dan323/easier-life-skills --bundle <id>
  npx @dan323/easier-life-skills --update
  npx @dan323/easier-life-skills --update <name>
  npx @dan323/easier-life-skills --install <name> --dry-run
  npx @dan323/easier-life-skills --install <name> --yes

Flags:
  --list            Show all plugins, skills, agents, hooks, commands, MCP servers, bundles (no claude required)
  --search <query>  Filter every kind of entity by name / description / category (no claude required)
  --install <name>  Install by plugin name or any entity name (resolves to parent plugin; errors on ambiguity)
  --plugin <name>   Explicit plugin install (errors if name is not a plugin)
  --skill <name>    Explicit skill resolution — installs the plugin that ships this skill
  --bundle <id>     Install every plugin referenced by a bundle, routed by source
  --update [name]   Update installed plugins from any of the indexed marketplaces
  --dry-run         Print what would happen, don't execute
  --yes             Skip confirmation prompt
`);
})();
