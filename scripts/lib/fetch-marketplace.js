/* lib/fetch-marketplace.js — fetches skills, agents, and mcpServers from one GitHub marketplace repo */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join }                                  from 'path';
import { parseFrontmatter }                      from './frontmatter.js';

const RAW_BASE = 'https://raw.githubusercontent.com';

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

/** Read a file preferring local copy, falling back to remote URL. */
async function readFile(relativePath, remoteBaseUrl, root) {
  const localPath = join(root, relativePath);
  if (existsSync(localPath)) return readFileSync(localPath, 'utf8');
  try {
    return await fetchText(`${remoteBaseUrl}/${relativePath}`);
  } catch {
    return null;
  }
}

/**
 * List immediate children of a directory.
 * Local-first; falls back to GitHub Contents API for remote repos.
 * Uses GITHUB_TOKEN env var if present to avoid rate limits.
 */
async function listDir(dirPath, remoteBase, root) {
  const localPath = join(root, dirPath);
  if (existsSync(localPath)) {
    return readdirSync(localPath, { withFileTypes: true })
      .map(e => ({ name: e.name, isDir: e.isDirectory() }));
  }
  const m = remoteBase.match(/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)/);
  if (!m) return [];
  const [, ghOwner, ghRepo, ghBranch] = m;
  const headers = { Accept: 'application/vnd.github.v3+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${ghOwner}/${ghRepo}/contents/${dirPath}?ref=${ghBranch}`,
      { headers }
    );
    if (!res.ok) return [];
    const items = await res.json();
    return Array.isArray(items)
      ? items.map(i => ({ name: i.name, isDir: i.type === 'dir' }))
      : [];
  } catch { return []; }
}

