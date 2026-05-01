/* lib/fetch-marketplace.ts — fetches skills, agents, and mcpServers from one GitHub marketplace repo */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join }                                  from 'path';
import { parseFrontmatter }                      from './frontmatter.js';
import type { Skill, Agent, McpServer, Plugin, Bundle, MarketplaceResult } from './types.js';

const RAW_BASE = 'https://raw.githubusercontent.com';

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

async function fetchJson<T>(url: string): Promise<T> {
  return JSON.parse(await fetchText(url)) as T;
}

/** Read a file preferring local copy, falling back to remote URL. */
async function readFile(relativePath: string, remoteBaseUrl: string, root: string): Promise<string | null> {
  if (relativePath) {
    const localPath = join(root, relativePath);
    if (existsSync(localPath)) return readFileSync(localPath, 'utf8');
  }
  try {
    return await fetchText(`${remoteBaseUrl}/${relativePath}`);
  } catch {
    return null;
  }
}

// ── Git tree cache ──

const treeCache = new Map<string, Map<string, string> | null>();

function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
  if (process.env['GITHUB_TOKEN']) h['Authorization'] = `Bearer ${process.env['GITHUB_TOKEN']}`;
  return h;
}

async function getTree(remoteBase: string): Promise<Map<string, string> | null> {
  if (treeCache.has(remoteBase)) return treeCache.get(remoteBase)!;

  const m = remoteBase.match(/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)/);
  if (!m) { treeCache.set(remoteBase, null); return null; }
  const [, ghOwner, ghRepo, ghBranch] = m as [string, string, string, string];

  try {
    const res = await fetch(
      `https://api.github.com/repos/${ghOwner}/${ghRepo}/git/trees/${ghBranch}?recursive=1`,
      { headers: ghHeaders() }
    );
    if (!res.ok) {
      if (res.status === 403 || res.status === 429) {
        console.warn(`  [warn] GitHub API rate limit hit fetching tree for ${ghOwner}/${ghRepo} — set GITHUB_TOKEN for higher limits`);
      }
      treeCache.set(remoteBase, null); return null;
    }
    const data = await res.json() as { tree?: Array<{ path: string; type: string }> };
    if (!data.tree) { treeCache.set(remoteBase, null); return null; }

    const map = new Map<string, string>();
    for (const entry of data.tree) map.set(entry.path, entry.type);
    treeCache.set(remoteBase, map);
    return map;
  } catch {
    treeCache.set(remoteBase, null);
    return null;
  }
}

interface DirEntry { name: string; isDir: boolean }

