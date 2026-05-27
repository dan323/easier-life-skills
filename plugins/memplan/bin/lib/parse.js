'use strict';

const fs = require('fs');

/**
 * Parse a single MemScript line.
 * Returns { timestamp, appendOnly, key, rawValue } or null for blank/comment lines.
 */
function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  let rest = trimmed;
  let timestamp = null;

  if (rest.startsWith('~')) {
    const spaceIdx = rest.indexOf(' ');
    if (spaceIdx === -1) return null;
    timestamp = rest.slice(0, spaceIdx);
    rest = rest.slice(spaceIdx + 1).trimStart();
  }

  let appendOnly = false;
  if (rest.startsWith('+')) {
    appendOnly = true;
    rest = rest.slice(1);
  }

  const colonIdx = rest.indexOf(':');
  if (colonIdx === -1) return null;

  const key = rest.slice(0, colonIdx).trim();
  if (!/^[a-z][a-z0-9-]*$/.test(key)) return null;

  const rawValue = rest.slice(colonIdx + 1);
  return { timestamp, appendOnly, key, rawValue };
}

/** Parse all lines in a .mem file. Returns array of parsed entries. */
function parseFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8').split('\n')
    .map(parseLine)
    .filter(Boolean);
}

/** Parse a FeedScript param string: key=value or key="quoted value". */
function parseFeedParams(str) {
  const params = {};
  const re = /([a-z][a-z0-9-]*)=("([^"]*?)"|(\S+))/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    params[m[1]] = m[3] !== undefined ? m[3] : m[4];
  }
  return params;
}

module.exports = { parseLine, parseFile, parseFeedParams };
