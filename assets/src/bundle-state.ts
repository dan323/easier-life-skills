/**
 * bundle-state.ts — shared types and helpers for the custom bundle builder.
 *
 * A BundleItem identifies one card selected by the user. Items are keyed by
 * a stable `id` = "${kind}/${repo}/${pluginName?}/${name}" which is unique
 * across marketplaces and plugins. The
 * `installCommand` is stored separately and is used for install-script
 * deduplication (multiple skills from the same plugin share one command).
 */

export type BundleItemKind = 'skill' | 'agent' | 'mcpServer' | 'command' | 'hook' | 'plugin';

export interface BundleItem {
  /** Stable key — "${kind}/${repo}/${pluginName?}/${name}", unique per entity. */
  id:             string;
  name:           string;
  kind:           BundleItemKind;
  installCommand: string;
  /** The "owner/repo" string used to group marketplace-add commands. */
  repo:           string;
  /** Plugin scope for non-plugin entities (skills/agents/mcp/commands/hooks). */
  pluginName?:    string;
  /** Whether the source is a proper marketplace (vs plugin-only shim). */
  isMarketplace:  boolean;
}

/**
 * Build a stable collision-free bundle ID.
 */
export function buildBundleItemId(
  kind: BundleItemKind,
  name: string,
  repo: string,
  pluginName = '',
): string {
  const pluginScope = kind === 'plugin' ? '' : pluginName;
  return `${kind}/${repo}/${pluginScope}/${name}`;
}

/**
 * Encode a BundleItem to the compact URL token "name|installCommand|repo|kind|pluginName".
 * The separator is | which does not appear in Claude plugin command names.
 */
export function encodeItem(item: BundleItem): string {
  return [item.name, item.installCommand, item.repo, item.kind, item.pluginName ?? ''].join('|');
}

/**
 * Decode a URL token produced by encodeItem.  Returns null when the token
 * is malformed so old/corrupt URLs don't crash the app.
 */
export function decodeItem(token: string): BundleItem | null {
  const parts = token.split('|');
  if (parts.length < 4 || parts.length > 5) return null;
  const [name, installCommand, repo, kind, pluginName = ''] = parts;
  if (!name || !installCommand || !repo || !kind) return null;
  const validKinds: BundleItemKind[] = ['skill', 'agent', 'mcpServer', 'command', 'hook', 'plugin'];
  if (!validKinds.includes(kind as BundleItemKind)) return null;
  return {
    id:             buildBundleItemId(kind as BundleItemKind, name, repo, pluginName),
    name,
    kind:           kind as BundleItemKind,
    installCommand,
    repo,
    pluginName:     pluginName || undefined,
    isMarketplace:  true,   // will be refreshed by App once sources load
  };
}

/**
 * Build the install script for a set of bundle items.
 *
 * For marketplace sources the script uses `/plugin install …` commands.
 * For plugin-only shims the npx installer is referenced in a comment since
 * the manual path is too involved for a copyable one-liner.
 *
 * The script is grouped by repo so that a single
 * `claude plugin marketplace add` precedes every install from that repo.
 */
export function buildInstallScript(
  items:   BundleItem[],
  sources: Record<string, { isMarketplace: boolean }> = {},
): string {
  if (items.length === 0) return '';

  // Resolve isMarketplace against live sources data
  const resolved = items.map(item => ({
    ...item,
    isMarketplace: sources[item.repo]?.isMarketplace !== false,
  }));

  const marketplace  = resolved.filter(i => i.isMarketplace);
  const pluginOnly   = resolved.filter(i => !i.isMarketplace);

  const lines: string[] = [];

  // Deduplicate install commands (same plugin may cover multiple skills)
  const seen = new Set<string>();
  for (const item of marketplace) {
    if (!seen.has(item.installCommand)) {
      lines.push(item.installCommand);
      seen.add(item.installCommand);
    }
  }

  if (pluginOnly.length > 0) {
    if (lines.length > 0) lines.push('');
    const pluginNames = [...new Set(pluginOnly.map(i => i.name))];
    lines.push(
      `# The following items come from plugin-only repos — install via npx:`,
      `# npx @dan323/easier-life-skills --bundle <bundle-name>`,
      ...pluginNames.map(n => `# (includes: ${n})`),
    );
  }

  return lines.join('\n');
}
