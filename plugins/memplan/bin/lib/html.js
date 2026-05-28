'use strict';

const fs = require('fs');
const path = require('path');

const HTML_CSS = `
:root {
  --mp-bg: #f9fafb;
  --mp-surface: #ffffff;
  --mp-border: #e5e7eb;
  --mp-text: #111827;
  --mp-muted: #6b7280;
  --mp-done: #16a34a;
  --mp-progress: #2563eb;
  --mp-blocked: #dc2626;
  --mp-skipped: #9ca3af;
  --mp-risk-bg: #fef9c3;
  --mp-risk-border: #ca8a04;
  --mp-question-bg: #fff7ed;
  --mp-question-border: #ea580c;
}

body {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  max-width: 800px;
  margin: 0 auto;
  padding: 0 1rem;
  background: var(--mp-bg);
  color: var(--mp-text);
  line-height: 1.6;
}

.mp-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 0;
  border-bottom: 1px solid var(--mp-border);
  margin-bottom: 1.5rem;
}

.mp-file-name {
  font-weight: 600;
  font-size: 0.9rem;
}

.mp-generated {
  font-size: 0.75rem;
  color: var(--mp-muted);
  margin-left: auto;
}

.mp-index-link {
  font-size: 0.85rem;
  color: var(--mp-progress);
  text-decoration: none;
}

.mp-index-link:hover {
  text-decoration: underline;
}

.mp-content {
  background: var(--mp-surface);
  padding: 1.5rem;
  border-radius: 0.5rem;
  border: 1px solid var(--mp-border);
}

.mp-footer {
  text-align: center;
  font-size: 0.75rem;
  color: var(--mp-muted);
  padding: 1.5rem 0;
}

h1, h2, h3 {
  font-weight: 600;
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
}

h1 {
  font-size: 1.5rem;
  margin-top: 0;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--mp-border);
}

h2 {
  font-size: 1.2rem;
  color: var(--mp-text);
}

h3 {
  font-size: 1rem;
  color: var(--mp-text);
}

p, li {
  font-size: 0.9rem;
  line-height: 1.6;
}

.generated {
  font-size: 0.75rem;
  color: var(--mp-muted);
  font-style: italic;
  margin-bottom: 1.5rem;
}

ul, ol {
  padding-left: 1.5rem;
  margin: 0.5rem 0;
}

li {
  margin: 0.25rem 0;
}

.badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  margin-left: 0.5rem;
}

.badge-done {
  background: var(--mp-done);
  color: white;
}

.badge-in-progress {
  background: var(--mp-progress);
  color: white;
}

.badge-blocked {
  background: var(--mp-blocked);
  color: white;
}

.badge-skipped {
  background: var(--mp-skipped);
  color: white;
}

.badge-pending {
  background: var(--mp-border);
  color: var(--mp-text);
}

dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.5rem 1rem;
  margin: 1rem 0;
}

dt {
  font-weight: 600;
  font-size: 0.85rem;
}

dd {
  margin: 0;
  font-size: 0.85rem;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
  font-size: 0.85rem;
}

th {
  text-align: left;
  padding: 0.5rem;
  background: var(--mp-bg);
  border-bottom: 2px solid var(--mp-border);
  font-weight: 600;
}

td {
  padding: 0.5rem;
  border-bottom: 1px solid var(--mp-border);
}

.callout {
  margin: 1rem 0;
  padding: 1rem;
  border-left: 4px solid;
  border-radius: 0.25rem;
}

.callout-risk {
  background: var(--mp-risk-bg);
  border-color: var(--mp-risk-border);
}

.callout-question {
  background: var(--mp-question-bg);
  border-color: var(--mp-question-border);
}

.callout p {
  margin: 0.25rem 0;
}

.callout p:first-child {
  margin-top: 0;
}

.callout p:last-child {
  margin-bottom: 0;
}

.index-item {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  background: var(--mp-surface);
  border: 1px solid var(--mp-border);
  border-radius: 0.25rem;
}

.index-item a {
  font-weight: 600;
  text-decoration: none;
  color: var(--mp-progress);
  font-size: 0.95rem;
}

.index-item a:hover {
  text-decoration: underline;
}

.index-status {
  margin-left: auto;
}

.index-subtitle {
  font-size: 0.8rem;
  color: var(--mp-muted);
  flex-basis: 100%;
}
`;

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineMd(s) {
  // First escape HTML, then handle status badges, then inline formatting
  let result = esc(s);

  // Handle status badges: [done], [in-progress], [blocked], [skipped], [pending]
  result = result.replace(/\[(done|in-progress|blocked|skipped|pending)\]/gi, (match, status) => {
    const normalized = status.toLowerCase();
    return `<span class="badge badge-${normalized}">${normalized}</span>`;
  });

  // Handle bold and italic
  result = result
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');

  return result;
}

