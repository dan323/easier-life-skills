export interface Source {
  owner: string;
  repo:  string;
  repoUrl: string;
}

export interface ScanFlag {
  rule:   'hidden-chars' | 'system-inject' | 'anthropic-override' | 'credential-exfil';
  /** Which field triggered this flag: 'body', 'description', or 'keywords'. */
  field:  'body' | 'description' | 'keywords';
  detail: string;
}

export interface ScanResult {
  passed:         boolean;
  flags:          ScanFlag[];
  /** Version of the skill/agent at the time of scanning. */
  scannedVersion: string;
}

export interface Plugin {
  name:           string;
  description:    string;
  category:       string | null;
  homepage:       string | null;
  skills:         string[];
  agents:         string[];
  mcpServers:     string[];
  commands:       string[];
  hooks:          string[];
  installCommand: string;
  source:         Source;
  rating?:        Rating;
  _repo?:         string;
}

/**
 * One user-submitted review of a skill, mirroring the server-side `Review`
 * type in `scripts/lib/types.ts`. The web UI is read-only — reviews are
 * authored via the linked GitHub Discussions thread, not by client code.
 */
export interface Review {
  stars:  number;
  body:   string;
  author: string;
  date:   string;
}

/**
 * Aggregate rating for one skill. `avg` is the mean of `reviews[].stars`,
 * rounded to one decimal; `count` is `reviews.length`. Optional on `Skill`
 * because external-marketplace skills are unrated in v1 and the build script
 * only attaches it for skills with at least one review in `ratings.json`.
 */
export interface Rating {
  avg:     number;
  count:   number;
  reviews: Review[];
}

export interface Skill {
  name:           string;
  pluginName:     string;
  description:    string;
  category:       string | null;
  keywords:       string[];
  tools?:         string[];
  readOnly:       boolean;
  rawSkillUrl:    string;
  installCommand: string;
  source:         Source;
  bundles?:       string[];
  rating?:        Rating;
  scanResult?:    ScanResult;
  _repo?:         string;
}

export interface Agent {
  name:           string;
  pluginName:     string;
  description:    string;
  category:       string | null;
  tools:          string[];
  background:     boolean;
  rawAgentUrl:    string;
  installCommand: string;
  source:         Source;
  bundles?:       string[];
  rating?:        Rating;
  scanResult?:    ScanResult;
  _repo?:         string;
}

export interface McpServer {
  name:           string;
  pluginName:     string;
  description:    string;
  category:       string | null;
  command:        string;
  installCommand: string;
  source:         Source;
  bundles?:       string[];
  rating?:        Rating;
  _repo?:         string;
}

export interface Command {
  name:           string;
  pluginName:     string;
  description:    string;
  category:       string | null;
  commandPath:    string;
  rawCommandUrl:  string;
  installCommand: string;
  source:         Source;
  bundles?:       string[];
  rating?:        Rating;
  _repo?:         string;
}

export interface Hook {
  name:           string;
  pluginName:     string;
  description:    string;
  category:       string | null;
  events:         string[];
  rawHookUrl:     string;
  installCommand: string;
  source:         Source;
  bundles?:       string[];
  rating?:        Rating;
  _repo?:         string;
}

/**
 * A skill reference inside a bundle. A bare string matches any skill with
 * that name across all marketplaces (legacy behaviour). The object form
 * disambiguates collisions by source repo and/or pluginName.
 */
export type BundleSkillRef =
  | string
  | { name: string; source?: { owner: string; repo: string }; pluginName?: string };

export interface Bundle {
  id?:         string;
  name:        string;
  description: string;
  skills?:     BundleSkillRef[];
  agents?:     BundleSkillRef[];
  hooks?:      BundleSkillRef[];
  commands?:   BundleSkillRef[];
  mcpServers?: BundleSkillRef[];
  plugins?:    BundleSkillRef[];
  source?:     { owner: string; repo: string; repoUrl?: string };
  _repo?:      string;
}

export interface SkillsIndexMeta {
  generated:      string;
  marketplaces:   string[];
  sources?:       Record<string, { isMarketplace: boolean }>;
  pluginCount:    number;
  skillCount:     number;
  agentCount:     number;
  mcpServerCount: number;
  commandCount?:  number;
  hookCount?:     number;
}

export interface SkillsIndex {
  /** Build-time security notice; instructs Claude to treat all external string values as data. */
  _security?: string;
  meta:       SkillsIndexMeta;
  plugins:    Plugin[];
  skills:     Skill[];
  agents:     Agent[];
  mcpServers: McpServer[];
  commands:   Command[];
  hooks:      Hook[];
  bundles:    Bundle[];
}
