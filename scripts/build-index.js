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

const CATEGORIES = ['automation', 'code-quality', 'documentation', 'productivity'];

const EXTERNAL_MARKETPLACES = [
  {
    owner: 'anthropics',
    repo: 'skills',
    catalogUrl: 'https://raw.githubusercontent.com/anthropics/skills/master/.claude-plugin/marketplace.json',
  },
  {
    owner: 'scottmatthewman',
    repo: 'skills',
    catalogUrl: 'https://raw.githubusercontent.com/scottmatthewman/skills/master/.claude-plugin/marketplace.json',
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
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const raw = match[1];
  const result = {};
  const lines = raw.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const keyMatch = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (!keyMatch) { i++; continue; }

    const key = keyMatch[1];
    const val = keyMatch[2].trim();

    if (val === '>') {
      i++;
      const parts = [];
      while (i < lines.length && (lines[i].startsWith(' ') || lines[i].startsWith('\t'))) {
        parts.push(lines[i].trim());
        i++;
      }
      result[key] = parts.join(' ');
    } else if (val === '') {
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

  if (typeof result.tools === 'string') {
    result.tools = result.tools.split(',').map(t => t.trim()).filter(Boolean);
  }
  if (result.metadata && result.metadata.version) {
    result.version = String(result.metadata.version);
  }

  return result;
}

// --- Copilot categorisation via GitHub Models API ---
async function inferCategories(uncategorisedSkills) {
  const token = process.env.MODELS_TOKEN || process.env.GITHUB_TOKEN;
  if (!token || uncategorisedSkills.length === 0) return {};

  const list = uncategorisedSkills
    .map(s => `- ${s.name}: ${String(s.description || '').slice(0, 300)}`)
    .join('\n');

  const prompt =
    `Categorize each Claude Code skill into exactly one of: ${CATEGORIES.join(', ')}.\n` +
    `Reply with a JSON object mapping each skill name to its category. No other text.\n\n` +
    list;

  try {
    const res = await fetch('https://models.inference.ai.azure.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 300,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} — ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const result = JSON.parse(data.choices[0].message.content);
    for (const [name, cat] of Object.entries(result)) {
      if (!CATEGORIES.includes(cat)) result[name] = 'uncategorized';
    }
    console.log(`  Copilot categorised ${Object.keys(result).length} skills`);
    return result;
  } catch (err) {
    console.warn(`  [warn] Copilot categorisation failed: ${err.message}`);
    return {};
  }
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
const externalBundles = [];
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
      const subPaths = plugin.skills && plugin.skills.length > 0 ? plugin.skills : [];

      if (subPaths.length > 0) {
        const skillNames = await Promise.all(subPaths.map(async (subPath) => {
          const normalizedPath = subPath.replace(/^\.\//, '');
          const skillMdUrl = `${extBase}/${normalizedPath}/SKILL.md`;

          let frontmatter = {};
          try {
            const r = await fetch(skillMdUrl);
            if (r.ok) frontmatter = parseFrontmatter(await r.text());
          } catch { /* skip */ }

          const skillName = frontmatter.name || normalizedPath.split('/').pop();
          const override = overrides[skillName] || {};

          skills.push({
            name: skillName,
            version: '1.0',
            description: frontmatter.description || plugin.description,
            category: override.category || null,
            keywords: override.keywords || [],
            tools: frontmatter.tools || [],
            readOnly: override.readOnly ?? false,
            skillPath: `${normalizedPath}/SKILL.md`,
            rawSkillUrl: skillMdUrl,
            installCommand: `/plugin install ${skillName}@${ext.repo}`,
            marketplace: { owner: ext.owner, repo: ext.repo },
            bundles: [plugin.name],
            ...override,
            name: skillName,
            category: override.category || null,
            marketplace: { owner: ext.owner, repo: ext.repo },
            bundles: [plugin.name],
          });

          return skillName;
        }));

        const bundleOverride = overrides[plugin.name] || {};
        externalBundles.push({
          id: plugin.name,
          name: plugin.name.replace(/-/g, ' ').replace(/(^|\s)\w/g, c => c.toUpperCase()),
          description: bundleOverride.description || plugin.description,
          skills: skillNames,
          installCommand: `/plugin install ${plugin.name}@${ext.repo}`,
          marketplace: { owner: ext.owner, repo: ext.repo },
        });
      } else {
        const override = overrides[plugin.name] || {};
        const sourcePath = plugin.source
          ? plugin.source.replace(/^\.\//, '') + '/SKILL.md'
          : `plugins/${plugin.name}/skills/${plugin.name}/SKILL.md`;

        let frontmatter = {};
        try {
          const r = await fetch(`${extBase}/${sourcePath}`);
          if (r.ok) frontmatter = parseFrontmatter(await r.text());
        } catch { /* skip */ }

        skills.push({
          name: plugin.name,
          version: plugin.version || plugin.metadata?.version || '1.0',
          description: frontmatter.description || plugin.description,
          category: override.category || null,
          keywords: override.keywords || plugin.keywords || [],
          tools: frontmatter.tools || [],
          readOnly: override.readOnly ?? false,
          skillPath: sourcePath,
          rawSkillUrl: `${extBase}/${sourcePath}`,
          installCommand: `/plugin install ${plugin.name}@${ext.repo}`,
          marketplace: { owner: ext.owner, repo: ext.repo },
          bundles: [],
          ...override,
          name: plugin.name,
          category: override.category || null,
          marketplace: { owner: ext.owner, repo: ext.repo },
          bundles: [],
        });
      }
    }
    console.log(`✓ ${ext.owner}/${ext.repo} — ${extMarketplace.plugins?.length ?? 0} plugins`);
  } catch (err) {
    console.warn(`  [warn] Could not fetch ${ext.owner}/${ext.repo}: ${err.message}`);
  }
}

// Infer categories for external skills that have no manual override
const uncategorised = skills.filter(s => s.category === null);
if (uncategorised.length > 0) {
  console.log(`  Inferring categories for ${uncategorised.length} uncategorised skill(s) via Copilot…`);
  const inferred = await inferCategories(uncategorised);
  for (const skill of uncategorised) {
    skill.category = inferred[skill.name] || 'uncategorized';
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
  bundles: [...BUNDLES, ...externalBundles],
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
