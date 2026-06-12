#!/usr/bin/env node
// Read-only measurement harness for the memplan cost experiment (see ../WIP.md).
//
//   node measure-session.mjs <transcript.jsonl> [--project-root <path>]
//     → one JSON row of token/tool metrics for that session.
//
//   node measure-session.mjs --overhead [<plugin-dir>]
//     → standing per-session overhead of the plugin's skill descriptions
//       (bytes of every SKILL.md frontmatter `description` ÷ 4).
//
// The script only reads files the harness already wrote — no API access.
// It lives outside the skill payload, so it adds zero tokens to memplan.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Price ratios relative to input tokens (see WIP.md "weightedCost").
const WEIGHTS = { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 };

const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);

function fail(msg) {
  console.error(`measure-session: ${msg}`);
  process.exit(1);
}

// ─── Path matching ────────────────────────────────────────────────────────────

function normalizePath(p) {
  // Tolerate Windows/WSL/posix mixes: backslashes → slashes, case-folded,
  // and C:/… vs /c/… vs /mnt/c/… all reduced to c:/… so prefix checks work.
  let s = String(p).replace(/\\/g, '/').toLowerCase();
  const m = s.match(/^\/(?:mnt\/)?([a-z])\/(.*)$/);
  if (m) s = `${m[1]}:/${m[2]}`;
  return s.replace(/\/+$/, '');
}

function isProductiveEdit(toolName, input, projectRoot) {
  if (!EDIT_TOOLS.has(toolName)) return false;
  const fp = input && (input.file_path || input.notebook_path);
  if (!fp) return false;
  const norm = normalizePath(fp);
  if (norm.includes('/.memplan/')) return false; // memory writes are ceremony, not product
  if (projectRoot && !norm.startsWith(normalizePath(projectRoot) + '/')) return false;
  return true;
}

// ─── Transcript analysis ──────────────────────────────────────────────────────

function weighted(u) {
  return (
    (u.input_tokens || 0) * WEIGHTS.input +
    (u.output_tokens || 0) * WEIGHTS.output +
    (u.cache_creation_input_tokens || 0) * WEIGHTS.cacheWrite +
    (u.cache_read_input_tokens || 0) * WEIGHTS.cacheRead
  );
}

function measureTranscript(file, projectRoot) {
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);

  const totals = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };
  const toolCalls = { total: 0, byName: {} };
  // The harness writes one line per content block, all sharing message.id and
  // carrying the *same* usage object — count usage once per id or it inflates ~3-10×.
  const usageSeen = new Set();
  const blockSeen = new Set();
  let cumulativeWeighted = 0;
  let tokensBeforeFirstEdit = null;
  let assistantMessages = 0;

  for (const line of lines) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.type !== 'assistant' || !obj.message) continue;

    const msg = obj.message;
    const u = msg.usage;
    if (u && msg.id && !usageSeen.has(msg.id)) {
      usageSeen.add(msg.id);
      assistantMessages++;
      totals.inputTokens += u.input_tokens || 0;
      totals.outputTokens += u.output_tokens || 0;
      totals.cacheWriteTokens += u.cache_creation_input_tokens || 0;
      totals.cacheReadTokens += u.cache_read_input_tokens || 0;
      cumulativeWeighted += weighted(u);
    }

    for (const block of Array.isArray(msg.content) ? msg.content : []) {
      if (block.type !== 'tool_use') continue;
      const key = block.id || `${msg.id}:${block.name}:${JSON.stringify(block.input)}`;
      if (blockSeen.has(key)) continue;
      blockSeen.add(key);
      toolCalls.total++;
      toolCalls.byName[block.name] = (toolCalls.byName[block.name] || 0) + 1;
      if (tokensBeforeFirstEdit === null && isProductiveEdit(block.name, block.input, projectRoot)) {
        // Include the message that issued the edit, per the metric definition.
        tokensBeforeFirstEdit = Math.round(cumulativeWeighted);
      }
    }
  }

  return {
    transcript: path.basename(file),
    assistantMessages,
    ...totals,
    weightedCost: Math.round(cumulativeWeighted),
    toolCalls,
    firstProductiveEditFound: tokensBeforeFirstEdit !== null,
    // If no qualifying edit happened, the whole session was "before the first
    // edit" — report the full weighted cost so arm comparisons stay honest.
    tokensBeforeFirstEdit: tokensBeforeFirstEdit ?? Math.round(cumulativeWeighted),
  };
}

// ─── Standing overhead (metric 4) ────────────────────────────────────────────

function extractDescription(skillMd) {
  const m = skillMd.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fmLines = m[1].split(/\r?\n/);
  const start = fmLines.findIndex((l) => /^description\s*:/.test(l));
  if (start === -1) return null;
  const parts = [fmLines[start].replace(/^description\s*:\s*[>|][+-]?\s*$|^description\s*:\s*/, '')];
  for (let i = start + 1; i < fmLines.length; i++) {
    if (/^\S/.test(fmLines[i])) break; // next top-level key
    parts.push(fmLines[i].trim());
  }
  return parts.filter(Boolean).join(' ');
}

function measureOverhead(pluginDir) {
  const manifestPath = path.join(pluginDir, '.claude-plugin', 'plugin.json');
  if (!fs.existsSync(manifestPath)) fail(`no plugin manifest at ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const skills = [];
  let totalBytes = 0;
  for (const rel of manifest.skills || []) {
    const skillFile = path.join(pluginDir, rel, 'SKILL.md');
    const desc = extractDescription(fs.readFileSync(skillFile, 'utf8'));
    if (desc === null) fail(`no frontmatter description in ${skillFile}`);
    const bytes = Buffer.byteLength(desc, 'utf8');
    totalBytes += bytes;
    skills.push({ skill: path.basename(rel), descriptionBytes: bytes, approxTokens: Math.round(bytes / 4) });
  }

  return {
    plugin: manifest.name,
    version: manifest.version,
    skills,
    totalDescriptionBytes: totalBytes,
    approxTokensPerSession: Math.round(totalBytes / 4),
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help')) {
  console.error(
    'usage: measure-session.mjs <transcript.jsonl> [--project-root <path>]\n' +
      '       measure-session.mjs --overhead [<plugin-dir>]'
  );
  process.exit(args.includes('--help') ? 0 : 1);
}

if (args[0] === '--overhead') {
  const pluginDir = args[1] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  console.log(JSON.stringify(measureOverhead(pluginDir), null, 2));
} else {
  const file = args[0];
  if (!fs.existsSync(file)) fail(`transcript not found: ${file}`);
  let projectRoot = null;
  const ri = args.indexOf('--project-root');
  if (ri !== -1) {
    projectRoot = args[ri + 1];
    if (!projectRoot) fail('--project-root requires a path');
  }
  console.log(JSON.stringify(measureTranscript(file, projectRoot), null, 2));
}
