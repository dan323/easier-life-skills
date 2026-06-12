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
 *           stale-mark, stale-resolve, stale-list, stale-compact,
 *           overflow-check, progress, hot-bump, html,
 *           compact, plan-write, checkpoint, digest, status
 *
 * Staleness propagation is automatic: every set/append/progress write looks up
 * the written file's dependents in deps-closure.mem and stale-marks them
 * (deduplicated — a file already unresolved-stale is not re-marked).
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
const { COMPACT_SPECS, compactFile } = require('./lib/compact');

// ─── Staleness propagation ────────────────────────────────────────────────────

/** Parse stale.mem and return the unresolved entries as an array. */
function listStale(dir) {
  const stalePath = memPath(dir, 'stale.mem');
  if (!fs.existsSync(stalePath)) return [];

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
  return unresolved;
}

/**
 * Mark every dependent of `file` (per deps-closure.mem) stale.
 * Skips dependents that are already unresolved-stale and any file in `exclude`
 * (used by batch commands that write a source and its dependents together).
 */
function propagateStale(dir, file, exclude = []) {
  if (file === 'stale.mem' || file.startsWith('deps')) return;
  const closure = parseDeps(memPath(dir, 'deps-closure.mem'));
  const alreadyStale = new Set(listStale(dir).map(e => e.file));
  const skip = new Set(exclude);
  for (const [dependent, sources] of Object.entries(closure)) {
    if (dependent === file || skip.has(dependent)) continue;
    if (!sources.includes(file)) continue;
    if (alreadyStale.has(dependent)) continue;
    cmdStaleMark(dir, dependent, file);
  }
}

/** Read all of stdin synchronously (used by plan-write and digest). */
function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_) {
    return '';
  }
}

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

  console.log('memplan: .memplan/ initialised with all stubs (Phase 1 + Phase 2).');
}

