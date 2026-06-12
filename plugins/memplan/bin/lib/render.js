'use strict';

const fs = require('fs');
const { GENERATED_HEADER, SCHEMAS } = require('./constants');
const { parseLine } = require('./parse');
const { lockFile, unlockFile } = require('./io');

/** Step id comparison: numeric with decimal sub-steps (1 < 2 < 3 < 3.1 < 4). */
function compareStepIds(a, b) {
  const aParts = String(a).split('.').map(Number);
  const bParts = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const av = aParts[i] ?? 0;
    const bv = bParts[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/** Strip MemScript integer prefix and expand pipe-separated lists. */
function renderValue(rawValue) {
  if (!rawValue) return '*(empty)*';
  if (rawValue.startsWith('#')) return rawValue.slice(1);
  if (rawValue.includes('|')) return rawValue.split('|').join(', ');
  return rawValue;
}

/** kebab-case-text → Sentence case text */
function kebabToReadable(text) {
  if (!text) return text;
  const spaced = text.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function keyToLabel(key) {
  return key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Format a single append-only log entry into a readable markdown list item. */
function formatLogEntry(key, rawValue, timestamp) {
  const ts = timestamp ? ` _(${timestamp.slice(0, 10)})_` : '';

  switch (key) {
    case 'entity': {
      const nameM = rawValue.match(/(?:^|,)name=([^,]+)/);
      const typeM = rawValue.match(/(?:^|,)type=([^,]+)/);
      const descM = rawValue.match(/(?:^|,)desc=([^,]+)/);
      const name = nameM ? nameM[1] : rawValue;
      const type = typeM ? ` _(${typeM[1]})_` : '';
      const desc = descM ? ` — ${descM[1]}` : '';
      return `- **${name}**${type}${desc}${ts}`;
    }
    case 'fact':
      return `- ${rawValue}${ts}`;
    case 'failure': {
      const cmdM = rawValue.match(/(?:^|,)cmd=([^,]+)/);
      const reasonM = rawValue.match(/(?:^|,)reason=([^,]+)/);
      const cmd = cmdM ? `\`${cmdM[1]}\`` : rawValue;
      const reason = reasonM ? ` — ${reasonM[1]}` : '';
      return `- ${cmd}${reason}${ts}`;
    }
    case 'question': {
      const textM = rawValue.match(/(?:^|,)text=([^,]+)/);
      const statusM = rawValue.match(/(?:^|,)status=([^,]+)/);
      const text = textM ? textM[1] : rawValue;
      const resolved = statusM && statusM[1] === 'resolved';
      return resolved ? `- ~~${text}~~${ts}` : `- ${text}${ts}`;
    }
    case 'decision': {
      const choiceM = rawValue.match(/(?:^|,)choice=([^,]+)/);
      const reasonM = rawValue.match(/(?:^|,)reason=([^,]+)/);
      const choice = choiceM ? choiceM[1] : rawValue;
      const reason = reasonM ? ` — ${reasonM[1]}` : '';
      return `- **${choice}**${reason}${ts}`;
    }
    case 'load': {
      const fileM = rawValue.match(/(?:^|,)file=([^,]+)/);
      const tokensM = rawValue.match(/(?:^|,)tokens=([^,]+)/);
      const file = fileM ? fileM[1] : rawValue;
      const tokens = tokensM ? ` (${tokensM[1]} tokens)` : '';
      return `- ${file}${tokens}${ts}`;
    }
    case 'approve':
      return `- Approved: ${rawValue}${ts}`;
    case 'inbox':
      return `- Inbox processed: ${rawValue}${ts}`;
    case 'unknown-op':
      return `- ⚠ Unknown op: ${rawValue}${ts}`;
    default:
      return `- **${keyToLabel(key)}:** ${renderValue(rawValue)}${ts}`;
  }
}

/**
 * Convert a .mem file to .plan.md markdown content.
 * Returns the rendered string (including GENERATED_HEADER).
 */
function renderMem(filePath, relFile) {
  const entries = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf8').split('\n').map(parseLine).filter(Boolean)
    : [];

  const schema = SCHEMAS[relFile] || { mutables: [] };
  const mutKeys = schema.mutables;
  const alphaKeys = schema.alphaKeys || false;

  const mutableMap = {};
  const appendEntries = [];
  const stepEntries = [];
  const otherMutableKeys = [];

  for (const entry of entries) {
    if (entry.appendOnly) {
      if (entry.key === 'step') {
        stepEntries.push(entry);
      } else {
        appendEntries.push(entry);
      }
    } else {
      mutableMap[entry.key] = entry.rawValue;
      if (!mutKeys.includes(entry.key) && !otherMutableKeys.includes(entry.key)) {
        otherMutableKeys.push(entry.key);
      }
    }
  }

  const lines = [GENERATED_HEADER, ''];
  const isRisk = relFile === 'risk.mem';
  const isPlan = relFile === 'plan.mem' || relFile === 'slice.mem';

  // Heading: use plan title as # if present, otherwise derive from filename
  if (isPlan && mutableMap['title']) {
    lines.push(`# ${kebabToReadable(mutableMap['title'])}`, '');
    // Render status + step-count as a compact summary line
    const statusVal = mutableMap['status'];
    const countVal = mutableMap['step-count'];
    const parts = [];
    if (statusVal) parts.push(`**Status:** ${kebabToReadable(statusVal)}`);
    if (countVal) parts.push(`**${renderValue(countVal)} steps**`);
    if (parts.length) {
      lines.push(`> ${parts.join(' · ')}`, '');
    }
  } else {
    const titleFromFile = relFile.replace(/\.mem$/, '').replace(/[-/]/g, ' ');
    lines.push(`## ${keyToLabel(titleFromFile)}`, '');

    const orderedKeys = [...mutKeys];
    if (alphaKeys) otherMutableKeys.sort();
    for (const k of otherMutableKeys) {
      if (!orderedKeys.includes(k)) orderedKeys.push(k);
    }

    let hasMutable = false;
    for (const key of orderedKeys) {
      const val = mutableMap[key];
      if (val === undefined || val === '') continue;
      if (isRisk) {
        lines.push(`> **${keyToLabel(key)}:** ${renderValue(val)}`);
        lines.push('');
      } else {
        lines.push(`**${keyToLabel(key)}:** ${renderValue(val)}  `);
      }
      hasMutable = true;
    }
    if (hasMutable && !isRisk) lines.push('');
  }

  // Steps section
  if (stepEntries.length > 0) {
    stepEntries.sort((a, b) => {
      const aId = (a.rawValue.match(/(?:^|,)id=([^,]+)/) || [])[1] || '';
      const bId = (b.rawValue.match(/(?:^|,)id=([^,]+)/) || [])[1] || '';
      return compareStepIds(aId, bId);
    });
    lines.push('### Steps', '');
    for (const step of stepEntries) {
      const idM = step.rawValue.match(/(?:^|,)id=([^,]+)/);
      const textM = step.rawValue.match(/(?:^|,)text=([^,]+)/);
      const depsM = step.rawValue.match(/(?:^|,)deps=([^,]+)/);
      const refinedM = step.rawValue.match(/(?:^|,)refined=true/);
      const id = idM ? idM[1] : '?';
      const text = textM ? kebabToReadable(textM[1]) : step.rawValue;
      const notes = [];
      if (depsM) notes.push(`requires: ${depsM[1].replace(/\|/g, ', ')}`);
      if (refinedM) notes.push('has sub-steps');
      // atomic is intentionally omitted — implementation detail, not human-relevant
      const suffix = notes.length ? `  *(${notes.join('; ')})*` : '';
      lines.push(`${id}. ${text}${suffix}`);
    }
    lines.push('');
  }

  // Log section
  if (appendEntries.length > 0) {
    lines.push('### Log', '');
    const sorted = appendEntries.slice().sort((a, b) => {
      const at = a.timestamp || '';
      const bt = b.timestamp || '';
      return at < bt ? -1 : at > bt ? 1 : 0;
    });
    for (const e of sorted) {
      lines.push(formatLogEntry(e.key, e.rawValue, e.timestamp));
    }
    lines.push('');
  }

  if (!isPlan && !isRisk && stepEntries.length === 0 && appendEntries.length === 0 && Object.keys(mutableMap).every(k => !mutableMap[k])) {
    lines.push('*(empty)*', '');
  }
  if ((isPlan || isRisk) && stepEntries.length === 0 && appendEntries.length === 0 && !mutableMap['title'] && Object.keys(mutableMap).every(k => !mutableMap[k])) {
    lines.push('*(empty)*', '');
  }

  return lines.join('\n');
}

/**
 * Render a .mem file to its .plan.md counterpart (unlock → write → lock).
 */
function renderToPlanMd(memFilePath, planFilePath) {
  const relFile = memFilePath.replace(/\\/g, '/').split('/.memplan/')[1]
    || require('path').basename(memFilePath);
  const content = renderMem(memFilePath, relFile);
  unlockFile(planFilePath);
  fs.writeFileSync(planFilePath, content + '\n', 'utf8');
  lockFile(planFilePath);
}

module.exports = { renderMem, renderToPlanMd };
