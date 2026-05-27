'use strict';

const fs = require('fs');
const path = require('path');
const { parseLine, parseFeedParams } = require('./parse');
const { nowTs } = require('./time');
const { memPath, planPath, unlockFile } = require('./io');
const { PAIRED } = require('./constants');
const { renderToPlanMd } = require('./render');

/** Read +step: entries from a .mem file. */
function readSteps(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const steps = [];
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const parsed = parseLine(line);
    if (parsed && parsed.appendOnly && parsed.key === 'step') {
      const m = {};
      for (const part of parsed.rawValue.split(',')) {
        const eq = part.indexOf('=');
        if (eq !== -1) m[part.slice(0, eq)] = part.slice(eq + 1);
      }
      m._ts = parsed.timestamp;
      steps.push(m);
    }
  }
  return steps;
}

/** Write non-step lines + step entries back to a .mem file. */
function writeSteps(filePath, steps) {
  const existing = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf8').split('\n')
    : [];
  const nonStep = existing.filter(l => {
    const p = parseLine(l);
    return !(p && p.appendOnly && p.key === 'step');
  });
  while (nonStep.length && nonStep[nonStep.length - 1] === '') nonStep.pop();

  const stepLines = steps.map(s => {
    const parts = Object.entries(s)
      .filter(([k]) => !k.startsWith('_'))
      .map(([k, v]) => `${k}=${v}`);
    const ts = s._ts ? `${s._ts} ` : '';
    return `${ts}+step:${parts.join(',')}`;
  });
  fs.writeFileSync(filePath, [...nonStep, ...stepLines, ''].join('\n'), 'utf8');
}

/** Re-index top-level steps sequentially (sub-steps keep their relative ids). */
function renumberSteps(steps) {
  let counter = 0;
  for (const step of steps) {
    if (!String(step.id).includes('.')) {
      counter++;
      step.id = String(counter);
    }
  }
  return steps;
}

/**
 * Process a single FeedScript .feedback file.
 * Deletes the file after processing.
 */
