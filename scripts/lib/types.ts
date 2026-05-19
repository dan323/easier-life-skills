/* lib/types.ts — shared domain types */

export interface PluginSource {
  owner: string;
  repo: string;
  repoUrl: string;
}

/**
 * One user-submitted review of a skill. The shape mirrors the structured
 * Discussions reply parsed by `scripts/ingest-ratings.ts` (Phase 5 of the
 * Skill Rating & Review System, see docs/architecture.md → Ratings &
 * Reviews). `stars` is 1-5 inclusive; `body` is the free-form review text.
 */
export interface Review {
  stars: number;
  body: string;
  /** GitHub login of the reviewer (no email, no other PII). */
  author: string;
  /** ISO 8601 timestamp of the original Discussions reply. */
  date: string;
}

/**
 * Aggregate rating for one skill. `avg` is the mean of `reviews[].stars`,
 * rounded to one decimal; `count` is `reviews.length`. Both are stored even
 * though they are derivable from `reviews`, so the web UI can render the
 * badge without scanning the reviews array.
 */
export interface Rating {
  avg: number;
  count: number;
  reviews: Review[];
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
  /**
   * Optional aggregate rating. Present only for local-marketplace skills
   * that have at least one review in `ratings.json`. External-marketplace
   * skills do not carry ratings in v1.
   */
  rating?: Rating;
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

/**
 * A skill reference inside a bundle. A bare string keeps the historical
 * "match any skill with this name across all marketplaces" behaviour. The
 * object form lets bundle authors disambiguate when two plugins ship a
 * skill with the same name — narrowing by source repo and/or pluginName.
 */
export type BundleSkillRef =
  | string
  | { name: string; source?: { owner: string; repo: string }; pluginName?: string };

export interface Bundle {
  id?: string;
  name: string;
  description: string;
  skills: BundleSkillRef[];
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