async function listDir(dirPath: string, remoteBase: string, root: string): Promise<DirEntry[]> {
  if (dirPath) {
    const localPath = join(root, dirPath);
    if (existsSync(localPath)) {
      return readdirSync(localPath, { withFileTypes: true })
        .map(e => ({ name: e.name, isDir: e.isDirectory() }));
    }
  }

  const tree = await getTree(remoteBase);
  if (!tree) return [];

  const prefix = dirPath ? `${dirPath}/` : '';
  const children = new Map<string, boolean>();
  for (const [path, type] of tree) {
    if (prefix && !path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    if (!rest) continue;
    const slash = rest.indexOf('/');
    const name  = slash === -1 ? rest : rest.slice(0, slash);
    if (!name) continue;
    if (!children.has(name)) children.set(name, type === 'tree' && slash === -1);
    if (type === 'tree' && slash === -1) children.set(name, true);
  }
  return [...children.entries()].map(([name, isDir]) => ({ name, isDir }));
}

function normalisePath(p: string | null | undefined): string {
  return (p ?? '')
    .replace(/^\.?\/+/, '')
    .replace(/^\.$/, '')
    .replace(/\/?\.$/, '')
    .replace(/\/$/, '');
}

/**
 * Parse a GitHub repo reference (full URL or bare owner/repo slug) into a
 * raw.githubusercontent.com base URL. Returns null if not recognisable.
 */
function parseGitHubBase(ref: string, branch: string): string | null {
  const fullMatch = ref.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (fullMatch) return `${RAW_BASE}/${fullMatch[1]}/${fullMatch[2]}/${branch}`;
  const slugMatch = ref.match(/^([^/]+)\/([^/]+)$/);
  if (slugMatch) return `${RAW_BASE}/${slugMatch[1]}/${slugMatch[2]}/${branch}`;
  return null;
}

interface ResolvedSource {
  pluginRoot: string;
  remoteBase: string;
  external?: boolean;
}

type PluginSourceDecl =
  | string
  | { source: 'url'; url: string; ref?: string }
  | { source: 'git-subdir'; url: string; path?: string; ref?: string; sha?: string }
  | null
  | undefined;

interface PluginEntry {
  name: string;
  description?: string;
  category?: string | null;
  keywords?: string[];
  source?: PluginSourceDecl;
  skills?: string[] | string | null;
  agents?: string[] | string | null;
  mcpServers?: Record<string, McpConfig> | McpConfig[] | string | null;
  homepage?: string | null;
}

interface McpConfig {
  name?: string;
  description?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

interface PluginJson {
  name?: string;
  version?: string;
  description?: string;
  category?: string;
  skills?: string[] | string | null;
  agents?: string[] | string | null;
  mcpServers?: Record<string, McpConfig> | McpConfig[] | string | null;
}

function resolveSource(
  source: PluginSourceDecl,
  pluginEntry: PluginEntry,
  owner: string,
  repo: string,
  branch: string,
): ResolvedSource {
  const repoBase = `${RAW_BASE}/${owner}/${repo}/${branch}`;

  if (typeof source === 'string') {
    return { pluginRoot: normalisePath(source), remoteBase: repoBase };
  }

  if (source && source.source === 'url') {
    const url = source.url.replace(/\.git$/, '');
    const extBranch = source.ref || 'main';
    const base = parseGitHubBase(url, extBranch);
    return { pluginRoot: '', remoteBase: base ?? url, external: true };
  }

  if (source && source.source === 'git-subdir') {
    const url = source.url.replace(/\.git$/, '');
    const extBranch = source.ref || 'main';
    const subPath = normalisePath(source.path);
    const base = parseGitHubBase(url, extBranch);
    return { pluginRoot: subPath, remoteBase: base ?? url, external: true };
  }

  return { pluginRoot: `plugins/${pluginEntry.name}`, remoteBase: repoBase };
}

async function parseSkill(
  skillRelPath: string,
  pluginRoot: string,
  remoteBase: string,
  root: string,
  pluginEntry: PluginEntry,
  owner: string,
  repo: string,
): Promise<Skill | null> {
  const skillDir  = normalisePath(skillRelPath);
  const skillName = skillDir.split('/').pop()!;
  const skillPath = pluginRoot ? `${pluginRoot}/${skillDir}/SKILL.md` : `${skillDir}/SKILL.md`;

  const content = await readFile(skillPath, remoteBase, root);
  if (!content) return null;

  const frontmatter = parseFrontmatter(content);
  const tools       = Array.isArray(frontmatter.tools) ? frontmatter.tools as string[] : [];
  const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);
  const readOnly    = tools.length > 0 && !tools.some(t => WRITE_TOOLS.has(t));

  return {
    name:           skillName,
    pluginName:     pluginEntry.name,
    version:        frontmatter.version ?? '1.0',
    description:    pluginEntry.description ?? frontmatter.description ?? '',
    category:       pluginEntry.category ?? null,
    keywords:       pluginEntry.keywords ?? [],
    tools,
    readOnly,
    skillPath,
    rawSkillUrl:    `${remoteBase}/${skillPath}`,
    installCommand: `/plugin install ${pluginEntry.name}@${repo}`,
    source:         { owner, repo, repoUrl: `https://github.com/${owner}/${repo}` },
  };
}

async function parseAgent(
  agentRelPath: string,
  pluginRoot: string,
  remoteBase: string,
  root: string,
  pluginEntry: PluginEntry,
  owner: string,
  repo: string,
): Promise<Agent | null> {
  const agentRel      = normalisePath(agentRelPath);
  const agentName     = agentRel.split('/').pop()!.replace(/\.md$/, '');
  const agentPathBase = pluginRoot ? `${pluginRoot}/${agentRel}` : agentRel;
  const fullAgentPath = agentPathBase.endsWith('.md') ? agentPathBase : `${agentPathBase}.md`;

  const content = await readFile(fullAgentPath, remoteBase, root);
  if (!content) return null;

  const frontmatter = parseFrontmatter(content);

  return {
    name:           (frontmatter.name as string | undefined) ?? agentName,
    pluginName:     pluginEntry.name,
    description:    (frontmatter.description as string | undefined) ?? '',
    tools:          frontmatter.tools ? String(frontmatter.tools).split(',').map(t => t.trim()) : [],
    background:     frontmatter.background === true || frontmatter.background === 'true',
    agentPath:      fullAgentPath,
    rawAgentUrl:    `${remoteBase}/${fullAgentPath}`,
    installCommand: `/plugin install ${pluginEntry.name}@${repo}`,
    source:         { owner, repo, repoUrl: `https://github.com/${owner}/${repo}` },
  };
}

function parseMcpServer(
  mcpEntry: McpConfig & { name: string },
  pluginEntry: PluginEntry,
  owner: string,
  repo: string,
): McpServer {
  return {
    name:           mcpEntry.name,
    pluginName:     pluginEntry.name,
    description:    mcpEntry.description ?? pluginEntry.description ?? '',
    command:        mcpEntry.command ?? '',
    args:           mcpEntry.args ?? [],
    env:            mcpEntry.env ?? {},
    installCommand: `/plugin install ${pluginEntry.name}@${repo}`,
    source:         { owner, repo, repoUrl: `https://github.com/${owner}/${repo}` },
  };
}

async function discoverSkills(
  decl: string[] | string | null | undefined,
  pluginRoot: string,
  remoteBase: string,
  root: string,
  pluginEntry: PluginEntry,
  owner: string,
  repo: string,
): Promise<Skill[]> {
  const results: Skill[] = [];

  if (Array.isArray(decl)) {
    for (const sp of decl) {
      const skill = await parseSkill(sp, pluginRoot, remoteBase, root, pluginEntry, owner, repo);
      if (skill) results.push(skill);
    }
    return results;
  }

  const scanRel     = decl != null ? normalisePath(decl) : 'skills';
  const fullScanDir = [pluginRoot, scanRel].filter(Boolean).join('/');
  const entries     = await listDir(fullScanDir, remoteBase, root);
  for (const entry of entries.filter(e => e.isDir)) {
    const relPath = scanRel ? `${scanRel}/${entry.name}` : entry.name;
    const skill = await parseSkill(relPath, pluginRoot, remoteBase, root, pluginEntry, owner, repo);
    if (skill) results.push(skill);
  }
  return results;
}

async function discoverAgents(
  decl: string[] | string | null | undefined,
  pluginRoot: string,
  remoteBase: string,
  root: string,
  pluginEntry: PluginEntry,
  owner: string,
  repo: string,
): Promise<Agent[]> {
  const results: Agent[] = [];

  if (Array.isArray(decl)) {
    for (const ap of decl) {
      const agent = await parseAgent(ap, pluginRoot, remoteBase, root, pluginEntry, owner, repo);
      if (agent) results.push(agent);
    }
    return results;
  }

  const scanRel     = decl != null ? normalisePath(decl) : 'agents';
  const fullScanDir = [pluginRoot, scanRel].filter(Boolean).join('/');
  const entries     = await listDir(fullScanDir, remoteBase, root);
  for (const entry of entries.filter(e => !e.isDir && e.name.endsWith('.md'))) {
    const relPath = scanRel ? `${scanRel}/${entry.name}` : entry.name;
    const agent = await parseAgent(relPath, pluginRoot, remoteBase, root, pluginEntry, owner, repo);
    if (agent) results.push(agent);
  }
  return results;
}

async function discoverMcpServers(
  decl: Record<string, McpConfig> | McpConfig[] | string | null | undefined,
  pluginRoot: string,
  remoteBase: string,
  root: string,
  pluginEntry: PluginEntry,
  owner: string,
  repo: string,
): Promise<McpServer[]> {
  let data: Record<string, McpConfig> | McpConfig[] | null = null;

  if (typeof decl === 'string') {
    const filePath = normalisePath(decl);
    const fullPath = [pluginRoot, filePath].filter(Boolean).join('/');
    const text = await readFile(fullPath, remoteBase, root);
    try {
      const parsed = text ? JSON.parse(text) as Record<string, unknown> : null;
      if (parsed && !Array.isArray(parsed) && parsed['mcpServers']) {
        data = parsed['mcpServers'] as Record<string, McpConfig>;
      } else {
        data = parsed as McpConfig[] | null;
      }
    } catch { data = null; }
  } else if (decl !== null && decl !== undefined) {
    data = decl;
  }

  if (data === null) {
    const mcpJsonPath = [pluginRoot, '.mcp.json'].filter(Boolean).join('/');
    const text = await readFile(mcpJsonPath, remoteBase, root);
    if (text) {
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        data = (parsed['mcpServers'] ?? parsed) as Record<string, McpConfig>;
      } catch { /* leave data null */ }
    }
  }

  if (!data) return [];

  const entries: Array<McpConfig & { name: string }> = Array.isArray(data)
    ? (data as McpConfig[]).filter((m): m is McpConfig & { name: string } => !!m.name)
    : Object.entries(data).map(([name, cfg]) => ({ name, ...cfg }));

  return entries.map(m => parseMcpServer(m, pluginEntry, owner, repo));
}