function cmdSet(dir, file, keyOrValue, value, opts = {}) {
  const fPath = memPath(dir, file);

  // 3-arg form: write value directly to plain-text file (e.g. branch-intent, progress)
  if (value === undefined) {
    unlockFile(fPath);
    fs.writeFileSync(fPath, keyOrValue + '\n', 'utf8');
    lockFile(fPath);
    if (!opts.noPropagate) propagateStale(dir, file);
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
  if (!opts.noPropagate) propagateStale(dir, file);
}

function cmdClear(dir, file, key) {
  cmdSet(dir, file, key, '');
}

function cmdAppend(dir, file, key, value, opts = {}) {
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

  // The file may be locked (0444) from a prior set — unlock for the append,
  // re-lock after, mirroring cmdSet.
  unlockFile(fPath);
  fs.appendFileSync(fPath, line, 'utf8');

  if (AUTO_RENDER_ON_APPEND.has(file) && PAIRED.has(file)) {
    renderToPlanMd(fPath, planPath(dir, file));
  }
  lockFile(fPath);
  if (!opts.noPropagate) propagateStale(dir, file);
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
  console.log(JSON.stringify(listStale(dir), null, 2));
}

function cmdStaleCompact(dir) {
  const stalePath = memPath(dir, 'stale.mem');
  if (!fs.existsSync(stalePath)) { console.log('stale-compact: nothing to do'); return; }

  const unresolved = listStale(dir);
  fs.writeFileSync(`${stalePath}.backup`, fs.readFileSync(stalePath, 'utf8'), 'utf8');
  const lines = unresolved.map(e =>
    `${e.timestamp} +stale:file=${e.file},because=${e.because},session=${e.session}`
  );
  fs.writeFileSync(stalePath, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
  console.log(`stale-compact: ${unresolved.length} unresolved entries kept`);
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

function cmdProgress(dir, m, n, text, opts = {}) {
  fs.writeFileSync(path.join(memDir(dir), 'progress'), `${m}/${n} | ${text}\n`, 'utf8');
  if (!opts.noPropagate) propagateStale(dir, 'progress');
}

function cmdHotBump(dir, file) {
  const fPath = memPath(dir, 'memory/hot.mem');
  const MAX_HOT = 5;

  unlockFile(fPath);

  // Read current hot-files list
  let hotFiles = [];
  if (fs.existsSync(fPath)) {
    const lines = fs.readFileSync(fPath, 'utf8').split('\n');
    for (const line of lines) {
      const parsed = parseLine(line);
      if (parsed && !parsed.appendOnly && parsed.key === 'hot-files' && parsed.rawValue) {
        hotFiles = parsed.rawValue.split('|').map(f => f.trim()).filter(Boolean);
        break;
      }
    }
  }

  // Add new file to front (most recent first), removing duplicates
  if (hotFiles.includes(file)) {
    hotFiles = hotFiles.filter(f => f !== file);
  }
  hotFiles.unshift(file);

  // Keep only MAX_HOT most recent
  hotFiles = hotFiles.slice(0, MAX_HOT);

  // Write back atomically using cmdSet
  cmdSet(dir, 'memory/hot.mem', 'hot-files', hotFiles.join('|'));
  cmdSet(dir, 'memory/hot.mem', 'last-updated', `~${todayDate()}`);

  lockFile(fPath);
}

// ─── Batch / read commands ───────────────────────────────────────────────────

/**
 * plan-write <dir> — create or replace the whole plan in one call.
 * Reads JSON from stdin:
 *   { "title": "...", "steps": [{ "id": "1", "text": "...", "deps": "2|3",
 *     "atomic": true }], "risk": { "what-could-break": "...",
 *     "irreversible": "...", "verify-first": "..." } }
 * Writes plan.mem, progress (0/N over leaf steps), slice.mem (ready frontier,
 * ≤5 steps with no deps), and risk.mem when provided. Propagates staleness once
 * for the batch, excluding the files written by the batch itself.
 */
function cmdPlanWrite(dir) {
  const input = JSON.parse(readStdin());
  if (!input.title || !Array.isArray(input.steps) || input.steps.length === 0) {
    throw new Error('plan-write: stdin JSON needs { title, steps: [...] }');
  }

  const written = ['plan.mem', 'slice.mem', 'progress'];
  const ts = nowTs();

  const lines = [
    `title:${input.title}`,
    `step-count:#${input.steps.length}`,
    'status:not-started',
  ];
  for (const s of input.steps) {
    let entry = `id=${s.id},text=${s.text}`;
    if (s.deps) entry += `,deps=${s.deps}`;
    if (s.atomic) entry += ',atomic=true';
    if (s.refined) entry += ',refined=true';
    lines.push(`${ts} +step:${entry}`);
  }
  const planMemPath = memPath(dir, 'plan.mem');
  unlockFile(planMemPath);
  fs.writeFileSync(planMemPath, lines.join('\n') + '\n', 'utf8');
  renderToPlanMd(planMemPath, planPath(dir, 'plan.mem'));
  lockFile(planMemPath);

  const leaves = input.steps.filter(s => !s.refined);
  cmdProgress(dir, 0, leaves.length, 'not started', { noPropagate: true });

  const ready = leaves.filter(s => !s.deps).slice(0, 5);
  cmdSet(dir, 'slice.mem', 'title', 'next-steps', { noPropagate: true });
  for (const s of ready) {
    cmdAppend(dir, 'slice.mem', 'step', `id=${s.id},text=${s.text}`, { noPropagate: true });
  }

  if (input.risk) {
    written.push('risk.mem');
    for (const k of ['what-could-break', 'irreversible', 'verify-first']) {
      if (input.risk[k]) cmdSet(dir, 'risk.mem', k, input.risk[k], { noPropagate: true });
    }
  }

  for (const f of written) propagateStale(dir, f, written);
  console.log(`plan-write: ${input.steps.length} steps, ${ready.length} ready${input.risk ? ', risk written' : ''}`);
}

/** checkpoint <dir> <last-action> <next-action> <open-questions> — one-call session checkpoint. */
function cmdCheckpoint(dir, lastAction, nextAction, openQuestions) {
  if (lastAction === undefined || nextAction === undefined) {
    throw new Error('checkpoint: usage — checkpoint <dir> <last-action> <next-action> [open-questions]');
  }
  cmdSet(dir, 'checkpoint.mem', 'last-action', lastAction, { noPropagate: true });
  cmdSet(dir, 'checkpoint.mem', 'next-action', nextAction, { noPropagate: true });
  cmdSet(dir, 'checkpoint.mem', 'open-questions', openQuestions || 'none', { noPropagate: true });
  propagateStale(dir, 'checkpoint.mem');
  console.log('checkpoint: written');
}

/**
 * digest <dir> <summary> — write the per-session digest in one call.
 * Bullets come from stdin, one per line (max 10; extras dropped).
 */
function cmdDigest(dir, summary) {
  if (!summary) throw new Error('digest: usage — digest <dir> <summary> (bullets on stdin)');
  const date = todayDate();
  const file = `sessions/${date}.mem`;
  cmdAppend(dir, file, 'session', `date=~${date},summary=${summary}`, { noPropagate: true });
  const bullets = readStdin().split('\n').map(l => l.trim()).filter(Boolean).slice(0, 10);
  for (const b of bullets) cmdAppend(dir, file, 'bullet', `text=${b}`, { noPropagate: true });
  console.log(`digest: ${bullets.length} bullets written to ${file}`);
}

/**
 * status <dir> — one-call orientation snapshot as compact JSON:
 * progress, plan title/status/steps, checkpoint fields, unresolved stale entries.
 */
function cmdStatus(dir) {
  const out = { progress: null, plan: null, checkpoint: null, stale: listStale(dir) };

  const progressPath = path.join(memDir(dir), 'progress');
  if (fs.existsSync(progressPath)) out.progress = fs.readFileSync(progressPath, 'utf8').trim();

  const planEntries = parseFile(memPath(dir, 'plan.mem'));
  if (planEntries.length) {
    const plan = { title: null, status: null, steps: [] };
    for (const e of planEntries) {
      if (!e.appendOnly && e.key === 'title') plan.title = e.rawValue;
      if (!e.appendOnly && e.key === 'status') plan.status = e.rawValue;
      if (e.appendOnly && e.key === 'step') {
        const step = {};
        for (const f of ['id', 'text', 'deps', 'atomic', 'refined']) {
          const m = e.rawValue.match(new RegExp(`(?:^|,)${f}=([^,]*)`));
          if (m) step[f] = m[1];
        }
        plan.steps.push(step);
      }
    }
    out.plan = plan;
  }

  const cpEntries = parseFile(memPath(dir, 'checkpoint.mem'));
  if (cpEntries.length) {
    out.checkpoint = {};
    for (const e of cpEntries) {
      if (!e.appendOnly) out.checkpoint[e.key] = e.rawValue;
    }
  }

  console.log(JSON.stringify(out));
}

/**
 * compact <dir> [file] — deduplicate append-only files (the bulk-rewrite half
 * of memplan/review). With no file argument, compacts every known append-only
 * file. Re-renders paired .plan.md counterparts for changed files.
 */
function cmdCompact(dir, file) {
  const targets = file ? [file] : Object.keys(COMPACT_SPECS);
  for (const t of targets) {
    const spec = COMPACT_SPECS[t];
    if (!spec) throw new Error(`compact: no spec for ${t} — known: ${Object.keys(COMPACT_SPECS).join(', ')}`);
    const fPath = memPath(dir, t);
    unlockFile(fPath);
    const { before, after, changed } = compactFile(fPath, spec);
    if (changed && PAIRED.has(t)) renderToPlanMd(fPath, planPath(dir, t));
    lockFile(fPath);
    console.log(changed ? `${t}: compacted ${before} -> ${after} lines` : `${t}: no duplicates`);
  }
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
    case 'stale-compact':         cmdStaleCompact(rest[0]); break;
    case 'overflow-check':        cmdOverflowCheck(rest[0], rest[1], rest[2]); break;
    case 'progress':              cmdProgress(rest[0], rest[1], rest[2], rest[3]); break;
    case 'hot-bump':              cmdHotBump(rest[0], rest[1]); break;
    case 'html':                  cmdHtml(rest[0], rest.slice(1)); break;
    case 'compact':               cmdCompact(rest[0], rest[1]); break;
    case 'plan-write':            cmdPlanWrite(rest[0]); break;
    case 'checkpoint':            cmdCheckpoint(rest[0], rest[1], rest[2], rest[3]); break;
    case 'digest':                cmdDigest(rest[0], rest[1]); break;
    case 'status':                cmdStatus(rest[0]); break;
    default:
      console.error(`Unknown command: ${cmd}`);
      process.exit(1);
  }
  process.exit(0);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
