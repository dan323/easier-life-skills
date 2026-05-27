#!/usr/bin/env node
'use strict';

/**
 * memplan-cli.js — scripting layer for the memplan plugin.
 *
 * All mechanical file I/O in every skill delegates here. Skills provide reasoning
 * (what to write); this script provides mechanics (how to write it correctly).
 *
 * Usage: node memplan-cli.js <command> <dir> [args...]
 *
 * Commands: init, set, clear, append, render, render-all, lock, unlock,
 *           apply, inbox, deps-closure, deps-closure-append,
 *           stale-mark, stale-resolve, stale-list,
 *           overflow-check, progress, html
 */

const fs = require('fs');
const path = require('path');

const { PAIRED, AUTO_RENDER_ON_APPEND, INITIAL_DEPS, DEFAULT_LINE_CAP } = require('./lib/constants');
const { nowTs, todayDate } = require('./lib/time');
const { parseLine, parseFile } = require('./lib/parse');
const { lockFile, unlockFile, memDir, memPath, planPath } = require('./lib/io');
const { renderToPlanMd } = require('./lib/render');
const { parseDeps, computeClosure, writeDepsClosure } = require('./lib/deps');
const { applyFeedScript } = require('./lib/feedscript');
const { cmdHtml } = require('./lib/html');

// ─── Commands ─────────────────────────────────────────────────────────────────

function cmdInit(dir) {
  const mp = memDir(dir);
  if (fs.existsSync(mp)) {
    console.log('Already initialised');
    return;
  }

  for (const sub of ['memory', 'decisions', 'inbox', 'sessions']) {
    fs.mkdirSync(path.join(mp, sub), { recursive: true });
  }

  fs.writeFileSync(path.join(mp, 'progress'), '0/0 | not started\n', 'utf8');
  fs.writeFileSync(path.join(mp, 'branch-intent'), '(not set)\n', 'utf8');
  fs.writeFileSync(path.join(mp, 'deps.mem'), INITIAL_DEPS, 'utf8');
  fs.writeFileSync(path.join(mp, 'stale.mem'), '', 'utf8');

  for (const file of PAIRED) {
    const mPath = path.join(mp, file);
    fs.mkdirSync(path.dirname(mPath), { recursive: true });
    fs.writeFileSync(mPath, '', 'utf8');
    renderToPlanMd(mPath, planPath(dir, file));
  }

  const closure = computeClosure(parseDeps(path.join(mp, 'deps.mem')));
  writeDepsClosure(path.join(mp, 'deps-closure.mem'), closure);

  console.log('memplan: .memplan/ initialised with all Phase 1 stubs.');
}

function cmdSet(dir, file, keyOrValue, value) {
  const fPath = memPath(dir, file);

  // 3-arg form: write value directly to plain-text file (e.g. branch-intent, progress)
  if (value === undefined) {
    unlockFile(fPath);
    fs.writeFileSync(fPath, keyOrValue + '\n', 'utf8');
    lockFile(fPath);
    return;
  }

  // 4-arg form: mutable key replace in MemScript file
  const key = keyOrValue;
  let lines = fs.existsSync(fPath) ? fs.readFileSync(fPath, 'utf8').split('\n') : [];
  lines = lines.filter(l => {
    const parsed = parseLine(l);
    return !(parsed && !parsed.appendOnly && parsed.key === key);
  });
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  lines.push(`${key}:${value}`, '');

  unlockFile(fPath);
  fs.writeFileSync(fPath, lines.join('\n'), 'utf8');
  if (PAIRED.has(file)) renderToPlanMd(fPath, planPath(dir, file));
  lockFile(fPath);
}

function cmdClear(dir, file, key) {
  cmdSet(dir, file, key, '');
}

function cmdAppend(dir, file, key, value) {
  const fPath = memPath(dir, file);
  const ts = nowTs();
  const line = `${ts} +${key}:${value}\n`;

  const lineCount = fs.existsSync(fPath)
    ? fs.readFileSync(fPath, 'utf8').split('\n').filter(Boolean).length
    : 0;

  if (lineCount >= DEFAULT_LINE_CAP) {
    const overflowPath = memPath(dir, 'memory/overflow.mem');
    fs.appendFileSync(overflowPath, line, 'utf8');
    const qPath = memPath(dir, 'memory/questions.mem');
    const warn = `${ts} +cap-warning:file=${file},redirected-to=memory/overflow.mem\n`;
    if (fs.existsSync(qPath)) fs.appendFileSync(qPath, warn, 'utf8');
    return;
  }

  fs.appendFileSync(fPath, line, 'utf8');

  if (AUTO_RENDER_ON_APPEND.has(file) && PAIRED.has(file)) {
    renderToPlanMd(fPath, planPath(dir, file));
  }
}

function cmdRender(dir, file) {
  const mPath = memPath(dir, file);
  if (!fs.existsSync(mPath)) throw new Error(`File not found: ${mPath}`);
  if (!PAIRED.has(file)) throw new Error(`No .plan.md counterpart for: ${file}`);
  renderToPlanMd(mPath, planPath(dir, file));
  console.log(`rendered: ${file}`);
}

function cmdRenderAll(dir) {
  for (const file of PAIRED) {
    const mPath = memPath(dir, file);
    if (fs.existsSync(mPath)) renderToPlanMd(mPath, planPath(dir, file));
  }
  console.log('render-all: done');
}

function cmdLock(dir, file) { lockFile(memPath(dir, file)); }
function cmdUnlock(dir, file) { unlockFile(memPath(dir, file)); }

function cmdApply(dir, feedbackFile) {
  if (!fs.existsSync(feedbackFile)) throw new Error(`Feedback file not found: ${feedbackFile}`);
  applyFeedScript(dir, feedbackFile, cmdSet, cmdStaleResolve);
}

