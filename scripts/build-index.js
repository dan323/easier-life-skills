#!/usr/bin/env node
// scripts/build-index.js
// Reads marketplaces.json, aggregates skills, agents, and MCP servers from each repo,
// and writes skills_index.json + CATALOG.md.
//
// Run: node scripts/build-index.js

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname }               from 'path';
import { fileURLToPath }               from 'url';
import { fetchMarketplaceSkills }      from './lib/fetch-marketplace.js';
import { generateCatalog }             from './lib/catalog.js';
import { inferCategories }             from './lib/categorize.js';

const ROOT         = join(dirname(fileURLToPath(import.meta.url)), '..');
const marketplaces = JSON.parse(readFileSync(join(ROOT, 'marketplaces.json'), 'utf8'));

const bundlesPath = join(ROOT, '.claude-plugin', 'bundles.json');
const BUNDLES = existsSync(bundlesPath)
  ? JSON.parse(readFileSync(bundlesPath, 'utf8'))
  : [];

const allSkills     = [];
const allAgents     = [];
const allMcpServers = [];

for (const { owner, repo } of marketplaces) {
  const { skills, agents, mcpServers } = await fetchMarketplaceSkills(owner, repo, ROOT);
  allSkills.push(...skills);
  allAgents.push(...agents);
  allMcpServers.push(...mcpServers);
}

// Infer categories for skills that have none (e.g., from external repos)
const uncategorised = allSkills.filter(s => !s.category);
if (uncategorised.length > 0) {
  console.log(`  Inferring categories for ${uncategorised.length} uncategorised skill(s)…`);
  const inferred = await inferCategories(uncategorised);
  for (const skill of uncategorised) {
    skill.category = inferred[skill.name] || 'uncategorized';
  }
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
    skillCount:     allSkills.length,
    agentCount:     allAgents.length,
    mcpServerCount: allMcpServers.length,
  },
  skills:     allSkills,
  agents:     allAgents,
  mcpServers: allMcpServers,
  bundles:    BUNDLES,
};

writeFileSync(join(ROOT, 'skills_index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`\n✓ skills_index.json — ${allSkills.length} skills, ${allAgents.length} agents, ${allMcpServers.length} MCP servers from ${marketplaces.length} marketplace(s)`);

writeFileSync(join(ROOT, 'CATALOG.md'), generateCatalog(allSkills, allAgents, allMcpServers, BUNDLES, marketplaces));
console.log(`✓ CATALOG.md`);
