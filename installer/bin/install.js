#!/usr/bin/env node
// @dan323/easier-life-skills CLI installer
//
// Discovery uses the marketplace index at
//   https://raw.githubusercontent.com/dan323/easier-life-skills/master/skills_index.json
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

import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const INDEX_URL = process.env.EASIER_LIFE_SKILLS_INDEX_URL
  || 'https://raw.githubusercontent.com/dan323/easier-life-skills/master/skills_index.json';
const LOCAL_MARKETPLACE = 'easier-life-skills';   // primary marketplace name (for --list header)

const XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
const SHIMS_ROOT = join(XDG_CONFIG_HOME, 'easier-life-skills', 'shims');

// ── CLI args ──
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const flagVal = (name) => { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : null; };

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

// ── Subprocess wrappers ──
function runCmd(cmd, cmdArgs, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, {
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });
    }
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`\`${cmd} ${cmdArgs.join(' ')}\` exited ${code}${stderr ? '\n' + stderr.trim() : ''}`));
    });
  });
}

function runClaude(claudeArgs, opts = {}) {
  return runCmd('claude', claudeArgs, opts).catch((err) => {
    if (err.code === 'ENOENT') {
      throw new Error('`claude` is not on $PATH. Install Claude Code from https://claude.ai/code, then re-run.');
    }
    throw err;
  });
}

async function claudeAvailable() {
  try { await runClaude(['--version'], { capture: true }); return true; }
  catch { return false; }
}

// ── Claude marketplace helpers ──
async function getRegisteredMarketplaces() {
  try {
    const { stdout } = await runClaude(['plugin', 'marketplace', 'list', '--json'], { capture: true });
    const arr = JSON.parse(stdout);
    return new Set(arr.map((m) => m.name));
  } catch {
    return new Set();
  }
}

async function ensureMarketplaceRegistered(name, source, registered) {
  if (registered.has(name)) return;
  if (dryRun) {
    console.log(`  [dry-run] would run: claude plugin marketplace add ${source}`);
    registered.add(name);
    return;
  }
  console.log(`Adding marketplace ${source}…`);
  await runClaude(['plugin', 'marketplace', 'add', source]);
  registered.add(name);
}

async function installPlugin(pluginName, marketplaceName, installedThisRun) {
  const target = `${pluginName}@${marketplaceName}`;
  if (installedThisRun.has(target)) return;     // de-dupe across a bundle
  installedThisRun.add(target);
  if (dryRun) {
    console.log(`  [dry-run] would run: claude plugin install ${target}`);
    return;
  }
  console.log(`Installing ${target}…`);
  await runClaude(['plugin', 'install', target]);
}

async function pluginUpdate(pluginName, marketplaceName) {
  const target = `${pluginName}@${marketplaceName}`;
  if (dryRun) {
    console.log(`  [dry-run] would run: claude plugin update ${target}`);
    return;
  }
  console.log(`Updating ${target}…`);
  await runClaude(['plugin', 'update', target]);
}

// ── Synthetic marketplace shim for plugin-only repos ──
// We write `<SHIMS_ROOT>/<plugin>/.claude-plugin/marketplace.json` whose single
// plugin entry pulls from the upstream URL via Claude Code's `source: url`
// resolver. Once `claude plugin marketplace add <shim-dir>` is run, the install
// goes through the regular cache/registry — same path as any other plugin.
function shimDirFor(pluginName) {
  return join(SHIMS_ROOT, pluginName);
}

function writeShim(skill, written) {
  const dir = shimDirFor(skill.pluginName);
  if (written.has(skill.pluginName)) return dir;
  written.add(skill.pluginName);

  const file = join(dir, '.claude-plugin', 'marketplace.json');
  const content = JSON.stringify({
    name: skill.pluginName,
    owner: { name: skill.source.owner },
    description: `Synthetic marketplace shim for ${skill.source.owner}/${skill.source.repo} (plugin-only repo) — generated by @dan323/easier-life-skills`,
    plugins: [
      {
        name: skill.pluginName,
        description: `${skill.source.owner}/${skill.source.repo} (auto-shimmed)`,
        source: {
          source: 'url',
          url: skill.source.repoUrl,
        },
      },
    ],
  }, null, 2) + '\n';

  if (dryRun) {
    console.log(`  [dry-run] would write shim ${file}`);
    return dir;
  }

  mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
  // Only overwrite if the content changed — preserves mtime when the user
  // re-runs the same bundle (avoids surprise diffs on disk).
  const prev = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (prev !== content) writeFileSync(file, content);
  return dir;
}

// ── Fetch helpers (Node 18+ built-in fetch) ──
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

// ── Prompt helper ──
async function confirm(message) {
  if (yes) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (ans) => {
      rl.close();
      resolve(ans.trim().toLowerCase() === 'y');
    });
  });
}

// ── Per-skill install routing ──
function isMarketplaceSource(skill, sources) {
  const key = `${skill.source.owner}/${skill.source.repo}`;
  // Default to true for backwards-compat with older index files that don't carry meta.sources.
  return sources[key]?.isMarketplace !== false;
}

function describeTarget(skill, sources) {
  if (isMarketplaceSource(skill, sources)) return `${skill.pluginName}@${skill.source.repo}`;
  return `${skill.pluginName}@${skill.pluginName} (shim → ${skill.source.repoUrl})`;
}