function applyFeedScript(dir, feedbackFilePath, cmdSetFn, cmdStaleResolveFn) {
  const content = fs.readFileSync(feedbackFilePath, 'utf8');
  const lines = content.split('\n');
  const ts = nowTs();
  const qPath = memPath(dir, 'memory/questions.mem');
  const logPath = memPath(dir, 'decisions/log.mem');
  const planMemPath = memPath(dir, 'plan.mem');

  let opsApplied = 0;
  let errors = 0;
  const affectedPaired = new Set();

  function logError(type, extra) {
    errors++;
    const entry = `${ts} +${type}:${extra}\n`;
    if (fs.existsSync(qPath)) fs.appendFileSync(qPath, entry, 'utf8');
    else fs.writeFileSync(qPath, entry, 'utf8');
  }

  for (let lineNo = 0; lineNo < lines.length; lineNo++) {
    const raw = lines[lineNo].trim();
    if (!raw || raw.startsWith('#')) continue;

    const spaceIdx = raw.indexOf(' ');
    const verb = spaceIdx === -1 ? raw : raw.slice(0, spaceIdx);
    const paramStr = spaceIdx === -1 ? '' : raw.slice(spaceIdx + 1);
    const params = parseFeedParams(paramStr);

    try {
      switch (verb) {
        case 'SET': {
          const { file, key, value } = params;
          if (!file || !key) { logError('parse-error', `line=${lineNo + 1}`); break; }
          const targetPath = memPath(dir, file);
          if (!fs.existsSync(targetPath)) { logError('bad-file', `file=${file}`); break; }
          const isAppendOnly = fs.readFileSync(targetPath, 'utf8').split('\n').some(l => {
            const p = parseLine(l);
            return p && p.appendOnly && p.key === key;
          });
          if (isAppendOnly) { logError('bad-set', `key=${key}`); break; }
          cmdSetFn(dir, file, key, value ?? '');
          if (PAIRED.has(file)) affectedPaired.add(file);
          opsApplied++;
          break;
        }
        case 'FACT': {
          const { tag, text } = params;
          if (!tag || !text || !/^[a-z][a-z0-9-]*$/.test(tag)) {
            logError('parse-error', `line=${lineNo + 1}`); break;
          }
          fs.appendFileSync(memPath(dir, 'memory/facts.mem'), `${ts} +fact:tag=${tag},text=${text}\n`, 'utf8');
          opsApplied++;
          break;
        }
        case 'APPROVE': {
          const { step } = params;
          if (!step) { logError('parse-error', `line=${lineNo + 1}`); break; }
          fs.appendFileSync(logPath, `${ts} +approve:step=${step}\n`, 'utf8');
          opsApplied++;
          break;
        }
        case 'CLEAR-STALE': {
          const { file } = params;
          if (!file) { logError('parse-error', `line=${lineNo + 1}`); break; }
          cmdStaleResolveFn(dir, file);
          opsApplied++;
          break;
        }
        case 'ANSWER': {
          const { qid, text } = params;
          if (!qid || !text) { logError('parse-error', `line=${lineNo + 1}`); break; }
          fs.appendFileSync(memPath(dir, 'memory/questions.mem'), `${ts} +answer:qid=${qid},text=${text}\n`, 'utf8');
          fs.appendFileSync(logPath, `${ts} +answer:qid=${qid}\n`, 'utf8');
          opsApplied++;
          break;
        }
        case 'COMMENT': {
          const { step, text } = params;
          if (!step || !text) { logError('parse-error', `line=${lineNo + 1}`); break; }
          fs.appendFileSync(logPath, `${ts} +comment:step=${step},text=${text}\n`, 'utf8');
          opsApplied++;
          break;
        }
        case 'REWRITE': {
          const { step: stepId, text } = params;
          if (!stepId || !text) { logError('parse-error', `line=${lineNo + 1}`); break; }
          const steps = readSteps(planMemPath);
          const idx = steps.findIndex(s => String(s.id) === String(stepId));
          if (idx === -1) { logError('bad-step', `op=REWRITE,step=${stepId}`); break; }
          steps[idx].text = text;
          unlockFile(planMemPath);
          writeSteps(planMemPath, steps);
          affectedPaired.add('plan.mem');
          opsApplied++;
          break;
        }
        case 'DELETE': {
          const { step: stepId } = params;
          if (!stepId) { logError('parse-error', `line=${lineNo + 1}`); break; }
          let steps = readSteps(planMemPath);
          const idx = steps.findIndex(s => String(s.id) === String(stepId));
          if (idx === -1) { logError('bad-step', `op=DELETE,step=${stepId}`); break; }
          steps.splice(idx, 1);
          steps = renumberSteps(steps);
          unlockFile(planMemPath);
          writeSteps(planMemPath, steps);
          affectedPaired.add('plan.mem');
          opsApplied++;
          break;
        }
        case 'INSERT': {
          const { after, before, text } = params;
          if (!text || (after === undefined && before === undefined)) {
            logError('parse-error', `line=${lineNo + 1}`); break;
          }
          let steps = readSteps(planMemPath);
          const refId = after !== undefined ? after : before;
          let insertIdx;
          if (after !== undefined) {
            if (String(after) === '0') {
              insertIdx = 0;
            } else {
              const idx = steps.findIndex(s => String(s.id) === String(refId));
              if (idx === -1) { logError('bad-step', `op=INSERT,step=${refId}`); break; }
              insertIdx = idx + 1;
            }
          } else {
            const idx = steps.findIndex(s => String(s.id) === String(refId));
            if (idx === -1) { logError('bad-step', `op=INSERT,step=${refId}`); break; }
            insertIdx = idx;
          }
          steps.splice(insertIdx, 0, { text, atomic: 'true' });
          steps = renumberSteps(steps);
          unlockFile(planMemPath);
          writeSteps(planMemPath, steps);
          affectedPaired.add('plan.mem');
          opsApplied++;
          break;
        }
        case 'REPLACE-PLAN': {
          const { text } = params;
          if (!text) { logError('parse-error', `line=${lineNo + 1}`); break; }
          const newSteps = text.split('|').map(entry => {
            const eq = entry.indexOf('=');
            return eq === -1 ? null : { id: entry.slice(0, eq), text: entry.slice(eq + 1), atomic: 'true' };
          }).filter(Boolean);
          unlockFile(planMemPath);
          writeSteps(planMemPath, newSteps);
          affectedPaired.add('plan.mem');
          opsApplied++;
          break;
        }
        default:
          logError('unknown-op', `verb=${verb},line=${lineNo + 1}`);
          break;
      }
    } catch (_) {
      logError('parse-error', `line=${lineNo + 1}`);
    }
  }

  // Regenerate affected .plan.md files
  for (const file of affectedPaired) {
    const mPath = memPath(dir, file);
    if (fs.existsSync(mPath) && PAIRED.has(file)) {
      renderToPlanMd(mPath, planPath(dir, file));
    }
  }

  const tool = path.basename(feedbackFilePath, '.feedback');
  fs.appendFileSync(logPath, `${ts} +inbox:tool=${tool},ops=#${opsApplied},errors=#${errors}\n`, 'utf8');
  fs.unlinkSync(feedbackFilePath);

  console.log(`inbox: ${opsApplied} ops applied, ${errors} errors`);
}

module.exports = { applyFeedScript, readSteps, writeSteps };
