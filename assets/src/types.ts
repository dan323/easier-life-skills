export interface Source {
  owner: string;
  repo:  string;
  repoUrl: string;
}

export interface Plugin {
  name:           string;
  description:    string;
  category:       string | null;
  homepage:       string | null;
  skills:         string[];
  agents:         string[];
  mcpServers:     string[];
  installCommand: string;
  source:         Source;
  _repo?:         string;
}

export interface Skill {
  name:           string;
  description:    string;
  category:       string | null;
  keywords:       string[];
  readOnly:       boolean;
  rawSkillUrl:    string;
  installCommand: string;
  source:         Source;
  bundles?:       string[];
  _repo?:         string;
}

export interface Agent {
  name:           string;
  description:    string;
  tools:          string[];
  background:     boolean;
  rawAgentUrl:    string;
  installCommand: string;
  source:         Source;
  _repo?:         string;
}

export interface McpServer {
  name:           string;
  description:    string;
  command:        string;
  installCommand: string;
  source:         Source;
  _repo?:         string;
}

export interface Bundle {
  name:        string;
  description: string;
  skills:      string[];
  _repo?:      string;
}

export interface SkillsIndexMeta {
  generated:      string;
  marketplaces:   string[];
  pluginCount:    number;
  skillCount:     number;
  agentCount:     number;
  mcpServerCount: number;
}

export interface SkillsIndex {
  meta:       SkillsIndexMeta;
  plugins:    Plugin[];
  skills:     Skill[];
  agents:     Agent[];
  mcpServers: McpServer[];
  bundles:    Bundle[];
}