/** Resolve the source field to a base URL and local plugin root. */
function resolveSource(source, pluginEntry, owner, repo, branch) {
  const repoBase = `${RAW_BASE}/${owner}/${repo}/${branch}`;

  if (typeof source === 'string') {
    const localRel = source.replace(/^\.\//, '');
    return { pluginRoot: localRel, remoteBase: repoBase };
  }

  if (source && source.source === 'url') {
    const url = source.url.replace(/\.git$/, '');
    const [, extOwner, extRepo] = url.match(/github\.com\/([^/]+)\/([^/]+)/) ?? [];
    const extBranch = source.ref || 'main';
    const base = extOwner ? `${RAW_BASE}/${extOwner}/${extRepo}/${extBranch}` : url;
    return { pluginRoot: '', remoteBase: base, external: true };
  }

  if (source && source.source === 'git-subdir') {
    const url = source.url.replace(/\.git$/, '');
    const [, extOwner, extRepo] = url.match(/github\.com\/([^/]+)\/([^/]+)/) ?? [];
    const extBranch = source.ref || 'main';
    const subPath   = source.path || '';
    const base = extOwner ? `${RAW_BASE}/${extOwner}/${extRepo}/${extBranch}` : url;
    return { pluginRoot: subPath, remoteBase: base, external: true };
  }

  return { pluginRoot: `plugins/${pluginEntry.name}`, remoteBase: repoBase };
}

/** Parse one skill from a directory path (relative to plugin root) that contains SKILL.md. */
async function parseSkill(skillRelPath, pluginRoot, remoteBase, root, pluginEntry, owner, repo) {
  const skillDir  = skillRelPath.replace(/^\.\//, '');
  const skillName = skillDir.split('/').pop();
  const skillPath = pluginRoot ? `${pluginRoot}/${skillDir}/SKILL.md` : `${skillDir}/SKILL.md`;

  const content = await readFile(skillPath, remoteBase, root);
  if (!content) return null;

  const frontmatter = parseFrontmatter(content);
  const readOnly    = content.includes('This skill is read-only');

  return {
    name:           skillName,
    pluginName:     pluginEntry.name,
    version:        frontmatter.version || '1.0',
    description:    pluginEntry.description || frontmatter.description || '',
    category:       pluginEntry.category || null,
    keywords:       pluginEntry.keywords || [],
    tools:          frontmatter.tools || [],
    readOnly,
    skillPath,
    rawSkillUrl:    `${remoteBase}/${skillPath}`,
    installCommand: `/plugin install ${pluginEntry.name}@${repo}`,
    source:         { owner, repo, repoUrl: `https://github.com/${owner}/${repo}` },
  };
}

/** Parse one agent from a .md file path (relative to plugin root). */
async function parseAgent(agentRelPath, pluginRoot, remoteBase, root, pluginEntry, owner, repo) {
  const agentRel      = agentRelPath.replace(/^\.\//, '');
  const agentName     = agentRel.split('/').pop().replace(/\.md$/, '');
  const agentPathBase = pluginRoot ? `${pluginRoot}/${agentRel}` : agentRel;
  const fullAgentPath = agentPathBase.endsWith('.md') ? agentPathBase : `${agentPathBase}.md`;

  const content = await readFile(fullAgentPath, remoteBase, root);
  if (!content) return null;

  const frontmatter = parseFrontmatter(content);

  return {
    name:           frontmatter.name || agentName,
    pluginName:     pluginEntry.name,
    description:    frontmatter.description || '',
    tools:          frontmatter.tools ? String(frontmatter.tools).split(',').map(t => t.trim()) : [],
    background:     frontmatter.background === true || frontmatter.background === 'true',
    agentPath:      fullAgentPath,
    rawAgentUrl:    `${remoteBase}/${fullAgentPath}`,
    installCommand: `/plugin install ${pluginEntry.name}@${repo}`,
    source:         { owner, repo, repoUrl: `https://github.com/${owner}/${repo}` },
  };
}

/** Parse one MCP server from a normalised { name, command, args, env } object. */
function parseMcpServer(mcpEntry, pluginEntry, owner, repo) {
  return {
    name:           mcpEntry.name,
    pluginName:     pluginEntry.name,
    description:    mcpEntry.description || pluginEntry.description || '',
    command:        mcpEntry.command,
    args:           mcpEntry.args || [],
    env:            mcpEntry.env || {},
    installCommand: `/plugin install ${pluginEntry.name}@${repo}`,
    source:         { owner, repo, repoUrl: `https://github.com/${owner}/${repo}` },
  };
}

/**
 * Discover skills for one plugin.
 *
 * `decl` can be:
 *   - string[]  explicit list of skill directory paths, each containing SKILL.md
 *   - string    parent directory to scan; each subdir is one skill
 *   - null      default: scan skills/
 */
async function discoverSkills(decl, pluginRoot, remoteBase, root, pluginEntry, owner, repo) {
  const results = [];

  if (Array.isArray(decl)) {
    for (const sp of decl) {
      const skill = await parseSkill(sp, pluginRoot, remoteBase, root, pluginEntry, owner, repo);
      if (skill) results.push(skill);
    }
    return results;
  }

  const scanRel    = decl ? decl.replace(/^\.\//, '').replace(/\/$/, '') : 'skills';
  const fullScanDir = pluginRoot ? `${pluginRoot}/${scanRel}` : scanRel;
  const entries    = await listDir(fullScanDir, remoteBase, root);
  for (const entry of entries.filter(e => e.isDir)) {
    const skill = await parseSkill(`${scanRel}/${entry.name}`, pluginRoot, remoteBase, root, pluginEntry, owner, repo);
    if (skill) results.push(skill);
  }
  return results;
}

/**
 * Discover agents for one plugin.
 *
 * `decl` can be:
 *   - string[]  explicit list of agent .md file paths
 *   - string    parent directory to scan for .md files
 *   - null      default: scan agents/
 */
async function discoverAgents(decl, pluginRoot, remoteBase, root, pluginEntry, owner, repo) {
  const results = [];

  if (Array.isArray(decl)) {
    for (const ap of decl) {
      const agent = await parseAgent(ap, pluginRoot, remoteBase, root, pluginEntry, owner, repo);
      if (agent) results.push(agent);
    }
    return results;
  }

  const scanRel     = decl ? decl.replace(/^\.\//, '').replace(/\/$/, '') : 'agents';
  const fullScanDir = pluginRoot ? `${pluginRoot}/${scanRel}` : scanRel;
  const entries     = await listDir(fullScanDir, remoteBase, root);
  for (const entry of entries.filter(e => !e.isDir && e.name.endsWith('.md'))) {
    const agent = await parseAgent(`${scanRel}/${entry.name}`, pluginRoot, remoteBase, root, pluginEntry, owner, repo);
    if (agent) results.push(agent);
  }
  return results;
}

/**
 * Discover MCP servers for one plugin.
 *
 * `decl` can be:
 *   - object    keyed by server name: { "name": { command, args, env } }
 *   - object[]  legacy: array of objects with a name field
 *   - string    path to a JSON file (e.g. "./.mcp.json")
 *   - null      fall back to .mcp.json at plugin root
 */
async function discoverMcpServers(decl, pluginRoot, remoteBase, root, pluginEntry, owner, repo) {
  let data = decl;

  if (typeof data === 'string') {
    const filePath = data.replace(/^\.\//, '');
    const fullPath = pluginRoot ? `${pluginRoot}/${filePath}` : filePath;
    const text = await readFile(fullPath, remoteBase, root);
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (data && !Array.isArray(data) && data.mcpServers) data = data.mcpServers;
  }

  if (data === null) {
    const mcpJsonPath = pluginRoot ? `${pluginRoot}/.mcp.json` : '.mcp.json';
    const text = await readFile(mcpJsonPath, remoteBase, root);
    if (text) {
      try {
        const parsed = JSON.parse(text);
        data = parsed.mcpServers ?? parsed;
      } catch {}
    }
  }

  if (!data) return [];

  const entries = Array.isArray(data)
    ? data
    : Object.entries(data).map(([name, cfg]) => ({ name, ...cfg }));

  return entries.filter(m => m.name).map(m => parseMcpServer(m, pluginEntry, owner, repo));
}

export async function fetchMarketplaceSkills(owner, repo, root) {
  const branch  = 'master';
  const baseUrl = `${RAW_BASE}/${owner}/${repo}/${branch}`;

  console.log(`  Fetching ${owner}/${repo}…`);

  let marketplaceJson;
  try {
    marketplaceJson = await fetchJson(`${baseUrl}/.claude-plugin/marketplace.json`);
  } catch (err) {
    console.warn(`  [warn] Could not fetch marketplace.json for ${owner}/${repo}: ${err.message}`);
    return { skills: [], agents: [], mcpServers: [], bundles: [] };
  }

  const skills     = [];
  const agents     = [];
  const mcpServers = [];
  const plugins    = [];

  for (const pluginEntry of marketplaceJson.plugins || []) {
    const { pluginRoot, remoteBase } = resolveSource(
      pluginEntry.source, pluginEntry, owner, repo, branch
    );

    // Fetch plugin.json for explicit declarations (skills/agents/mcpServers)
    const pluginJsonPath = pluginRoot
      ? `${pluginRoot}/.claude-plugin/plugin.json`
      : `.claude-plugin/plugin.json`;

    let pluginJson = null;
    try {
      const text = await readFile(pluginJsonPath, remoteBase, root);
      if (text) pluginJson = JSON.parse(text);
    } catch {
      console.warn(`  [warn] Could not parse plugin.json at ${pluginJsonPath}`);
    }

    // Declarations from plugin.json take precedence over marketplace entry
    const skillsDecl  = pluginJson?.skills  ?? pluginEntry.skills  ?? null;
    const agentsDecl  = pluginJson?.agents  ?? pluginEntry.agents  ?? null;
    const mcpsDecl    = pluginJson?.mcpServers ?? pluginEntry.mcpServers ?? null;

    const foundSkills     = await discoverSkills(skillsDecl, pluginRoot, remoteBase, root, pluginEntry, owner, repo);
    const foundAgents     = await discoverAgents(agentsDecl, pluginRoot, remoteBase, root, pluginEntry, owner, repo);
    const foundMcpServers = await discoverMcpServers(mcpsDecl, pluginRoot, remoteBase, root, pluginEntry, owner, repo);

    skills.push(...foundSkills);
    agents.push(...foundAgents);
    mcpServers.push(...foundMcpServers);

    plugins.push({
      name:           pluginEntry.name,
      description:    pluginEntry.description || '',
      category:       pluginEntry.category || null,
      homepage:       pluginEntry.homepage || null,
      skills:         foundSkills.map(s => s.name),
      agents:         foundAgents.map(a => a.name),
      mcpServers:     foundMcpServers.map(m => m.name),
      installCommand: `/plugin install ${pluginEntry.name}@${repo}`,
      source:         { owner, repo, repoUrl: `https://github.com/${owner}/${repo}` },
    });
  }

  skills.sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));

  const bundles = (marketplaceJson.bundles || []).map(b => ({
    ...b,
    source: { owner, repo, repoUrl: `https://github.com/${owner}/${repo}` },
  }));

  console.log(`  ✓ ${plugins.length} plugins, ${skills.length} skills, ${agents.length} agents, ${mcpServers.length} MCP servers from ${owner}/${repo}`);
  return { plugins, skills, agents, mcpServers, bundles };
}
