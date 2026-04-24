/* lib/catalog.js — generates the CATALOG.md content from aggregated skills and bundles */

function titleCase(str) {
  return str.replace(/-/g, ' ').replace(/(^|\s)(\w)/g, (_, sep, c) => sep + c.toUpperCase());
}

function skillRow(skill) {
  const src = `${skill.source.owner}/${skill.source.repo}`;
  const ro  = skill.readOnly ? '✓' : '';
  return `| [\`${skill.name}\`](${skill.rawSkillUrl}) | \`${src}\` | ${skill.description} | ${ro} | \`${skill.installCommand}\` |`;
}

function bundleSection(bundle) {
  const src   = `${bundle.source.owner}/${bundle.source.repo}`;
  const lines = bundle.skills.map(name => `/plugin install ${name}@${bundle.source.repo}`);
  return [
    `### ${bundle.name} _(${src})_`,
    ``,
    `_${bundle.description}_`,
    ``,
    '```',
    ...lines,
    '```',
    ``,
  ];
}

export function generateCatalog(skills, bundles, marketplaces) {
  const date       = new Date().toISOString().slice(0, 10);
  const categories = [...new Set(skills.map(s => s.category))].sort();

  const lines = [
    `# Skill Catalog`,
    ``,
    `> ${skills.length} skills from ${marketplaces.length} marketplace(s) · Last updated: ${date}`,
    ``,
    ...marketplaces.map(m => `- [\`${m.owner}/${m.repo}\`](https://github.com/${m.owner}/${m.repo})`),
    ``,
    `---`,
    ``,
    `## By Category`,
    ``,
  ];

  for (const category of categories) {
    const group = skills.filter(s => s.category === category);
    lines.push(`### ${titleCase(category)} (${group.length})`, ``);
    lines.push(`| Skill | Marketplace | What it does | Read-only | Install |`);
    lines.push(`|---|---|---|---|---|`);
    group.forEach(s => lines.push(skillRow(s)));
    lines.push(``);
  }

  lines.push(`---`, ``, `## By Bundle`, ``);
  bundles.forEach(b => lines.push(...bundleSection(b)));

  return lines.join('\n');
}
