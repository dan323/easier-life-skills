/* lib/catalog.js — generates the CATALOG.md content from aggregated skills, agents, and MCP servers */

function titleCase(str) {
  return str.replace(/-/g, ' ').replace(/(^|\s)(\w)/g, (_, sep, c) => sep + c.toUpperCase());
}

function skillRow(skill) {
  const src = `${skill.source.owner}/${skill.source.repo}`;
  const ro  = skill.readOnly ? '✓' : '';
  return `| [\`${skill.name}\`](${skill.rawSkillUrl}) | \`${src}\` | ${skill.description} | ${ro} | \`${skill.installCommand}\` |`;
}

function agentRow(agent) {
  const src   = `${agent.source.owner}/${agent.source.repo}`;
  const tools = agent.tools.slice(0, 3).join(', ') + (agent.tools.length > 3 ? '…' : '');
  const bg    = agent.background ? '✓' : '';
  return `| [\`${agent.name}\`](${agent.rawAgentUrl}) | \`${src}\` | ${agent.description} | ${tools} | ${bg} | \`${agent.installCommand}\` |`;
}

function mcpRow(mcp) {
  const src = `${mcp.source.owner}/${mcp.source.repo}`;
  return `| \`${mcp.name}\` | \`${src}\` | ${mcp.description} | \`${mcp.command || ''}\` | \`${mcp.installCommand}\` |`;
}

function bundleSection(bundle) {
  const repo  = bundle.source?.repo || 'easier-life-skills';
  const lines = bundle.skills.map(name => `/plugin install ${name}@${repo}`);
  return [
    `### ${bundle.name}`,
    ``,
    `_${bundle.description}_`,
    ``,
    '```',
    ...lines,
    '```',
    ``,
  ];
}

export function generateCatalog(skills, agents, mcpServers, bundles, marketplaces) {
  const date       = new Date().toISOString().slice(0, 10);
  const categories = [...new Set(skills.map(s => s.category).filter(Boolean))].sort();

  const lines = [
    `# Skill Catalog`,
    ``,
    `> ${skills.length} skills · ${agents.length} agents · ${mcpServers.length} MCP servers from ${marketplaces.length} marketplace(s) · Last updated: ${date}`,
    ``,
    ...marketplaces.map(m => `- [\`${m.owner}/${m.repo}\`](https://github.com/${m.owner}/${m.repo})`),
    ``,
    `---`,
    ``,
    `## Skills by Category`,
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

  if (agents.length > 0) {
    lines.push(`---`, ``, `## Agents`, ``);
    lines.push(`| Agent | Marketplace | What it does | Tools | Background | Install |`);
    lines.push(`|---|---|---|---|---|---|`);
    agents.forEach(a => lines.push(agentRow(a)));
    lines.push(``);
  }

  if (mcpServers.length > 0) {
    lines.push(`---`, ``, `## MCP Servers`, ``);
    lines.push(`| Server | Marketplace | What it does | Command | Install |`);
    lines.push(`|---|---|---|---|---|`);
    mcpServers.forEach(m => lines.push(mcpRow(m)));
    lines.push(``);
  }

  if (bundles.length > 0) {
    lines.push(`---`, ``, `## By Bundle`, ``);
    bundles.forEach(b => lines.push(...bundleSection(b)));
  }

  return lines.join('\n');
}
