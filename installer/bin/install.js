#!/usr/bin/env node
// @dan323/easier-life-skills CLI installer
// Usage: npx @dan323/easier-life-skills --skill changelog
//        npx @dan323/easier-life-skills --bundle backend-developer
//        npx @dan323/easier-life-skills --list

import { createWriteStream, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';

const INDEX_URL = 'https://raw.githubusercontent.com/dan323/easier-life-skills/master/skills_index.json';
const INSTALL_BASE = join(homedir(), '.claude', 'plugins', 'easier-life-skills');

// ── CLI args ──
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const flagVal = (name) => { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : null; };

const skillName  = flagVal('--skill');
const bundleId   = flagVal('--bundle');
const listOnly   = flag('--list');
const dryRun     = flag('--dry-run');
const yes        = flag('--yes');

// ── Fetch helpers (Node 18+ built-in fetch) ──
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

// ── Prompt helper ──
async function confirm(message) {
  if (yes) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`${message} [y/N] `, ans => {
      rl.close();
      resolve(ans.trim().toLowerCase() === 'y');
    });
  });
}

// ── Install a single skill ──
async function installSkill(skill, dry) {
  const pluginDir = join(INSTALL_BASE, skill.name, 'skills', skill.name);
  const manifestDir = join(INSTALL_BASE, skill.name, '.claude-plugin');
  const skillFile = join(pluginDir, 'SKILL.md');
  const manifestFile = join(manifestDir, 'plugin.json');

  if (dry) {
    console.log(`  [dry-run] would write → ${skillFile}`);
    return;
  }

  mkdirSync(pluginDir, { recursive: true });
  mkdirSync(manifestDir, { recursive: true });

  const skillContent = await fetchText(skill.rawSkillUrl);
  writeFileSync(skillFile, skillContent, 'utf8');

  const manifest = {
    name: skill.name,
    version: skill.version,
    description: skill.description,
  };
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log(`  ✓ ${skill.name}`);
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

  // ── --list ──
  if (listOnly) {
    console.log(`\n═══ easier-life-skills (${meta.skillCount} skills) ═══\n`);
    console.log('SKILLS\n');
    skills.forEach(s => {
      const ro = s.readOnly ? ' [read-only]' : '';
      console.log(`  ${s.name.padEnd(28)} ${s.description.slice(0, 55)}…${ro}`);
    });
    console.log('\nBUNDLES\n');
    bundles.forEach(b => {
      console.log(`  ${b.id.padEnd(28)} ${b.skills.join(', ')}`);
    });
    console.log(`\nInstall: npx @dan323/easier-life-skills --skill <name>`);
    console.log(`         npx @dan323/easier-life-skills --bundle <id>\n`);
    return;
  }

  // ── --skill ──
  if (skillName) {
    const skill = skills.find(s => s.name === skillName);
    if (!skill) {
      console.error(`\nSkill "${skillName}" not found. Run --list to see available skills.`);
      process.exit(1);
    }

    console.log(`\nWill install: ${skill.name}`);
    console.log(`  → ${join(INSTALL_BASE, skill.name)}\n`);

    if (!dryRun) {
      const ok = await confirm('Install?');
      if (!ok) { console.log('Cancelled.'); return; }
    }

    await installSkill(skill, dryRun);
    if (!dryRun) {
      console.log(`\nDone! Reload Claude Code and run:`);
      console.log(`  ${skill.installCommand}\n`);
    }
    return;
  }

  // ── --bundle ──
  if (bundleId) {
    const bundle = bundles.find(b => b.id === bundleId);
    if (!bundle) {
      console.error(`\nBundle "${bundleId}" not found. Available bundles:`);
      bundles.forEach(b => console.error(`  ${b.id}`));
      process.exit(1);
    }

    const bundleSkills = bundle.skills
      .map(name => skills.find(s => s.name === name))
      .filter(Boolean);

    console.log(`\nBundle: ${bundle.name}`);
    console.log(`${bundle.description}\n`);
    bundleSkills.forEach(s => console.log(`  • ${s.name}`));
    console.log(`\nTarget: ${INSTALL_BASE}\n`);

    if (!dryRun) {
      const ok = await confirm(`Install ${bundleSkills.length} skills?`);
      if (!ok) { console.log('Cancelled.'); return; }
    }

    for (const skill of bundleSkills) {
      await installSkill(skill, dryRun);
    }

    if (!dryRun) {
      console.log(`\nDone! Reload Claude Code and run:`);
      bundle.skills.forEach(name => console.log(`  /plugin install ${name}@${meta.repo}`));
      console.log();
    }
    return;
  }

  // ── No flag ──
  console.log(`
easier-life-skills installer

Usage:
  npx @dan323/easier-life-skills --list
  npx @dan323/easier-life-skills --skill <name>
  npx @dan323/easier-life-skills --bundle <id>
  npx @dan323/easier-life-skills --bundle <id> --dry-run
  npx @dan323/easier-life-skills --skill <name> --yes

Flags:
  --list          Show all available skills and bundles
  --skill <name>  Install a single skill
  --bundle <id>   Install all skills in a bundle
  --dry-run       Preview what would be installed without writing files
  --yes           Skip confirmation prompt
`);
})();
