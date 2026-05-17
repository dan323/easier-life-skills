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
  marketplaces?: string[];
}

export interface Index {
  skills: Skill[];
  bundles: Bundle[];
  meta: IndexMeta;
}
