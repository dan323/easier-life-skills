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

type BundleRef = string | { name: string };
interface BundleShape {
  id?:         string;
  name:        string;
  skills?:     BundleRef[];
  agents?:     BundleRef[];
  hooks?:      BundleRef[];
  commands?:   BundleRef[];
  mcpServers?: BundleRef[];
  plugins?:    BundleRef[];
}

/**
 * If every item in the custom bundle is covered by a single named bundle,
 * return that bundle (so the UI can suggest it). Each item is matched against
 * the bundle's array for its kind.
 * Returns null if items is empty or spans multiple bundles / matches none.
 */
export function findContainingBundle(
  items:   BundleItem[],
  bundles: BundleShape[],
): { id?: string; name: string } | null {
  if (items.length === 0) return null;

  const refNames = (refs: BundleRef[] | undefined) =>
    new Set((refs ?? []).map(r => typeof r === 'string' ? r : r.name));

  for (const bundle of bundles) {
    const covered = items.every(item => {
      switch (item.kind) {
        case 'skill':     return refNames(bundle.skills).has(item.name);
        case 'agent':     return refNames(bundle.agents).has(item.name);
        case 'hook':      return refNames(bundle.hooks).has(item.name);
        case 'command':   return refNames(bundle.commands).has(item.name);
        case 'mcpServer': return refNames(bundle.mcpServers).has(item.name);
        case 'plugin':    return refNames(bundle.plugins).has(item.name);
        default:          return false;
      }
    });
    if (covered) return bundle;
  }
  return null;
}

/**
 * Build the install script for a set of bundle items.
 *
 * For marketplace sources the script emits deduplicated install commands
 * (multiple items from the same plugin may share one command).
 * For plugin-only shims the npx installer is referenced in a comment since
 * the manual path is too involved for a copyable one-liner.
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

  // Emit marketplace-add commands first (one per unique repo), then install commands
  const seenRepos = new Set<string>();
  const seenCmds  = new Set<string>();

  for (const item of marketplace) {
    if (!seenRepos.has(item.repo)) {
      lines.push(`/plugin marketplace add ${item.repo}`);
      seenRepos.add(item.repo);
    }
  }
  if (seenRepos.size > 0) lines.push('');
  for (const item of marketplace) {
    if (!seenCmds.has(item.installCommand)) {
      lines.push(item.installCommand);
      seenCmds.add(item.installCommand);
    }
  }

  if (pluginOnly.length > 0) {
    if (lines.length > 0) lines.push('');
    // Plugin-only repos require the npx installer to create a shim marketplace.
    // Deduplicate by plugin name (skills/agents/etc. share their parent plugin).
    const pluginNames = [...new Set(pluginOnly.map(i =>
      i.kind === 'plugin' ? i.name : (i.pluginName ?? i.name)
    ))];
    for (const name of pluginNames) {
      lines.push(`npx @dan323/easier-life-skills --plugin ${name}`);
    }
  }

  return lines.join('\n');
}
