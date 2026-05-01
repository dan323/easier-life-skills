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
  command: string;
  args: string[];
  env: Record<string, string>;
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
  bundles: Bundle[];
}
