/* lib/catalog.ts — generates CATALOG.md and catalog.html content from aggregated skills, agents, MCP servers, commands, hooks, and bundles */

import type { Skill, Agent, McpServer, Command, Hook, Bundle, MarketplaceEntry } from './types.js';

function titleCase(str: string): string {
  return str.replace(/-/g, ' ').replace(/(^|\s)(\w)/g, (_, sep, c) => sep + c.toUpperCase());
}

/**
 * Group entities by category, returning sorted [category, items] pairs.
 * Entities with no category land in a trailing "Uncategorized" group.
 */
function groupByCategory<T extends { category: string | null }>(items: T[]): Array<[string, T[]]> {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = item.category ?? '__uncategorized__';
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(item);
  }
  const named = [...buckets.entries()]
    .filter(([k]) => k !== '__uncategorized__')
    .sort(([a], [b]) => a.localeCompare(b));
  const uncategorized = buckets.get('__uncategorized__');
  if (uncategorized && uncategorized.length > 0) named.push(['__uncategorized__', uncategorized]);
  return named;
}

function categoryLabel(key: string): string {
  return key === '__uncategorized__' ? 'Uncategorized' : titleCase(key);
}

function summariseTools(tools: string[]): string {
  return tools.slice(0, 3).join(', ') + (tools.length > 3 ? '…' : '');
}

function skillRow(skill: Skill): string {
  const src   = `${skill.source.owner}/${skill.source.repo}`;
  const tools = summariseTools(skill.tools);
  const ro    = skill.readOnly ? '✓' : '';
  return `| [\`${skill.name}\`](${skill.rawSkillUrl}) | \`${src}\` | ${skill.description} | ${tools} | ${ro} | \`${skill.installCommand}\` |`;
}

