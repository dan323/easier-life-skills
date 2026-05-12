/* lib/catalog.ts — generates CATALOG.md and catalog.html content from aggregated skills, agents, MCP servers, hooks, and bundles */

import type { Skill, Agent, McpServer, Hook, Bundle, MarketplaceEntry } from './types.js';

function titleCase(str: string): string {
  return str.replace(/-/g, ' ').replace(/(^|\s)(\w)/g, (_, sep, c) => sep + c.toUpperCase());
}

function skillRow(skill: Skill): string {
  const src = `${skill.source.owner}/${skill.source.repo}`;
  const ro  = skill.readOnly ? '✓' : '';
  return `| [\`${skill.name}\`](${skill.rawSkillUrl}) | \`${src}\` | ${skill.description} | ${ro} | \`${skill.installCommand}\` |`;
}

function agentRow(agent: Agent): string {
  const src   = `${agent.source.owner}/${agent.source.repo}`;
  const tools = agent.tools.slice(0, 3).join(', ') + (agent.tools.length > 3 ? '…' : '');
  const bg    = agent.background ? '✓' : '';
  return `| [\`${agent.name}\`](${agent.rawAgentUrl}) | \`${src}\` | ${agent.description} | ${tools} | ${bg} | \`${agent.installCommand}\` |`;
}

function mcpRow(mcp: McpServer): string {
  const src = `${mcp.source.owner}/${mcp.source.repo}`;
  return `| \`${mcp.name}\` | \`${src}\` | ${mcp.description} | \`${mcp.command || ''}\` | \`${mcp.installCommand}\` |`;
}

function hookRow(hook: Hook): string {
  const src    = `${hook.source.owner}/${hook.source.repo}`;
  const events = hook.events.join(', ') || '—';
  return `| [\`${hook.name}\`](${hook.rawHookUrl}) | \`${src}\` | ${hook.description} | ${events} | \`${hook.installCommand}\` |`;
}

