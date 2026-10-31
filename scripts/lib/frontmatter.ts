/* lib/frontmatter.ts — parses the YAML frontmatter subset used in SKILL.md files */

export interface Frontmatter {
  version?: string;
  description?: string;
  tools?: string[];
  events?: string[] | string;
  background?: boolean | string;
  name?: string;
  [key: string]: unknown;
}

export function parseFrontmatter(content: string): Frontmatter {
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result: Record<string, unknown> = {};
  const lines  = match[1]!.split('\n');
  let i = 0;

  while (i < lines.length) {
    const keyMatch = lines[i]!.match(/^(\w[\w-]*):\s*(.*)/);
    if (!keyMatch) { i++; continue; }

    const [, key, val] = keyMatch as [string, string, string];

    if (/^[>|][+-]?$/.test(val.trim())) {
      const literal = val.trim().startsWith('|');
      i++;
      const parts: string[] = [];
      while (i < lines.length && /^\s/.test(lines[i]!)) parts.push(lines[i++]!.trim());
      result[key] = parts.join(literal ? '\n' : ' ');

    } else if (val.trim() === '') {
      i++;
      const children: Record<string, string> = {};
      const items: string[] = [];
      // YAML allows sequence items at the same column as their parent key.
      while (i < lines.length && (/^\s/.test(lines[i]!) || /^-(\s|$)/.test(lines[i]!))) {
        const line = lines[i++]!;
        const item = line.match(/^\s*-\s+(.*)/);
        if (item) { items.push(unquote(stripComment(item[1]!).trim())); continue; }
        const child = line.match(/^\s+(\w[\w-]*):\s*(.*)/);
        if (child) children[child[1]!] = child[2]!.trim();
      }
      result[key] = items.length > 0 ? items : children;

    } else {
      result[key] = parseScalar(val.trim());
      i++;
    }
  }

  // `allowed-tools` is the Agent Skills spelling of `tools`; keep an explicit `tools` if both exist.
  if (result['tools'] === undefined && result['allowed-tools'] !== undefined) {
    result['tools'] = result['allowed-tools'];
  }
  if (typeof result['tools'] === 'string') {
    let raw = stripComment(result['tools']).trim();
    // Whole value quoted, e.g. `allowed-tools: "Write"`
    if (raw.length >= 2 && (raw[0] === '"' || raw[0] === "'") && raw[raw.length - 1] === raw[0] && !raw.slice(1, -1).includes(raw[0])) {
      raw = raw.slice(1, -1);
    }
    result['tools'] = splitTools(raw).map(unquote);
  }

  const metadata = result['metadata'];
  if (metadata && typeof metadata === 'object' && 'version' in metadata) {
    result['version'] = String((metadata as Record<string, unknown>)['version']);
  }

  return result as Frontmatter;
}

/** Split a tool list on commas and/or whitespace, keeping scoped entries like `Bash(git add:*)` whole. */
function splitTools(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let depth = 0;
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === ',' || /\s/.test(ch))) {
      if (cur) out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function parseScalar(val: string): unknown {
  if (val.length >= 2 && val.startsWith('[') && val.endsWith(']')) {
    const inner = val.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map(s => unquote(s.trim())).filter(Boolean);
  }
  return val;
}

/** Remove a trailing YAML comment (` #...`), ignoring `#` inside quotes. */
function stripComment(s: string): string {
  let quote = '';
  for (let k = 0; k < s.length; k++) {
    const ch = s[k]!;
    if (quote) { if (ch === quote) quote = ''; }
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '#' && (k === 0 || /\s/.test(s[k - 1]!))) return s.slice(0, k);
  }
  return s;
}

const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);
const READONLY_BASH = /^(git\s+(log|diff|status|show|blame|branch|rev-parse|ls-files|describe)|ls|cat|head|tail|wc|grep|rg|pwd)(\s|:|$)/;

/** True if a tool entry can modify files. Scoped `Bash(...)` counts as writable unless its scope is a known read-only command. */
export function isWriteTool(entry: string): boolean {
  const m = entry.trim().match(/^([^(]*)\((.*)\)$/s);
  const name = (m ? m[1]! : entry).trim();
  if (WRITE_TOOLS.has(name)) return true;
  if (name === 'Bash' && m) return !READONLY_BASH.test(m[2]!.trim());
  return false;
}

function unquote(s: string): string {
  if (s.length >= 2) {
    const first = s[0];
    const last  = s[s.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return s.slice(1, -1);
    }
  }
  return s;
}