function cmdInbox(dir) {
  const inboxDir = path.join(memDir(dir), 'inbox');
  if (!fs.existsSync(inboxDir)) { console.log('inbox: 0 ops applied, 0 errors'); return; }

  const feedFiles = fs.readdirSync(inboxDir)
    .filter(f => f.endsWith('.feedback'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(inboxDir, f)).mtimeMs }))
    .sort((a, b) => a.mtime - b.mtime)
    .map(f => path.join(inboxDir, f.name));

  if (feedFiles.length === 0) { console.log('inbox: 0 ops applied, 0 errors'); return; }
  for (const ff of feedFiles) applyFeedScript(dir, ff, cmdSet, cmdStaleResolve);
}

function cmdDepsClosure(dir) {
  const deps = parseDeps(memPath(dir, 'deps.mem'));
  writeDepsClosure(memPath(dir, 'deps-closure.mem'), computeClosure(deps));
  console.log('deps-closure: updated');
}

function cmdDepsClosureAppend(dir, newFile, directDeps) {
  const deps = directDeps ? directDeps.split('|').filter(Boolean) : [];
  const closurePath = memPath(dir, 'deps-closure.mem');
  const existing = parseDeps(closurePath);

  const newClosure = new Set(deps);
  for (const dep of deps) {
    for (const t of existing[dep] || []) newClosure.add(t);
  }

  existing[newFile] = [...newClosure].sort();
  writeDepsClosure(closurePath, Object.fromEntries(
    Object.entries(existing).map(([k, v]) => [k, new Set(v)])
  ));
  console.log(`deps-closure-append: added ${newFile}`);
}

function cmdStaleMark(dir, file, because) {
  const line = `${nowTs()} +stale:file=${file},because=${because},session=${todayDate()}\n`;
  fs.appendFileSync(memPath(dir, 'stale.mem'), line, 'utf8');
}

function cmdStaleResolve(dir, file) {
  const line = `${nowTs()} +stale-resolved:file=${file},session=${todayDate()}\n`;
  fs.appendFileSync(memPath(dir, 'stale.mem'), line, 'utf8');
}

function cmdStaleList(dir) {
  const stalePath = memPath(dir, 'stale.mem');
  if (!fs.existsSync(stalePath)) { console.log('[]'); return; }

  const entries = parseFile(stalePath);
  const fileLastEvent = {};

  for (const e of entries) {
    if (e.appendOnly && (e.key === 'stale' || e.key === 'stale-resolved')) {
      const m = e.rawValue.match(/(?:^|,)file=([^,]+)/);
      if (m) {
        const f = m[1];
        if (!fileLastEvent[f] || (e.timestamp || '') >= (fileLastEvent[f].timestamp || '')) {
          fileLastEvent[f] = e;
        }
      }
    }
  }

  const unresolved = [];
  for (const [file, event] of Object.entries(fileLastEvent)) {
    if (event.key === 'stale') {
      const becauseM = event.rawValue.match(/(?:^|,)because=([^,]+)/);
      const sessionM = event.rawValue.match(/(?:^|,)session=([^,]+)/);
      unresolved.push({
        file,
        because: becauseM ? becauseM[1] : '',
        session: sessionM ? sessionM[1] : '',
        timestamp: event.timestamp || '',
      });
    }
  }

  console.log(JSON.stringify(unresolved, null, 2));
}

function cmdOverflowCheck(dir, file, cap) {
  const limit = parseInt(cap, 10);
  if (isNaN(limit)) throw new Error(`Invalid cap: ${cap}`);
  const fPath = memPath(dir, file);
  const count = fs.existsSync(fPath)
    ? fs.readFileSync(fPath, 'utf8').split('\n').filter(Boolean).length
    : 0;
  if (count >= limit) process.exit(1);
}

function cmdProgress(dir, m, n, text) {
  fs.writeFileSync(path.join(memDir(dir), 'progress'), `${m}/${n} | ${text}\n`, 'utf8');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd) { console.error('Usage: memplan-cli.js <command> [args]'); process.exit(1); }

try {
  switch (cmd) {
    case 'init':                  cmdInit(rest[0]); break;
    case 'set':                   cmdSet(rest[0], rest[1], rest[2], rest[3]); break;
    case 'clear':                 cmdClear(rest[0], rest[1], rest[2]); break;
    case 'append':                cmdAppend(rest[0], rest[1], rest[2], rest[3]); break;
    case 'render':                cmdRender(rest[0], rest[1]); break;
    case 'render-all':            cmdRenderAll(rest[0]); break;
    case 'lock':                  cmdLock(rest[0], rest[1]); break;
    case 'unlock':                cmdUnlock(rest[0], rest[1]); break;
    case 'apply':                 cmdApply(rest[0], rest[1]); break;
    case 'inbox':                 cmdInbox(rest[0]); break;
    case 'deps-closure':          cmdDepsClosure(rest[0]); break;
    case 'deps-closure-append':   cmdDepsClosureAppend(rest[0], rest[1], rest[2]); break;
    case 'stale-mark':            cmdStaleMark(rest[0], rest[1], rest[2]); break;
    case 'stale-resolve':         cmdStaleResolve(rest[0], rest[1]); break;
    case 'stale-list':            cmdStaleList(rest[0]); break;
    case 'overflow-check':        cmdOverflowCheck(rest[0], rest[1], rest[2]); break;
    case 'progress':              cmdProgress(rest[0], rest[1], rest[2], rest[3]); break;
    case 'html':                  cmdHtml(rest[0], rest.slice(1)); break;
    default:
      console.error(`Unknown command: ${cmd}`);
      process.exit(1);
  }
  process.exit(0);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
