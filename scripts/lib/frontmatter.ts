/* lib/frontmatter.ts — parses the YAML frontmatter subset used in SKILL.md files */

export interface Frontmatter {
  version?: string;
  description?: string;
  tools?: string[];
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

    if (val.trim() === '>') {
      i++;
      const parts: string[] = [];
      while (i < lines.length && /^\s/.test(lines[i]!)) parts.push(lines[i++]!.trim());
      result[key] = parts.join(' ');

    } else if (val.trim() === '') {
      i++;
      const children: Record<string, string> = {};
      while (i < lines.length && /^\s/.test(lines[i]!)) {
        const child = lines[i++]!.match(/^\s+(\w[\w-]*):\s*(.*)/);
        if (child) children[child[1]!] = child[2]!.trim();
      }
      result[key] = children;

    } else {
      result[key] = val.trim();
      i++;
    }
  }

  if (typeof result['tools'] === 'string') {
    result['tools'] = result['tools'].split(',').map(t => t.trim()).filter(Boolean);
  }

  const metadata = result['metadata'];
  if (metadata && typeof metadata === 'object' && 'version' in metadata) {
    result['version'] = String((metadata as Record<string, unknown>)['version']);
  }

  return result as Frontmatter;
}
