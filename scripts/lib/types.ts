/* lib/types.ts — shared domain types */

export interface PluginSource {
  owner: string;
  repo: string;
  repoUrl: string;
}

export interface Skill {
  name: string;
  pluginName: string;
  version: string;
  description: string;
  category: string | null;
  keywords: string[];
  tools: string[];
  readOnly: boolean;
  skillPath: string;
  rawSkillUrl: string;
  installCommand: string;
  source: PluginSource;
  bundles?: string[];
  _repo?: string;
}

export interface Agent {
  name: string;
  pluginName: string;
  description: string;
  category: string | null;
  tools: string[];
  background: boolean;
  agentPath: string;
  rawAgentUrl: string;
  installCommand: string;
  source: PluginSource;
  _repo?: string;
}

export interface McpServer {
  name: string;
  pluginName: string;
  description: string;
  category: string | null;
  command: string;
  args: string[];
  env: Record<string, string>;
  installCommand: string;
  source: PluginSource;
  _repo?: string;
}

export interface Command {
  name: string;
  pluginName: string;
  description: string;
  category: string | null;
  commandPath: string;
  rawCommandUrl: string;
  installCommand: string;
  source: PluginSource;
  _repo?: string;
}

export interface Hook {
  name: string;
  pluginName: string;
  description: string;
  category: string | null;
  events: string[];
  hookPath: string;
  rawHookUrl: string;
  installCommand: string;
  source: PluginSource;
  _repo?: string;
}

export interface Plugin {
  name: string;
  description: string;
  category: string | null;
  homepage: string | null;
  skills: string[];
  agents: string[];
  mcpServers: string[];
  commands: string[];
  hooks: string[];
  installCommand: string;
  source: PluginSource;
  _repo?: string;
}

export interface Bundle {
  id?: string;
  name: string;
  description: string;
  skills: string[];
  source?: { owner: string; repo: string; repoUrl: string };
  _repo?: string;
}

export interface MarketplaceEntry {
  owner: string;
  repo: string;
  description?: string;
}

export interface MarketplaceResult {
  plugins: Plugin[];
  skills: Skill[];
  agents: Agent[];
  mcpServers: McpServer[];
  commands: Command[];
  hooks: Hook[];
  bundles: Bundle[];
  /**
   * True if the source repo exposes `.claude-plugin/marketplace.json` and can be
   * registered via `claude plugin marketplace add <owner>/<repo>`.
   * False if it is a plugin-only repo (synthesised marketplace from `plugin.json`)
   * — those skills need to be cloned into `~/.claude/skills/<name>/` directly.
   */
  isMarketplace: boolean;
}
