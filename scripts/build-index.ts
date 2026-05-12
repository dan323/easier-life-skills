#!/usr/bin/env node
// scripts/build-index.ts
// 1. Scans plugins/ to generate .claude-plugin/marketplace.json
// 2. Reads marketplaces.json, aggregates skills, agents, and MCP servers from each repo
// 3. Writes skills_index.json + CATALOG.md + catalog.html

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname }                          from 'path';
import { fileURLToPath }                          from 'url';
import { fetchMarketplaceSkills }                 from './lib/fetch-marketplace.js';
import { generateCatalog, generateCatalogHtml }   from './lib/catalog.js';
import type { MarketplaceEntry, Plugin, Skill, Bundle, Hook } from './lib/types.js';

const ROOT         = join(dirname(fileURLToPath(import.meta.url)), '..');
const marketplaces = JSON.parse(readFileSync(join(ROOT, 'marketplaces.json'), 'utf8')) as MarketplaceEntry[];

// --- Step 1: Generate .claude-plugin/marketplace.json from plugins/ ---
const LOCAL_OWNER = marketplaces[0]!.owner;
const LOCAL_REPO  = marketplaces[0]!.repo;
const LOCAL_DESC  = marketplaces[0]!.description ?? '';

interface LocalPluginJson {
  name?: string;
  description?: string;
  category?: string | null;
}

const pluginsDir  = join(ROOT, 'plugins');
const pluginNames = readdirSync(pluginsDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .sort();

const generatedPlugins: Array<{ name: string; source: string; description: string; category: string | null; homepage: string }> = [];
for (const pluginName of pluginNames) {
  const pluginJsonPath = join(pluginsDir, pluginName, '.claude-plugin', 'plugin.json');
  if (!existsSync(pluginJsonPath)) continue;
  const pluginJson = JSON.parse(readFileSync(pluginJsonPath, 'utf8')) as LocalPluginJson;
  generatedPlugins.push({
    name:        pluginJson.name ?? pluginName,
    source:      `./plugins/${pluginName}`,
    description: pluginJson.description ?? '',
    category:    pluginJson.category ?? null,
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
const bundlesPath = join(ROOT, '.claude-plugin', 'bundles.json');
const BUNDLES: Bundle[] = existsSync(bundlesPath)
  ? JSON.parse(readFileSync(bundlesPath, 'utf8')) as Bundle[]
  : [];

const overridesPath = join(ROOT, '.claude-plugin', 'external-overrides.json');
type OverrideMap = Record<string, { category?: string }>;
const OVERRIDES: Record<string, {
  plugins?:    OverrideMap;
  skills?:     OverrideMap;
  agents?:     OverrideMap;
  hooks?:      OverrideMap;
  commands?:   OverrideMap;
  mcpServers?: OverrideMap;
}> =
  existsSync(overridesPath)
    ? JSON.parse(readFileSync(overridesPath, 'utf8'))
    : {};

const allPlugins:    Plugin[]  = [];
const allSkills:     Skill[]   = [];
const allAgents:     import('./lib/types.js').Agent[]     = [];
const allMcpServers: import('./lib/types.js').McpServer[] = [];
const allCommands:   import('./lib/types.js').Command[]   = [];
const allHooks:      Hook[]    = [];

for (const { owner, repo } of marketplaces) {
  // Pass local root only for the local repo; external marketplaces must not touch local fs
  const localRoot = (owner === LOCAL_OWNER && repo === LOCAL_REPO) ? ROOT : null;
  const { plugins, skills, agents, mcpServers, commands, hooks } = await fetchMarketplaceSkills(owner, repo, localRoot);
  allPlugins.push(...plugins);
  allSkills.push(...skills);
  allAgents.push(...agents);
  allMcpServers.push(...mcpServers);
  allCommands.push(...commands);
  allHooks.push(...hooks);
}

// Apply external overrides for categories
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
for (const agent of allAgents) {
  const repoKey = `${agent.source.owner}/${agent.source.repo}`;
  const cat = OVERRIDES[repoKey]?.agents?.[agent.name]?.category;
  if (cat) agent.category = cat;
}
for (const hook of allHooks) {
  const repoKey = `${hook.source.owner}/${hook.source.repo}`;
  const cat = OVERRIDES[repoKey]?.hooks?.[hook.name]?.category;
  if (cat) hook.category = cat;
}
for (const command of allCommands) {
  const repoKey = `${command.source.owner}/${command.source.repo}`;
  const cat = OVERRIDES[repoKey]?.commands?.[command.name]?.category;
  if (cat) command.category = cat;
}
for (const mcp of allMcpServers) {
  const repoKey = `${mcp.source.owner}/${mcp.source.repo}`;
  const cat = OVERRIDES[repoKey]?.mcpServers?.[mcp.name]?.category;
  if (cat) mcp.category = cat;
}

// Auto-assign 'mixed' to plugins whose skills span multiple categories and have no explicit category
for (const plugin of allPlugins) {
  if (plugin.category) continue;
  const repoKey = `${plugin.source.owner}/${plugin.source.repo}`;
  const cats = new Set(
    allSkills
      .filter(s => plugin.skills.includes(s.name) && `${s.source.owner}/${s.source.repo}` === repoKey)
      .map(s => s.category)
      .filter((c): c is string => c !== null)
  );
  if (cats.size > 1) plugin.category = 'mixed';
}

// Attach bundle membership to skills
const skillBundleMap: Record<string, string[]> = {};
for (const bundle of BUNDLES) {
  for (const skillName of bundle.skills) {
    (skillBundleMap[skillName] ??= []).push(bundle.id ?? bundle.name);
  }
}
for (const skill of allSkills) {
  skill.bundles = skillBundleMap[skill.name] ?? skill.bundles ?? [];
}

const index = {
  meta: {
    generated:      new Date().toISOString(),
    marketplaces:   marketplaces.map(m => `${m.owner}/${m.repo}`),
    pluginCount:    allPlugins.length,
    skillCount:     allSkills.length,
    agentCount:     allAgents.length,
    mcpServerCount: allMcpServers.length,
    commandCount:   allCommands.length,
    hookCount:      allHooks.length,
  },
  plugins:    allPlugins,
  skills:     allSkills,
  agents:     allAgents,
  mcpServers: allMcpServers,
  commands:   allCommands,
  hooks:      allHooks,
  bundles:    BUNDLES,
};

writeFileSync(join(ROOT, 'skills_index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`\n✓ skills_index.json — ${allPlugins.length} plugins, ${allSkills.length} skills, ${allAgents.length} agents, ${allMcpServers.length} MCP servers, ${allCommands.length} commands, ${allHooks.length} hooks from ${marketplaces.length} marketplace(s)`);

writeFileSync(join(ROOT, 'CATALOG.md'), generateCatalog(allSkills, allAgents, allMcpServers, allCommands, allHooks, BUNDLES, marketplaces));
console.log(`✓ CATALOG.md`);

writeFileSync(join(ROOT, 'catalog.html'), generateCatalogHtml(allSkills, allAgents, allMcpServers, allCommands, allHooks, BUNDLES, marketplaces));
console.log(`✓ catalog.html`);
