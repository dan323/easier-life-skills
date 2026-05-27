'use strict';

const fs = require('fs');

/** Parse deps.mem or deps-closure.mem into { file: [deps] }. */
function parseDeps(filePath) {
  const deps = {};
  if (!fs.existsSync(filePath)) return deps;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const m = line.trim().match(/^dep:(.+?)=(.*)$/);
    if (!m) continue;
    deps[m[1]] = m[2] ? m[2].split('|') : [];
  }
  return deps;
}

/** Compute transitive closure. Returns { file: Set<dep> }. */
function computeClosure(deps) {
  const closure = {};
  const visiting = new Set();

  function visit(node) {
    if (closure[node]) return closure[node];
    if (visiting.has(node)) return new Set(); // cycle guard
    visiting.add(node);
    const direct = deps[node] || [];
    const result = new Set(direct);
    for (const dep of direct) {
      for (const trans of visit(dep)) result.add(trans);
    }
    visiting.delete(node);
    closure[node] = result;
    return result;
  }

  for (const key of Object.keys(deps)) visit(key);
  return closure;
}

/** Write closure map to deps-closure.mem. */
function writeDepsClosure(closurePath, closure) {
  const lines = Object.keys(closure).sort().map(k => {
    const depsStr = [...closure[k]].sort().join('|');
    return `dep:${k}=${depsStr}`;
  });
  fs.writeFileSync(closurePath, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
}

module.exports = { parseDeps, computeClosure, writeDepsClosure };