interface MarketplaceJson {
  plugins?: PluginEntry[];
  bundles?: Bundle[];
}

export async function fetchMarketplaceSkills(owner: string, repo: string, root: string): Promise<MarketplaceResult> {
  const branch  = 'master';
  const baseUrl = `${RAW_BASE}/${owner}/${repo}/${branch}`;

  console.log(`  Fetching ${owner}/${repo}…`);

  let marketplaceJson: MarketplaceJson;
  try {
    marketplaceJson = await fetchJson<MarketplaceJson>(`${baseUrl}/.claude-plugin/marketplace.json`);
  } catch (err) {
    console.warn(`  [warn] Could not fetch marketplace.json for ${owner}/${repo}: ${(err as Error).message}`);
    return { skills: [], agents: [], mcpServers: [], bundles: [], plugins: [] };
  }

  const skills:     Skill[]     = [];
  const agents:     Agent[]     = [];
  const mcpServers: McpServer[] = [];
  const plugins:    Plugin[]    = [];

  for (const pluginEntry of marketplaceJson.plugins ?? []) {
    const { pluginRoot, remoteBase } = resolveSource(
      pluginEntry.source, pluginEntry, owner, repo, branch
    );

    const pluginJsonPath = [pluginRoot, '.claude-plugin/plugin.json'].filter(Boolean).join('/');

    let pluginJson: PluginJson | null = null;
    try {
      const text = await readFile(pluginJsonPath, remoteBase, root);
      if (text) pluginJson = JSON.parse(text) as PluginJson;
    } catch {
      console.warn(`  [warn] Could not parse plugin.json at ${pluginJsonPath}`);
    }

    const skillsDecl = pluginJson?.skills  ?? pluginEntry.skills  ?? null;
    const agentsDecl = pluginJson?.agents  ?? pluginEntry.agents  ?? null;
    const mcpsDecl   = pluginJson?.mcpServers ?? pluginEntry.mcpServers ?? null;

    const foundSkills     = await discoverSkills(skillsDecl, pluginRoot, remoteBase, root, pluginEntry, owner, repo);
    const foundAgents     = await discoverAgents(agentsDecl, pluginRoot, remoteBase, root, pluginEntry, owner, repo);
    const foundMcpServers = await discoverMcpServers(mcpsDecl, pluginRoot, remoteBase, root, pluginEntry, owner, repo);

    skills.push(...foundSkills);
    agents.push(...foundAgents);
    mcpServers.push(...foundMcpServers);

    plugins.push({
      name:           pluginEntry.name,
      description:    pluginEntry.description ?? '',
      category:       pluginEntry.category ?? null,
      homepage:       pluginEntry.homepage ?? null,
      skills:         foundSkills.map(s => s.name),
      agents:         foundAgents.map(a => a.name),
      mcpServers:     foundMcpServers.map(m => m.name),
      installCommand: `/plugin install ${pluginEntry.name}@${repo}`,
      source:         { owner, repo, repoUrl: `https://github.com/${owner}/${repo}` },
    });
  }

  skills.sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name));

  const bundles = (marketplaceJson.bundles ?? []).map(b => ({
    ...b,
    source: { owner, repo, repoUrl: `https://github.com/${owner}/${repo}` },
  }));

  console.log(`  ✓ ${plugins.length} plugins, ${skills.length} skills, ${agents.length} agents, ${mcpServers.length} MCP servers from ${owner}/${repo}`);
  return { plugins, skills, agents, mcpServers, bundles };
}
