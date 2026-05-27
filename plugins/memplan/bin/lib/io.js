'use strict';

const fs = require('fs');
const path = require('path');

function lockFile(filePath) {
  try { fs.chmodSync(filePath, 0o444); } catch (_) {}
}

function unlockFile(filePath) {
  try { fs.chmodSync(filePath, 0o644); } catch (_) {}
}

function memDir(dir) {
  return path.join(dir, '.memplan');
}

function memPath(dir, file) {
  return path.join(memDir(dir), file);
}

function planPath(dir, file) {
  const base = file.replace(/\.mem$/, '');
  return path.join(memDir(dir), `${base}.plan.md`);
}

module.exports = { lockFile, unlockFile, memDir, memPath, planPath };
