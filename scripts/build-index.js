#!/usr/bin/env node
// scripts/build-index.js
// Generates skills_index.json and CATALOG.md from marketplace.json + SKILL.md files.
// Run: node scripts/build-index.js

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const OWNER = 'dan323';
const REPO = 'easier-life-skills';
const BASE_URL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/master`;
const REPO_URL = `https://github.com/${OWNER}/${REPO}`;

const EXTERNAL_MARKETPLACES = [
  {
    owner: 'anthropics',
    repo: 'skills',
    catalogUrl: 'https://raw.githubusercontent.com/anthropics/skills/master/.claude-plugin/marketplace.json',
  },
];

// --- Bundles definition ---
const BUNDLES = [
  {
    id: 'backend-developer',
    name: 'Backend Developer',
    description: 'API compatibility, code hygiene, observability, and release docs',
    skills: ['find-breaking-rest-api', 'find-dead-code', 'improve-logging', 'changelog'],
  },
  {
    id: 'open-source-maintainer',
    name: 'Open Source Maintainer',
    description: 'Docs, release notes, roadmap decisions, and skill discovery',
    skills: ['changelog', 'document-project', 'brainstorm', 'find-skills'],
  },
  {
    id: 'code-quality',
    name: 'Code Quality Reviewer',
    description: 'Read-only analysis skills for code review and CI gating',
    skills: ['find-dead-code', 'improve-logging', 'find-breaking-rest-api'],
  },
  {
    id: 'full-stack',
    name: 'Full Stack',
    description: 'All skills — for solo developers and small teams',
    skills: ['brainstorm', 'changelog', 'document-project', 'find-breaking-rest-api',
             'find-dead-code', 'find-skills', 'improve-logging', 'task-agent'],
  },
];

// --- YAML frontmatter parser (handles the subset used in SKILL.md files) ---
function parseFrontmatter(content) {
  // Normalize line endings
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const raw = match[1];
  const result = {};

  // Split into lines for key-by-key parsing
  const lines = raw.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Top-level key: value
    const keyMatch = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (!keyMatch) { i++; continue; }

    const key = keyMatch[1];
    const val = keyMatch[2].trim();

    if (val === '>') {
      // Folded block — collect indented continuation lines
      i++;
      const parts = [];
      while (i < lines.length && (lines[i].startsWith(' ') || lines[i].startsWith('\t'))) {
        parts.push(lines[i].trim());
        i++;
      }
      result[key] = parts.join(' ');
    } else if (val === '') {
      // Mapping block (e.g. metadata:) — collect indented children
      i++;
      const children = {};
      while (i < lines.length && (lines[i].startsWith(' ') || lines[i].startsWith('\t'))) {
        const childMatch = lines[i].match(/^\s+(\w[\w-]*):\s*(.*)/);
        if (childMatch) children[childMatch[1]] = childMatch[2].trim();
        i++;
      }
      result[key] = children;
    } else {
      result[key] = val;
      i++;
    }
  }

  // Normalise tools to array
  if (typeof result.tools === 'string') {
    result.tools = result.tools.split(',').map(t => t.trim()).filter(Boolean);
  }

  // Flatten metadata.version
  if (result.metadata && result.metadata.version) {
    result.version = String(result.metadata.version);
  }

  return result;
}

// --- Main ---
const marketplace = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));

const overridesPath = join(ROOT, '.claude-plugin', 'external-overrides.json');
const externalOverrides = existsSync(overridesPath)
  ? JSON.parse(readFileSync(overridesPath, 'utf8'))
  : {};

// Build a map of which bundles each skill belongs to
const skillBundleMap = {};
for (const bundle of BUNDLES) {
  for (const skillName of bundle.skills) {
    if (!skillBundleMap[skillName]) skillBundleMap[skillName] = [];
    skillBundleMap[skillName].push(bundle.id);
  }
}

const skills = [];

for (const plugin of marketplace.plugins) {
  const skillPath = `plugins/${plugin.name}/skills/${plugin.name}/SKILL.md`;
  const fullPath = join(ROOT, skillPath);

  let frontmatter = {};
  let readOnly = false;

  if (existsSync(fullPath)) {
    const content = readFileSync(fullPath, 'utf8');
    frontmatter = parseFrontmatter(content);
    readOnly = content.includes('This skill is read-only');
  } else {
    console.warn(`  [warn] SKILL.md not found for ${plugin.name}, using marketplace.json data only`);
  }

  skills.push({
    name: plugin.name,
    version: frontmatter.version || '1.0',
    description: plugin.description,
    category: plugin.category,
    keywords: plugin.keywords || [],
    tools: frontmatter.tools || [],
    readOnly,
    skillPath,
    rawSkillUrl: `${BASE_URL}/${skillPath}`,
    installCommand: `/plugin install ${plugin.name}@${REPO}`,
    marketplace: { owner: OWNER, repo: REPO },
    bundles: skillBundleMap[plugin.name] || [],
  });
}

