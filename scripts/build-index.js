#!/usr/bin/env node
// scripts/build-index.js
// 1. Scans plugins/ to generate .claude-plugin/marketplace.json
// 2. Reads marketplaces.json, aggregates skills, agents, and MCP servers from each repo
// 3. Writes skills_index.json + CATALOG.md
//
// Run: node scripts/build-index.js

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname }               from 'path';
import { fileURLToPath }               from 'url';
import { fetchMarketplaceSkills } from './lib/fetch-marketplace.js';
import { generateCatalog }             from './lib/catalog.js';

const ROOT         = join(dirname(fileURLToPath(import.meta.url)), '..');
const marketplaces = JSON.parse(readFileSync(join(ROOT, 'marketplaces.json'), 'utf8'));

// --- Step 1: Generate .claude-plugin/marketplace.json from plugins/ ---
const LOCAL_OWNER = marketplaces[0].owner;
const LOCAL_REPO  = marketplaces[0].repo;
const LOCAL_DESC  = marketplaces[0].description || '';

const pluginsDir  = join(ROOT, 'plugins');
const pluginNames = readdirSync(pluginsDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .sort();

const generatedPlugins = [];
for (const pluginName of pluginNames) {
  const pluginJsonPath = join(pluginsDir, pluginName, '.claude-plugin', 'plugin.json');
  if (!existsSync(pluginJsonPath)) continue;
  const pluginJson = JSON.parse(readFileSync(pluginJsonPath, 'utf8'));
  generatedPlugins.push({
    name:        pluginJson.name || pluginName,
    source:      `./plugins/${pluginName}`,
    description: pluginJson.description || '',
    category:    pluginJson.category || null,
    homepage:    `https://github.com/${LOCAL_OWNER}/${LOCAL_REPO}/tree/master/plugins/${pluginName}`,
  });
}

writeFileSync(
  join(ROOT, '.claude-plugin', 'marketplace.json'),
  JSON.stringify({
    name:        LOCAL_REPO,
    description: LOCAL_DESC,
    owner:       { name: LOCAL_OWNER },
    plugins:     generatedPlugins,
  }, null, 2) + '\n'
);
console.log(`✓ .claude-plugin/marketplace.json — ${generatedPlugins.length} plugins`);

// --- Step 2: Aggregate from all marketplaces ---
const bundlesPath   = join(ROOT, '.claude-plugin', 'bundles.json');
const BUNDLES = existsSync(bundlesPath)
  ? JSON.parse(readFileSync(bundlesPath, 'utf8'))
  : [];

const overridesPath = join(ROOT, '.claude-plugin', 'external-overrides.json');
const OVERRIDES = existsSync(overridesPath)
  ? JSON.parse(readFileSync(overridesPath, 'utf8'))
  : {};

const allPlugins    = [];
const allSkills     = [];
const allAgents     = [];
const allMcpServers = [];

for (const { owner, repo } of marketplaces) {
  const { plugins, skills, agents, mcpServers } = await fetchMarketplaceSkills(owner, repo, ROOT);
  allPlugins.push(...plugins);
  allSkills.push(...skills);
  allAgents.push(...agents);
  allMcpServers.push(...mcpServers);
}

// Apply external overrides for categories (local plugins carry their own via plugin.json)
for (const plugin of allPlugins) {
  const repoKey = `${plugin.source.owner}/${plugin.source.repo}`;
  const cat = OVERRIDES[repoKey]?.plugins?.[plugin.name]?.category;
  if (cat) plugin.category = cat;
}
for (const skill of allSkills) {
  const repoKey = `${skill.source.owner}/${skill.source.repo}`;
  const cat = OVERRIDES[repoKey]?.skills?.[skill.name]?.category;
  if (cat) skill.category = cat;
}

// Attach bundle membership to skills
const skillBundleMap = {};
for (const bundle of BUNDLES) {
  for (const skillName of bundle.skills) {
    (skillBundleMap[skillName] ??= []).push(bundle.id);
  }
}
for (const skill of allSkills) {
  skill.bundles = skillBundleMap[skill.name] || skill.bundles || [];
}

const index = {
  meta: {
    generated:      new Date().toISOString(),
    marketplaces:   marketplaces.map(m => `${m.owner}/${m.repo}`),
    pluginCount:    allPlugins.length,
    skillCount:     allSkills.length,
    agentCount:     allAgents.length,
    mcpServerCount: allMcpServers.length,
  },
  plugins:    allPlugins,
  skills:     allSkills,
  agents:     allAgents,
  mcpServers: allMcpServers,
  bundles:    BUNDLES,
};

writeFileSync(join(ROOT, 'skills_index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`\n✓ skills_index.json — ${allPlugins.length} plugins, ${allSkills.length} skills, ${allAgents.length} agents, ${allMcpServers.length} MCP servers from ${marketplaces.length} marketplace(s)`);

writeFileSync(join(ROOT, 'CATALOG.md'), generateCatalog(allSkills, allAgents, allMcpServers, BUNDLES, marketplaces));
console.log(`✓ CATALOG.md`);