function agentRow(agent: Agent): string {
  const src   = `${agent.source.owner}/${agent.source.repo}`;
  const tools = summariseTools(agent.tools);
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

function commandRow(cmd: Command): string {
  const src = `${cmd.source.owner}/${cmd.source.repo}`;
  return `| [\`${cmd.name}\`](${cmd.rawCommandUrl}) | \`${src}\` | ${cmd.description} | \`${cmd.installCommand}\` |`;
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
  commands: Command[],
  hooks: Hook[],
  bundles: Bundle[],
  marketplaces: MarketplaceEntry[],
): string {
  const date = new Date().toISOString().slice(0, 10);

  const lines: string[] = [
    `# Skill Catalog`,
    ``,
    `> ${skills.length} skills · ${agents.length} agents · ${mcpServers.length} MCP servers · ${commands.length} commands · ${hooks.length} hooks from ${marketplaces.length} marketplace(s) · Last updated: ${date}`,
    ``,
    ...marketplaces.map(m => `- [\`${m.owner}/${m.repo}\`](https://github.com/${m.owner}/${m.repo})`),
    ``,
    `---`,
    ``,
    `## Skills by Category`,
    ``,
  ];

  for (const [category, group] of groupByCategory(skills)) {
    lines.push(`### ${categoryLabel(category)} (${group.length})`, ``);
    lines.push(`| Skill | Marketplace | What it does | Tools | Read-only | Install |`);
    lines.push(`|---|---|---|---|---|---|`);
    group.forEach(s => lines.push(skillRow(s)));
    lines.push(``);
  }

  if (agents.length > 0) {
    lines.push(`---`, ``, `## Agents by Category`, ``);
    for (const [category, group] of groupByCategory(agents)) {
      lines.push(`### ${categoryLabel(category)} (${group.length})`, ``);
      lines.push(`| Agent | Marketplace | What it does | Tools | Background | Install |`);
      lines.push(`|---|---|---|---|---|---|`);
      group.forEach(a => lines.push(agentRow(a)));
      lines.push(``);
    }
  }

  if (mcpServers.length > 0) {
    lines.push(`---`, ``, `## MCP Servers by Category`, ``);
    for (const [category, group] of groupByCategory(mcpServers)) {
      lines.push(`### ${categoryLabel(category)} (${group.length})`, ``);
      lines.push(`| Server | Marketplace | What it does | Command | Install |`);
      lines.push(`|---|---|---|---|---|`);
      group.forEach(m => lines.push(mcpRow(m)));
      lines.push(``);
    }
  }

  if (commands.length > 0) {
    lines.push(`---`, ``, `## Commands by Category`, ``);
    for (const [category, group] of groupByCategory(commands)) {
      lines.push(`### ${categoryLabel(category)} (${group.length})`, ``);
      lines.push(`| Command | Marketplace | What it does | Install |`);
      lines.push(`|---|---|---|---|`);
      group.forEach(c => lines.push(commandRow(c)));
      lines.push(``);
    }
  }

  if (hooks.length > 0) {
    lines.push(`---`, ``, `## Hooks by Category`, ``);
    for (const [category, group] of groupByCategory(hooks)) {
      lines.push(`### ${categoryLabel(category)} (${group.length})`, ``);
      lines.push(`| Hook | Marketplace | What it does | Events | Install |`);
      lines.push(`|---|---|---|---|---|`);
      group.forEach(h => lines.push(hookRow(h)));
      lines.push(``);
    }
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
    esc(summariseTools(skill.tools)),
    skill.readOnly ? '✓' : '',
    code(skill.installCommand),
  ];
}

function agentRowHtml(agent: Agent): string[] {
  return [
    `<a href="${esc(agent.rawAgentUrl)}"><code>${esc(agent.name)}</code></a>`,
    code(`${agent.source.owner}/${agent.source.repo}`),
    esc(agent.description),
    esc(summariseTools(agent.tools)),
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

function commandRowHtml(cmd: Command): string[] {
  return [
    `<a href="${esc(cmd.rawCommandUrl)}"><code>${esc(cmd.name)}</code></a>`,
    code(`${cmd.source.owner}/${cmd.source.repo}`),
    esc(cmd.description),
    code(cmd.installCommand),
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
  commands: Command[],
  hooks: Hook[],
  bundles: Bundle[],
  marketplaces: MarketplaceEntry[],
): string {
  const date = new Date().toISOString().slice(0, 10);

  const sections: string[] = [];

  sections.push(`<header class="catalog-header">
  <div>
    <h1>Skill Catalog</h1>
    <p class="catalog-summary">${skills.length} skills · ${agents.length} agents · ${mcpServers.length} MCP servers · ${commands.length} commands · ${hooks.length} hooks from ${marketplaces.length} marketplace(s) · Last updated: ${esc(date)}</p>
  </div>
  <a class="btn-gh" href="./" aria-label="Back to marketplace">← Back to marketplace</a>
</header>`);

  sections.push(`<section aria-labelledby="marketplaces-heading">
  <h2 id="marketplaces-heading" class="sr-only">Marketplaces</h2>
  <ul class="catalog-marketplaces">
${marketplaces.map(m => `    <li><a href="https://github.com/${esc(m.owner)}/${esc(m.repo)}"><code>${esc(m.owner)}/${esc(m.repo)}</code></a></li>`).join('\n')}
  </ul>
</section>`);

  function categorisedSection<T extends { category: string | null }>(
    headingId: string,
    headingText: string,
    items: T[],
    headers: string[],
    rowFn: (t: T) => string[],
  ): string {
    const parts: string[] = [`<section aria-labelledby="${headingId}">`, `  <h2 id="${headingId}">${esc(headingText)}</h2>`];
    for (const [category, group] of groupByCategory(items)) {
      parts.push(`  <h3>${esc(categoryLabel(category))} <span class="count-chip">${group.length}</span></h3>`);
      parts.push('  ' + tableEl(headers, group.map(rowFn)).replace(/\n/g, '\n  '));
    }
    parts.push('</section>');
    return parts.join('\n');
  }

  sections.push(categorisedSection(
    'skills-heading', 'Skills by Category', skills,
    ['Skill', 'Marketplace', 'What it does', 'Tools', 'Read-only', 'Install'], skillRowHtml,
  ));

  if (agents.length > 0) {
    sections.push(categorisedSection(
      'agents-heading', 'Agents by Category', agents,
      ['Agent', 'Marketplace', 'What it does', 'Tools', 'Background', 'Install'], agentRowHtml,
    ));
  }

  if (mcpServers.length > 0) {
    sections.push(categorisedSection(
      'mcp-heading', 'MCP Servers by Category', mcpServers,
      ['Server', 'Marketplace', 'What it does', 'Command', 'Install'], mcpRowHtml,
    ));
  }

  if (commands.length > 0) {
    sections.push(categorisedSection(
      'commands-heading', 'Commands by Category', commands,
      ['Command', 'Marketplace', 'What it does', 'Install'], commandRowHtml,
    ));
  }

  if (hooks.length > 0) {
    sections.push(categorisedSection(
      'hooks-heading', 'Hooks by Category', hooks,
      ['Hook', 'Marketplace', 'What it does', 'Events', 'Install'], hookRowHtml,
    ));
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