async function installSkillsRespectingSource(skillsList, sources) {
  if (!(await claudeAvailable())) {
    throw new Error('`claude` is not on $PATH. Install Claude Code from https://claude.ai/code, then re-run.');
  }

  const registered = await getRegisteredMarketplaces();
  const installedThisRun = new Set();
  const shimsWritten = new Set();

  for (const skill of skillsList) {
    if (isMarketplaceSource(skill, sources)) {
      const repoSlug = `${skill.source.owner}/${skill.source.repo}`;
      await ensureMarketplaceRegistered(skill.source.repo, repoSlug, registered);
      await installPlugin(skill.pluginName, skill.source.repo, installedThisRun);
    } else {
      // Plugin-only repo → synthetic shim marketplace named after the plugin.
      const shimDir = writeShim(skill, shimsWritten);
      await ensureMarketplaceRegistered(skill.pluginName, shimDir, registered);
      await installPlugin(skill.pluginName, skill.pluginName, installedThisRun);
    }
  }
}

// ── Main ──
(async () => {
  let index;
  try {
    process.stdout.write('Fetching skill index… ');
    index = await fetchJson(INDEX_URL);
    console.log('done');
  } catch (err) {
    console.error(`\nFailed to fetch index: ${err.message}`);
    process.exit(1);
  }

  const { skills, bundles, meta } = index;
  const sources = meta?.sources ?? {};

  // ── --list ──
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
      console.log(`  ${(b.id ?? b.name).padEnd(28)} ${b.skills.join(', ')}`);
    });
    console.log(`\nInstall: npx @dan323/easier-life-skills --skill <name>`);
    console.log(`         npx @dan323/easier-life-skills --bundle <id>\n`);
    return;
  }

  // ── --search ──
  if (searchTerm) {
    const q = searchTerm.toLowerCase();
    const matches = skills.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q) ||
      (s.keywords || []).some((k) => String(k).toLowerCase().includes(q))
    );

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

  // ── --update ──
  // Updates every plugin whose marketplace is one of those this index knows
  // about, including the synthetic shim marketplaces (one per plugin-only-repo
  // plugin) we register on install.
  if (updateMode) {
    if (!(await claudeAvailable())) {
      console.error('\nError: `claude` is not on $PATH. Install Claude Code from https://claude.ai/code, then re-run.\n');
      process.exit(1);
    }

    const knownMarketplaces = new Set();
    // Real upstream marketplaces
    for (const [k, v] of Object.entries(sources)) {
      if (v?.isMarketplace !== false) knownMarketplaces.add(k.split('/').pop());
    }
    // Shim marketplaces — one per distinct pluginName among plugin-only-source skills
    for (const s of skills) {
      if (sources[`${s.source.owner}/${s.source.repo}`]?.isMarketplace === false) {
        knownMarketplaces.add(s.pluginName);
      }
    }
    // Always include the primary marketplace name as a hard fallback
    knownMarketplaces.add(LOCAL_MARKETPLACE);

    const { stdout } = await runClaude(['plugin', 'list', '--json'], { capture: true });
    let installed;
    try { installed = JSON.parse(stdout); } catch { installed = []; }

    let targets = installed.filter((p) => {
      const at = typeof p.id === 'string' ? p.id.lastIndexOf('@') : -1;
      if (at === -1) return false;
      const mp = p.id.slice(at + 1);
      return knownMarketplaces.has(mp);
    });

    if (updateTarget) {
      targets = targets.filter((p) => {
        const at = p.id.lastIndexOf('@');
        return p.id.slice(0, at) === updateTarget;
      });
      if (targets.length === 0) {
        console.error(`\n"${updateTarget}" is not installed from any of the marketplaces this index knows about. Run --update with no name to update every installed plugin, or --list to see what's available.`);
        process.exit(1);
      }
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
      const pluginName = p.id.slice(0, at);
      const mp = p.id.slice(at + 1);
      await pluginUpdate(pluginName, mp);
    }

    if (!dryRun) {
      console.log(`\nDone! Restart Claude Code to load the updated plugin${targets.length === 1 ? '' : 's'}.\n`);
    }
    return;
  }

  // ── --skill ──
  if (skillName) {
    const skill = skills.find((s) => s.name === skillName);
    if (!skill) {
      console.error(`\nSkill "${skillName}" not found. Run --list to see available skills.`);
      process.exit(1);
    }

    console.log(`\nWill install: ${describeTarget(skill, sources)}\n`);

    if (!dryRun) {
      const ok = await confirm('Install?');
      if (!ok) { console.log('Cancelled.'); return; }
    }

    try {
      await installSkillsRespectingSource([skill], sources);
    } catch (err) {
      console.error(`\nError: ${err.message}\n`);
      process.exit(1);
    }

    if (!dryRun) {
      console.log(`\nDone! Restart Claude Code to activate ${skill.name}.\n`);
    }
    return;
  }

  // ── --bundle ──
  if (bundleId) {
    const bundle = bundles.find((b) => (b.id ?? b.name) === bundleId);
    if (!bundle) {
      console.error(`\nBundle "${bundleId}" not found. Available bundles:`);
      bundles.forEach((b) => console.error(`  ${b.id ?? b.name}`));
      process.exit(1);
    }

    const bundleSkills = bundle.skills
      .map((name) => skills.find((s) => s.name === name))
      .filter(Boolean);
    if (bundleSkills.length === 0) {
      console.error(`\nBundle "${bundleId}" has no resolvable skills in the current index.\n`);
      process.exit(1);
    }

    console.log(`\nBundle: ${bundle.name}`);
    console.log(`${bundle.description}\n`);
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
      await installSkillsRespectingSource(bundleSkills, sources);
    } catch (err) {
      console.error(`\nError: ${err.message}\n`);
      process.exit(1);
    }

    if (!dryRun) {
      console.log(`\nDone! Restart Claude Code to activate the bundle.\n`);
    }
    return;
  }

  // ── No flag ──
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
