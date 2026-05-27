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

function renderValue(rawValue) {
  if (!rawValue) return '*(empty)*';
  if (rawValue.includes('|')) return rawValue.split('|').join(', ');
  return rawValue;
}

function keyToLabel(key) {
  return key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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
  const title = relFile.replace(/\.mem$/, '').replace(/[-/]/g, ' ');
  lines.push(`## ${keyToLabel(title)}`, '');

  const orderedKeys = [...mutKeys];
  if (alphaKeys) otherMutableKeys.sort();
  for (const k of otherMutableKeys) {
    if (!orderedKeys.includes(k)) orderedKeys.push(k);
  }

  let hasMutable = false;
  for (const key of orderedKeys) {
    const val = mutableMap[key];
    if (val === undefined || val === '') continue;
    lines.push(`**${keyToLabel(key)}**: ${renderValue(val)}  `);
    hasMutable = true;
  }
  if (hasMutable) lines.push('');

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
      const atomicM = step.rawValue.match(/(?:^|,)atomic=true/);
      const id = idM ? idM[1] : '?';
      const text = textM ? textM[1] : step.rawValue;
      const notes = [];
      if (depsM) notes.push(`deps: ${depsM[1].replace(/\|/g, ', ')}`);
      if (atomicM) notes.push('atomic');
      const suffix = notes.length ? `  *(${notes.join('; ')})*` : '';
      lines.push(`${id}. ${text}${suffix}`);
    }
    lines.push('');
  }

  if (appendEntries.length > 0) {
    lines.push('### Log', '');
    const sorted = appendEntries.slice().sort((a, b) => {
      const at = a.timestamp || '';
      const bt = b.timestamp || '';
      return at < bt ? -1 : at > bt ? 1 : 0;
    });
    for (const e of sorted) {
      const ts = e.timestamp ? `${e.timestamp} ` : '';
      lines.push(`- ${ts}+${e.key}: ${renderValue(e.rawValue)}`);
    }
    lines.push('');
  }

  if (!hasMutable && stepEntries.length === 0 && appendEntries.length === 0) {
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
