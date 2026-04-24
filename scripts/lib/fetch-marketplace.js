/* lib/fetch-marketplace.js — fetches skills and bundles from one GitHub marketplace repo */

import { readFileSync, existsSync } from 'fs';
import { join }                     from 'path';
import { parseFrontmatter }         from './frontmatter.js';

const RAW_BASE = 'https://raw.githubusercontent.com';

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

function skillPathFor(name) {
  return `plugins/${name}/skills/${name}/SKILL.md`;
}

async function readSkillContent(skillPath, remoteUrl, root) {
  // Prefer local file (faster, avoids rate limits for the primary repo)
  const localPath = join(root, skillPath);
  if (existsSync(localPath)) return readFileSync(localPath, 'utf8');

  try {
    return await fetchText(remoteUrl);
  } catch {
    return null;
  }
}

export async function fetchMarketplaceSkills(owner, repo, root) {
  const branch  = 'master';
  const baseUrl = `${RAW_BASE}/${owner}/${repo}/${branch}`;
  const repoUrl = `https://github.com/${owner}/${repo}`;
  const source  = { owner, repo, repoUrl };

  console.log(`  Fetching ${owner}/${repo}…`);

  let marketplaceJson;
  try {
    marketplaceJson = await fetchJson(`${baseUrl}/.claude-plugin/marketplace.json`);
  } catch (err) {
    console.warn(`  [warn] Could not fetch marketplace.json for ${owner}/${repo}: ${err.message}`);
    return { skills: [], bundles: [] };
  }

  // Build bundle membership map so each skill knows which bundles it belongs to
  const bundlesRaw     = marketplaceJson.bundles || [];
  const skillBundleMap = {};
  for (const bundle of bundlesRaw) {
    for (const skillName of bundle.skills || []) {
      (skillBundleMap[skillName] ??= []).push(bundle.id);
    }
  }

  const skills = [];

  for (const plugin of marketplaceJson.plugins || []) {
    const skillPath = skillPathFor(plugin.name);
    const skillUrl  = `${baseUrl}/${skillPath}`;

    const content    = await readSkillContent(skillPath, skillUrl, root);
    const frontmatter = content ? parseFrontmatter(content) : {};
    const readOnly    = content?.includes('This skill is read-only') ?? false;

    if (!content) {
      console.warn(`  [warn] SKILL.md not found for ${owner}/${repo}/${plugin.name}`);
    }

    skills.push({
      name:           plugin.name,
      version:        frontmatter.version || '1.0',
      description:    plugin.description,
      category:       plugin.category,
      keywords:       plugin.keywords || [],
      tools:          frontmatter.tools || [],
      readOnly,
      skillPath,
      rawSkillUrl:    `${baseUrl}/${skillPath}`,
      installCommand: `/plugin install ${plugin.name}@${repo}`,
      bundles:        skillBundleMap[plugin.name] || [],
      source,
    });
  }

  skills.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  const bundles = bundlesRaw.map(b => ({ ...b, source }));

  console.log(`  ✓ ${skills.length} skills from ${owner}/${repo}`);
  return { skills, bundles };
}