// Fetch external marketplace catalogs
for (const ext of EXTERNAL_MARKETPLACES) {
  console.log(`  Fetching ${ext.owner}/${ext.repo}…`);
  try {
    const res = await fetch(ext.catalogUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const extMarketplace = await res.json();
    const extBase = `https://raw.githubusercontent.com/${ext.owner}/${ext.repo}/master`;

    const marketplaceKey = `${ext.owner}/${ext.repo}`;
    const overrides = externalOverrides[marketplaceKey] || {};

    for (const plugin of (extMarketplace.plugins || [])) {
      const subPaths = plugin.skills && plugin.skills.length > 0
        ? plugin.skills
        : null;

      if (subPaths) {
        // Expand each sub-skill in parallel
        const subEntries = await Promise.all(subPaths.map(async (subPath) => {
          const normalizedPath = subPath.replace(/^\.\//, '');
          const skillMdUrl = `${extBase}/${normalizedPath}/SKILL.md`;

          let frontmatter = {};
          try {
            const r = await fetch(skillMdUrl);
            if (r.ok) frontmatter = parseFrontmatter(await r.text());
          } catch { /* skip */ }

          const skillName = frontmatter.name || normalizedPath.split('/').pop();
          const override = overrides[skillName] || {};

          return {
            name: skillName,
            version: '1.0',
            description: frontmatter.description || plugin.description,
            category: override.category || plugin.category || 'uncategorized',
            keywords: override.keywords || plugin.keywords || [],
            tools: frontmatter.tools || [],
            readOnly: override.readOnly ?? frontmatter.readOnly ?? false,
            skillPath: `${normalizedPath}/SKILL.md`,
            rawSkillUrl: skillMdUrl,
            installCommand: `/plugin install ${skillName}@${ext.repo}`,
            marketplace: { owner: ext.owner, repo: ext.repo },
            bundles: [],
            ...override,
            name: skillName,
            marketplace: { owner: ext.owner, repo: ext.repo },
            bundles: [],
          };
        }));
        skills.push(...subEntries);
      } else {
        // Single-skill plugin (no sub-skills array)
        const override = overrides[plugin.name] || {};
        const skillPath = `plugins/${plugin.name}/skills/${plugin.name}/SKILL.md`;
        skills.push({
          name: plugin.name,
          version: plugin.version || plugin.metadata?.version || '1.0',
          description: plugin.description,
          category: override.category || plugin.category || 'uncategorized',
          keywords: override.keywords || plugin.keywords || [],
          tools: [],
          readOnly: override.readOnly ?? false,
          skillPath,
          rawSkillUrl: `${extBase}/${skillPath}`,
          installCommand: `/plugin install ${plugin.name}@${ext.repo}`,
          marketplace: { owner: ext.owner, repo: ext.repo },
          bundles: [],
          ...override,
          name: plugin.name,
          marketplace: { owner: ext.owner, repo: ext.repo },
          bundles: [],
        });
      }
    }
    console.log(`✓ ${ext.owner}/${ext.repo} — ${extMarketplace.plugins?.length ?? 0} skills`);
  } catch (err) {
    console.warn(`  [warn] Could not fetch ${ext.owner}/${ext.repo}: ${err.message}`);
  }
}

// Sort skills by category then name
skills.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

const index = {
  meta: {
    generated: new Date().toISOString(),
    owner: OWNER,
    repo: REPO,
    repoUrl: REPO_URL,
    skillCount: skills.length,
    baseUrl: BASE_URL,
  },
  skills,
  bundles: BUNDLES,
};

writeFileSync(join(ROOT, 'skills_index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`✓ skills_index.json — ${skills.length} skills`);

// --- Generate CATALOG.md ---
const categories = [...new Set(skills.map(s => s.category))].sort();

const lines = [
  `# easier-life-skills — Skill Catalog`,
  ``,
  `> ${skills.length} skills · Last updated: ${new Date().toISOString().slice(0, 10)}`,
  ``,
  `Install the marketplace: \`/plugin marketplace add ${OWNER}/${REPO}\``,
  ``,
  `---`,
  ``,
  `## By Category`,
  ``,
];

for (const category of categories) {
  const group = skills.filter(s => s.category === category);
  lines.push(`### ${titleCase(category)} (${group.length})`);
  lines.push(``);
  lines.push(`| Skill | What it does | Read-only | Install |`);
  lines.push(`|---|---|---|---|`);
  for (const s of group) {
    const ro = s.readOnly ? '✓' : '';
    lines.push(`| [\`${s.name}\`](${s.skillPath}) | ${s.description} | ${ro} | \`${s.installCommand}\` |`);
  }
  lines.push(``);
}

lines.push(`---`);
lines.push(``);
lines.push(`## By Bundle`);
lines.push(``);

for (const bundle of BUNDLES) {
  lines.push(`### ${bundle.name}`);
  lines.push(``);
  lines.push(`_${bundle.description}_`);
  lines.push(``);
  lines.push(`\`\`\``);
  for (const skillName of bundle.skills) {
    lines.push(`/plugin install ${skillName}@${REPO}`);
  }
  lines.push(`\`\`\``);
  lines.push(``);
}

writeFileSync(join(ROOT, 'CATALOG.md'), lines.join('\n'));
console.log(`✓ CATALOG.md`);

function titleCase(str) {
  return str.replace(/-/g, ' ').replace(/(^|\s)(\w)/g, (_, sep, c) => sep + c.toUpperCase());
}