function bundleSection(bundle: Bundle, allSkills: Skill[]): string[] {
  const lines = bundle.skills.map(name => {
    const skill = allSkills.find(s => s.name === name);
    const repo  = skill?.source.repo ?? bundle.source?.repo ?? 'easier-life-skills';
    return `/plugin install ${name}@${repo}`;
  });
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

export function generateCatalog(
  skills: Skill[],
  agents: Agent[],
  mcpServers: McpServer[],
  hooks: Hook[],
  bundles: Bundle[],
  marketplaces: MarketplaceEntry[],
): string {
  const date       = new Date().toISOString().slice(0, 10);
  const categories = [...new Set(skills.map(s => s.category).filter(Boolean))].sort() as string[];

  const lines: string[] = [
    `# Skill Catalog`,
    ``,
    `> ${skills.length} skills · ${agents.length} agents · ${mcpServers.length} MCP servers · ${hooks.length} hooks from ${marketplaces.length} marketplace(s) · Last updated: ${date}`,
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

  if (hooks.length > 0) {
    lines.push(`---`, ``, `## Hooks`, ``);
    lines.push(`| Hook | Marketplace | What it does | Events | Install |`);
    lines.push(`|---|---|---|---|---|`);
    hooks.forEach(h => lines.push(hookRow(h)));
    lines.push(``);
  }

  if (bundles.length > 0) {
    lines.push(`---`, ``, `## By Bundle`, ``);
    bundles.forEach(b => lines.push(...bundleSection(b, skills)));
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML rendering — same data, styled to match the marketplace UI theme.
// ─────────────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function code(s: string): string { return `<code>${esc(s)}</code>`; }

function tableEl(headers: string[], rows: string[][]): string {
  const head = headers.map(h => `<th>${esc(h)}</th>`).join('');
  const body = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('\n');
  return `<table>\n  <thead><tr>${head}</tr></thead>\n  <tbody>\n${body}\n  </tbody>\n</table>`;
}

function skillRowHtml(skill: Skill): string[] {
  return [
    `<a href="${esc(skill.rawSkillUrl)}"><code>${esc(skill.name)}</code></a>`,
    code(`${skill.source.owner}/${skill.source.repo}`),
    esc(skill.description),
    skill.readOnly ? '✓' : '',
    code(skill.installCommand),
  ];
}

function agentRowHtml(agent: Agent): string[] {
  const tools = agent.tools.slice(0, 3).join(', ') + (agent.tools.length > 3 ? '…' : '');
  return [
    `<a href="${esc(agent.rawAgentUrl)}"><code>${esc(agent.name)}</code></a>`,
    code(`${agent.source.owner}/${agent.source.repo}`),
    esc(agent.description),
    esc(tools),
    agent.background ? '✓' : '',
    code(agent.installCommand),
  ];
}

function mcpRowHtml(mcp: McpServer): string[] {
  return [
    code(mcp.name),
    code(`${mcp.source.owner}/${mcp.source.repo}`),
    esc(mcp.description),
    code(mcp.command || ''),
    code(mcp.installCommand),
  ];
}

function hookRowHtml(hook: Hook): string[] {
  return [
    `<a href="${esc(hook.rawHookUrl)}"><code>${esc(hook.name)}</code></a>`,
    code(`${hook.source.owner}/${hook.source.repo}`),
    esc(hook.description),
    esc(hook.events.join(', ') || '—'),
    code(hook.installCommand),
  ];
}

function bundleSectionHtml(bundle: Bundle, allSkills: Skill[]): string {
  const installs = bundle.skills.map(name => {
    const skill = allSkills.find(s => s.name === name);
    const repo  = skill?.source.repo ?? bundle.source?.repo ?? 'easier-life-skills';
    return `/plugin install ${name}@${repo}`;
  }).join('\n');
  return [
    `<h3>${esc(bundle.name)}</h3>`,
    `<p class="bundle-desc"><em>${esc(bundle.description)}</em></p>`,
    `<pre><code>${esc(installs)}</code></pre>`,
  ].join('\n');
}

export function generateCatalogHtml(
  skills: Skill[],
  agents: Agent[],
  mcpServers: McpServer[],
  hooks: Hook[],
  bundles: Bundle[],
  marketplaces: MarketplaceEntry[],
): string {
  const date       = new Date().toISOString().slice(0, 10);
  const categories = [...new Set(skills.map(s => s.category).filter(Boolean))].sort() as string[];

  const sections: string[] = [];

  sections.push(`<header class="catalog-header">
  <div>
    <h1>Skill Catalog</h1>
    <p class="catalog-summary">${skills.length} skills · ${agents.length} agents · ${mcpServers.length} MCP servers · ${hooks.length} hooks from ${marketplaces.length} marketplace(s) · Last updated: ${esc(date)}</p>
  </div>
  <a class="btn-gh" href="./" aria-label="Back to marketplace">← Back to marketplace</a>
</header>`);

  sections.push(`<section aria-labelledby="marketplaces-heading">
  <h2 id="marketplaces-heading" class="sr-only">Marketplaces</h2>
  <ul class="catalog-marketplaces">
${marketplaces.map(m => `    <li><a href="https://github.com/${esc(m.owner)}/${esc(m.repo)}"><code>${esc(m.owner)}/${esc(m.repo)}</code></a></li>`).join('\n')}
  </ul>
</section>`);

  const skillsByCat: string[] = [`<section aria-labelledby="skills-heading">`, `  <h2 id="skills-heading">Skills by Category</h2>`];
  for (const category of categories) {
    const group = skills.filter(s => s.category === category);
    skillsByCat.push(`  <h3>${esc(titleCase(category))} <span class="count-chip">${group.length}</span></h3>`);
    skillsByCat.push('  ' + tableEl(
      ['Skill', 'Marketplace', 'What it does', 'Read-only', 'Install'],
      group.map(skillRowHtml),
    ).replace(/\n/g, '\n  '));
  }
  skillsByCat.push('</section>');
  sections.push(skillsByCat.join('\n'));

  if (agents.length > 0) {
    sections.push(`<section aria-labelledby="agents-heading">
  <h2 id="agents-heading">Agents</h2>
  ${tableEl(['Agent', 'Marketplace', 'What it does', 'Tools', 'Background', 'Install'], agents.map(agentRowHtml)).replace(/\n/g, '\n  ')}
</section>`);
  }

  if (mcpServers.length > 0) {
    sections.push(`<section aria-labelledby="mcp-heading">
  <h2 id="mcp-heading">MCP Servers</h2>
  ${tableEl(['Server', 'Marketplace', 'What it does', 'Command', 'Install'], mcpServers.map(mcpRowHtml)).replace(/\n/g, '\n  ')}
</section>`);
  }

  if (hooks.length > 0) {
    sections.push(`<section aria-labelledby="hooks-heading">
  <h2 id="hooks-heading">Hooks</h2>
  ${tableEl(['Hook', 'Marketplace', 'What it does', 'Events', 'Install'], hooks.map(hookRowHtml)).replace(/\n/g, '\n  ')}
</section>`);
  }

  if (bundles.length > 0) {
    sections.push(`<section aria-labelledby="bundles-heading">
  <h2 id="bundles-heading">By Bundle</h2>
${bundles.map(b => bundleSectionHtml(b, skills)).join('\n')}
</section>`);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Skill Catalog — easier-life-skills</title>
  <meta name="description" content="Full catalog of skills, agents, MCP servers, hooks, and bundles available in the easier-life-skills marketplace." />
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%230d1117'/><text x='16' y='23' font-size='20' font-weight='700' font-family='system-ui,sans-serif' fill='%2358a6ff' text-anchor='middle'>S</text></svg>" />
  <link rel="stylesheet" href="assets/style.css" />
</head>
<body class="catalog-page">
  <main>
${sections.join('\n\n')}
  </main>
  <footer>
    <span>Generated ${esc(date)}</span>
    <span>
      <a href="./">Back to marketplace</a> · <a href="https://github.com/${esc(marketplaces[0]?.owner ?? 'dan323')}/${esc(marketplaces[0]?.repo ?? 'easier-life-skills')}">GitHub</a>
    </span>
  </footer>
</body>
</html>
`;
}
