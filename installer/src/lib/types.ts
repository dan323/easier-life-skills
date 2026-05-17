// Shared types for the installer.

export interface SkillSource {
  owner: string;
  repo: string;
  repoUrl: string;
}

export interface Skill {
  name: string;
  pluginName: string;
  description: string;
  keywords?: string[];
  readOnly?: boolean;
  source: SkillSource;
  installCommand?: string;
}

export interface Plugin {
  name: string;
  description: string;
  category?: string;
  source: SkillSource;
  skills?: string[];
  agents?: string[];
  hooks?: string[];
  commands?: string[];
  mcpServers?: string[];
  homepage?: string;
  installCommand?: string;
}

// Minimal shape needed to install: a plugin name + its source repo.
// Both Skill (via pluginName) and Plugin (via name) can produce one.
export interface Installable {
  pluginName: string;
  source: SkillSource;
}

export interface SourceMeta {
  isMarketplace?: boolean;
}

export type Sources = Record<string, SourceMeta | undefined>;

export interface BundleSkillRefObject {
  name: string;
  source?: { owner: string; repo: string };
  pluginName?: string;
}

export type BundleSkillRef = string | BundleSkillRefObject;

export interface Bundle {
  id?: string;
  name: string;
  description?: string;
  skills: BundleSkillRef[];
}

export interface InstalledPlugin {
  id: string;
  version: string;
}

export interface IndexMeta {
  sources?: Sources;
  skillCount: number;
  pluginCount?: number;
  marketplaces?: string[];
}

export interface Index {
  skills: Skill[];
  plugins?: Plugin[];
  bundles: Bundle[];
  meta: IndexMeta;
}
