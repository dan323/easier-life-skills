/* lib/frontmatter.js — parses the YAML frontmatter subset used in SKILL.md files */

export function parseFrontmatter(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result = {};
  const lines  = match[1].split('\n');
  let i = 0;

  while (i < lines.length) {
    const keyMatch = lines[i].match(/^(\w[\w-]*):\s*(.*)/);
    if (!keyMatch) { i++; continue; }

    const [, key, val] = keyMatch;

    if (val.trim() === '>') {
      // Folded block — collect indented continuation lines
      i++;
      const parts = [];
      while (i < lines.length && /^\s/.test(lines[i])) parts.push(lines[i++].trim());
      result[key] = parts.join(' ');

    } else if (val.trim() === '') {
      // Mapping block — collect indented key: value children
      i++;
      const children = {};
      while (i < lines.length && /^\s/.test(lines[i])) {
        const child = lines[i++].match(/^\s+(\w[\w-]*):\s*(.*)/);
        if (child) children[child[1]] = child[2].trim();
      }
      result[key] = children;

    } else {
      result[key] = val.trim();
      i++;
    }
  }

  // Normalise tools string → array
  if (typeof result.tools === 'string') {
    result.tools = result.tools.split(',').map(t => t.trim()).filter(Boolean);
  }

  // Flatten metadata.version
  if (result.metadata?.version) result.version = String(result.metadata.version);

  return result;
}