function mdToHtml(markdown, relPath) {
  const lines = markdown.split('\n');
  const out = [];
  let inList = false;
  let inTable = false;
  let inBlockquote = false;
  let tableHeaders = [];
  let blockquoteLines = [];

  function closeList() {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  }

  function closeTable() {
    if (inTable) {
      out.push('</tbody></table>');
      inTable = false;
      tableHeaders = [];
    }
  }

  function closeBlockquote() {
    if (inBlockquote) {
      // Determine callout type based on content
      const content = blockquoteLines.join('\n');
      const isRisk = /\b(risk|break|irreversible|verify|danger)\b/i.test(content);
      const calloutClass = isRisk ? 'callout-risk' : 'callout-question';

      out.push(`<aside class="callout ${calloutClass}">`);
      blockquoteLines.forEach(line => {
        out.push(`<p>${inlineMd(line)}</p>`);
      });
      out.push('</aside>');

      inBlockquote = false;
      blockquoteLines = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines but use them to close blocks
    if (!trimmed) {
      closeList();
      closeTable();
      closeBlockquote();
      continue;
    }

    // Handle generated comment
    if (line.startsWith('<!-- ')) {
      closeList();
      closeTable();
      closeBlockquote();
      out.push(`<p class="generated">${esc(line.replace(/<!--\s*|\s*-->/g, ''))}</p>`);
      continue;
    }

    // Handle H1 (title)
    if (line.startsWith('# ')) {
      closeList();
      closeTable();
      closeBlockquote();
      out.push(`<h1>${esc(line.slice(2))}</h1>`);
      continue;
    }

    // Handle H2
    if (line.startsWith('## ')) {
      closeList();
      closeTable();
      closeBlockquote();
      out.push(`<h2>${esc(line.slice(3))}</h2>`);
      continue;
    }

    // Handle H3
    if (line.startsWith('### ')) {
      closeList();
      closeTable();
      closeBlockquote();
      out.push(`<h3>${esc(line.slice(4))}</h3>`);
      continue;
    }

    // Handle blockquotes
    if (line.startsWith('> ')) {
      closeList();
      closeTable();
      if (!inBlockquote) {
        inBlockquote = true;
      }
      blockquoteLines.push(line.slice(2));
      continue;
    } else if (inBlockquote) {
      closeBlockquote();
    }

    // Handle tables
    if (line.startsWith('|')) {
      closeList();

      const cells = line.split('|').map(c => c.trim()).filter(c => c);

      // Check if next line is a separator
      const nextLine = lines[i + 1];
      const isSeparator = nextLine && /^\|[\s\-:|]+\|/.test(nextLine);

      if (isSeparator && !inTable) {
        // This is a header row
        tableHeaders = cells;
        out.push('<table><thead><tr>');
        cells.forEach(cell => {
          out.push(`<th>${esc(cell)}</th>`);
        });
        out.push('</tr></thead><tbody>');
        inTable = true;
        i++; // Skip separator line
        continue;
      } else if (inTable) {
        // This is a data row
        out.push('<tr>');

        // Check if this is a key-value table (has exactly 2 columns with "Key" and "Value" headers)
        const isKeyValue = tableHeaders.length === 2 &&
                          tableHeaders[0].toLowerCase() === 'key' &&
                          tableHeaders[1].toLowerCase() === 'value';

        if (isKeyValue && cells.length === 2) {
          // Render as <dt><dd> structure embedded in table
          out.push(`<td>${esc(cells[0])}</td>`);
          out.push(`<td>${inlineMd(cells[1])}</td>`);
        } else {
          // Regular table cells
          cells.forEach(cell => {
            out.push(`<td>${inlineMd(cell)}</td>`);
          });
        }

        out.push('</tr>');
        continue;
      }
    } else if (inTable) {
      closeTable();
    }

    // Handle numbered lists
    if (/^\d+\./.test(line)) {
      closeTable();
      closeBlockquote();
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      const content = line.replace(/^\d+\.\s*/, '');
      out.push(`<li>${inlineMd(content)}</li>`);
      continue;
    }

    // Handle indented sub-steps (detect by leading spaces before number)
    if (/^\s+\d+\./.test(line)) {
      closeTable();
      closeBlockquote();
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      const content = line.trim().replace(/^\d+\.\s*/, '');
      out.push(`<li style="margin-left: 1.5rem;">${inlineMd(content)}</li>`);
      continue;
    }

    // Handle bullet lists
    if (line.startsWith('- ')) {
      closeTable();
      closeBlockquote();
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inlineMd(line.slice(2))}</li>`);
      continue;
    }

    // Regular paragraph
    closeList();
    closeTable();
    closeBlockquote();
    out.push(`<p>${inlineMd(trimmed)}</p>`);
  }

  // Close any remaining open blocks
  closeList();
  closeTable();
  closeBlockquote();

  return out.join('\n');
}

function htmlPage(title, body, relPath) {
  const now = new Date().toISOString();
  const filename = path.basename(relPath);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${esc(title)} — memplan</title>
  <style>${HTML_CSS}</style>
</head>
<body>
  <header class="mp-header">
    <span class="mp-file-name">${esc(filename)}</span>
    <span class="mp-generated">Generated ${now}</span>
    <a class="mp-index-link" href="index.html">← All plans</a>
  </header>
  <main class="mp-content">
${body}
  </main>
  <footer class="mp-footer">
    Generated by memplan — edit via .memplan/inbox/
  </footer>
</body>
</html>
`;
}

function findPlanMds(startDir) {
  const result = [];
  if (!fs.existsSync(startDir)) return result;
  for (const entry of fs.readdirSync(startDir, { withFileTypes: true })) {
    const full = path.join(startDir, entry.name);
    if (entry.isDirectory()) result.push(...findPlanMds(full));
    else if (entry.name.endsWith('.plan.md')) result.push(full);
  }
  return result;
}

function extractMetadata(content) {
  // Extract status from table or inline
  const statusMatch = content.match(/\|\s*status\s*\|\s*([^\|\n]+)\s*\|/i) ||
                     content.match(/status:\s*([^\n]+)/i);
  const status = statusMatch ? statusMatch[1].trim() : null;

  // Extract next-action or title for subtitle
  const nextActionMatch = content.match(/\|\s*next-action\s*\|\s*([^\|\n]+)\s*\|/i) ||
                         content.match(/next-action:\s*([^\n]+)/i);
  const titleMatch = content.match(/\|\s*title\s*\|\s*([^\|\n]+)\s*\|/i) ||
                    content.match(/^#\s+(.+)$/m);

  const subtitle = nextActionMatch ? nextActionMatch[1].trim() :
                  titleMatch ? titleMatch[1].trim() : null;

  return { status, subtitle };
}

const PIN_ORDER = ['plan.plan.md', 'checkpoint.plan.md', 'slice.plan.md'];

function cmdHtml(dir, args) {
  const mp = path.join(dir, '.memplan');
  let outDir = null;
  let singleFile = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) outDir = args[++i];
    if (args[i] === '--file' && args[i + 1]) singleFile = args[++i];
  }

  function convertOne(planMdPath) {
    const content = fs.readFileSync(planMdPath, 'utf8');
    const relPath = path.relative(mp, planMdPath);
    const title = relPath.replace(/\.plan\.md$/, '');
    const body = mdToHtml(content, relPath);
    const html = htmlPage(title, body, relPath);
    const htmlName = planMdPath.replace(/\.plan\.md$/, '.plan.html');
    const dest = outDir ? path.join(outDir, path.relative(mp, htmlName)) : htmlName;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, html, 'utf8');

    const metadata = extractMetadata(content);

    return { relPath, dest, status: metadata.status, subtitle: metadata.subtitle };
  }

  const planMds = singleFile
    ? [path.join(mp, singleFile)]
    : findPlanMds(mp);
  const converted = planMds.map(convertOne);

  converted.sort((a, b) => {
    const aPin = PIN_ORDER.indexOf(path.basename(a.relPath));
    const bPin = PIN_ORDER.indexOf(path.basename(b.relPath));
    if (aPin !== -1 && bPin !== -1) return aPin - bPin;
    if (aPin !== -1) return -1;
    if (bPin !== -1) return 1;
    return a.relPath < b.relPath ? -1 : 1;
  });

  const indexItems = converted.map(({ relPath, dest, status, subtitle }) => {
    const relHtml = path.relative(outDir || mp, dest).replace(/\\/g, '/');
    const name = relPath.replace(/\.plan\.md$/, '');

    let statusBadge = '';
    if (status && status !== '—' && status !== '(empty)') {
      const normalized = status.toLowerCase();
      const badgeClass = ['done', 'in-progress', 'blocked', 'skipped', 'pending'].includes(normalized)
        ? `badge-${normalized}`
        : 'badge-pending';
      statusBadge = `<span class="badge ${badgeClass}">${esc(status)}</span>`;
    }

    let subtitleHtml = '';
    if (subtitle && subtitle !== '—' && subtitle !== '(empty)') {
      subtitleHtml = `<span class="index-subtitle">${esc(subtitle)}</span>`;
    }

    return `<div class="index-item">
  <a href="${relHtml}">${esc(name)}</a>
  ${statusBadge ? `<span class="index-status">${statusBadge}</span>` : ''}
  ${subtitleHtml}
</div>`;
  }).join('\n');

  const indexDest = outDir ? path.join(outDir, 'index.html') : path.join(mp, 'index.html');
  fs.mkdirSync(path.dirname(indexDest), { recursive: true });

  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>memplan dashboard</title>
  <style>${HTML_CSS}</style>
</head>
<body>
  <main class="mp-content" style="margin-top: 2rem;">
    <h1>memplan dashboard</h1>
    <div style="margin-top: 1.5rem;">
${indexItems}
    </div>
  </main>
  <footer class="mp-footer">
    Generated by memplan — edit via .memplan/inbox/
  </footer>
</body>
</html>
`;

  fs.writeFileSync(indexDest, indexHtml, 'utf8');

  console.log(`html: ${converted.length} file(s) converted, index written`);
}

module.exports = { cmdHtml };
