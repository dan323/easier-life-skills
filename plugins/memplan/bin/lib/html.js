'use strict';

const fs = require('fs');
const path = require('path');

const HTML_CSS = `
body { font-family: system-ui, sans-serif; max-width: 860px; margin: 2rem auto; padding: 0 1rem; color: #1a1a2e; }
h1, h2, h3 { font-weight: 600; }
h1 { font-size: 1.4rem; border-bottom: 2px solid #e0e0f0; padding-bottom: 0.4rem; }
h2 { font-size: 1.1rem; color: #3a3a6e; margin-top: 1.5rem; }
h3 { font-size: 0.95rem; color: #5a5a8e; margin-top: 1rem; }
p, li { font-size: 0.9rem; line-height: 1.6; }
strong { color: #2a2a5e; }
em { color: #6a6a9e; font-style: normal; font-size: 0.85rem; }
ul { padding-left: 1.2rem; }
li { margin: 0.15rem 0; }
.generated { font-size: 0.75rem; color: #aaa; margin-bottom: 1.5rem; font-style: italic; }
.index-item { display: flex; align-items: baseline; gap: 0.5rem; padding: 0.25rem 0; border-bottom: 1px solid #f0f0f8; }
.index-item a { font-weight: 500; text-decoration: none; color: #2a4aaa; }
.index-item a:hover { text-decoration: underline; }
.index-path { font-size: 0.8rem; color: #999; }
`;

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineMd(s) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function mdToHtml(markdown) {
  const lines = markdown.split('\n');
  const out = [];
  let inList = false;

  for (const line of lines) {
    if (line.startsWith('<!-- ')) {
      out.push(`<p class="generated">${line.replace(/<!--\s*|\s*-->/g, '')}</p>`);
    } else if (line.startsWith('## ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h2>${esc(line.slice(3))}</h2>`);
    } else if (line.startsWith('### ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h3>${esc(line.slice(4))}</h3>`);
    } else if (line.startsWith('- ')) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inlineMd(line.slice(2))}</li>`);
    } else if (/^\d+\./.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inlineMd(line.replace(/^\d+\.\s*/, ''))}</li>`);
    } else if (line.trim()) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<p>${inlineMd(line)}</p>`);
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
    }
  }
  if (inList) out.push('</ul>');
  return out.join('\n');
}

function htmlPage(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${HTML_CSS}</style>
</head>
<body>${body}</body>
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
    const body = mdToHtml(content);
    const html = htmlPage(title, body);
    const htmlName = planMdPath.replace(/\.plan\.md$/, '.plan.html');
    const dest = outDir ? path.join(outDir, path.relative(mp, htmlName)) : htmlName;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, html, 'utf8');
    return { relPath, dest };
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

  const indexItems = converted.map(({ relPath, dest }) => {
    const relHtml = path.relative(outDir || mp, dest).replace(/\\/g, '/');
    const name = relPath.replace(/\.plan\.md$/, '');
    return `<div class="index-item"><a href="${relHtml}">${esc(name)}</a><span class="index-path">${esc(relPath)}</span></div>`;
  }).join('\n');

  const indexDest = outDir ? path.join(outDir, 'index.html') : path.join(mp, 'index.html');
  fs.mkdirSync(path.dirname(indexDest), { recursive: true });
  fs.writeFileSync(indexDest, htmlPage('memplan dashboard', `<h1>memplan dashboard</h1>\n${indexItems}`), 'utf8');

  console.log(`html: ${converted.length} file(s) converted, index written`);
}

module.exports = { cmdHtml };
