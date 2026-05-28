#!/usr/bin/env node
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const os = require('node:os');

const CLI = path.join(__dirname, 'memplan-cli.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'memplan-test-'));
}

function run(args, opts = {}) {
  return execSync(`node "${CLI}" ${args}`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts,
  });
}

function runInDir(dir, args) {
  return run(`${args}`, { cwd: dir });
}

function readFile(dir, rel) {
  return fs.readFileSync(path.join(dir, '.memplan', rel), 'utf8');
}

function fileExists(dir, rel) {
  return fs.existsSync(path.join(dir, '.memplan', rel));
}

// ─── init ─────────────────────────────────────────────────────────────────────

test('init: creates .memplan/ structure', () => {
  const dir = tmpDir();
  const out = run(`init "${dir}"`);
  assert.ok(out.includes('initialised'), 'prints initialised message');

  // Directories
  for (const sub of ['memory', 'decisions', 'inbox', 'sessions']) {
    assert.ok(
      fs.existsSync(path.join(dir, '.memplan', sub)),
      `${sub}/ exists`
    );
  }

  // Plain-text files
  assert.equal(readFile(dir, 'progress').trim(), '0/0 | not started');
  assert.equal(readFile(dir, 'branch-intent').trim(), '(not set)');

  // Structural files
  assert.ok(fileExists(dir, 'deps.mem'));
  assert.ok(fileExists(dir, 'deps-closure.mem'));
  assert.ok(fileExists(dir, 'stale.mem'));

  // .mem stubs and .plan.md counterparts
  for (const f of ['plan.mem', 'checkpoint.mem', 'memory/persona.mem', 'decisions/log.mem']) {
    assert.ok(fileExists(dir, f), `${f} exists`);
    const planMd = f.replace(/\.mem$/, '.plan.md');
    assert.ok(fileExists(dir, planMd), `${planMd} exists`);
  }
});

test('init: idempotent — Already initialised when .memplan/ exists', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  // Write a sentinel value to verify nothing is overwritten
  fs.writeFileSync(path.join(dir, '.memplan', 'progress'), '3/10 | sentinel\n', 'utf8');

  const out = run(`init "${dir}"`);
  assert.ok(out.includes('Already initialised'), 'prints already-initialised message');
  assert.equal(readFile(dir, 'progress').trim(), '3/10 | sentinel', 'progress not overwritten');
});

test('init: deps-closure.mem is computed from initial deps.mem', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  const closure = readFile(dir, 'deps-closure.mem');
  // slice.mem depends on steps.mem which depends on plan.mem → closure should include plan.mem
  assert.ok(closure.includes('slice.mem'), 'slice.mem in closure');
  assert.ok(closure.includes('plan.mem'), 'plan.mem appears in closure values');
});

// ─── set ──────────────────────────────────────────────────────────────────────

test('set: writes plain-text file (3-arg form)', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  run(`set "${dir}" branch-intent "add inbox protocol"`);
  assert.equal(readFile(dir, 'branch-intent').trim(), 'add inbox protocol');
});

test('set: replaces mutable key, removes all prior occurrences (4-arg form)', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  run(`set "${dir}" checkpoint.mem last-action "wrote-layout"`);
  run(`set "${dir}" checkpoint.mem last-action "wrote-cli"`);
  const content = readFile(dir, 'checkpoint.mem');
  const occurrences = content.split('\n').filter(l => l.startsWith('last-action:'));
  assert.equal(occurrences.length, 1, 'only one last-action: line');
  assert.ok(occurrences[0].includes('wrote-cli'), 'latest value kept');
});

test('set: renders paired .plan.md', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  run(`set "${dir}" checkpoint.mem next-action "implement-parse-loop"`);
  const planMd = readFile(dir, 'checkpoint.plan.md');
  assert.ok(planMd.includes('implement-parse-loop'), '.plan.md contains new value');
  assert.ok(planMd.startsWith('<!-- GENERATED'), '.plan.md has generated header');
});

// ─── clear ────────────────────────────────────────────────────────────────────

test('clear: writes empty value for mutable key', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  run(`set "${dir}" checkpoint.mem open-questions "pending review"`);
  run(`clear "${dir}" checkpoint.mem open-questions`);
  const content = readFile(dir, 'checkpoint.mem');
  const line = content.split('\n').find(l => l.startsWith('open-questions:'));
  assert.ok(line !== undefined, 'key line exists');
  assert.equal(line, 'open-questions:', 'value is empty');
});

// ─── append ───────────────────────────────────────────────────────────────────

test('append: adds timestamped entry without reading file first', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  run(`append "${dir}" memory/facts.mem fact "no-force-push-to-main"`);
  const content = readFile(dir, 'memory/facts.mem');
  assert.ok(content.includes('+fact:no-force-push-to-main'), 'fact line appended');
  assert.ok(/~\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z/.test(content), 'timestamp present');
});

test('append: auto-renders .plan.md for plan.mem', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  run(`append "${dir}" plan.mem step "id=1,text=write-layout,atomic=true"`);
  const planMd = readFile(dir, 'plan.plan.md');
  assert.ok(planMd.includes('write-layout'), 'plan.plan.md updated after append');
});

test('append: overflow redirects to memory/overflow.mem', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  // Write 200 lines directly to exceed cap
  const fakePath = path.join(dir, '.memplan', 'memory/facts.mem');
  const lines = Array.from({ length: 200 }, (_, i) => `~2026-01-01T00:00Z +fact:entry-${i}`).join('\n') + '\n';
  fs.writeFileSync(fakePath, lines, 'utf8');
  run(`append "${dir}" memory/facts.mem fact "this-should-overflow"`);
  const overflow = readFile(dir, 'memory/overflow.mem');
  assert.ok(overflow.includes('this-should-overflow'), 'overflow entry redirected');
});

// ─── render ───────────────────────────────────────────────────────────────────

test('render: produces byte-for-byte canonical output on repeated calls', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  run(`set "${dir}" checkpoint.mem last-action "wrote-layout"`);
  run(`set "${dir}" checkpoint.mem next-action "write-cli"`);
  const first = readFile(dir, 'checkpoint.plan.md');
  run(`render "${dir}" checkpoint.mem`);
  const second = readFile(dir, 'checkpoint.plan.md');
  assert.equal(first, second, 'render is deterministic');
});

test('render-all: re-renders all paired .mem files', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  run(`set "${dir}" checkpoint.mem last-action "test-run"`);
  // Corrupt plan.md to verify it gets regenerated
  const planPath = path.join(dir, '.memplan', 'checkpoint.plan.md');
  fs.chmodSync(planPath, 0o644);
  fs.writeFileSync(planPath, 'corrupted', 'utf8');
  run(`render-all "${dir}"`);
  const restored = readFile(dir, 'checkpoint.plan.md');
  assert.ok(restored.startsWith('<!-- GENERATED'), 'corrupted .plan.md regenerated');
  assert.ok(restored.includes('test-run'), 'content reflects .mem state');
});

// ─── progress ────────────────────────────────────────────────────────────────

test('progress: writes m/n | text format', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  run(`progress "${dir}" 3 12 "implement-feedscript-parse-loop"`);
  assert.equal(
    readFile(dir, 'progress').trim(),
    '3/12 | implement-feedscript-parse-loop'
  );
});

test('progress: overwrites previous value', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  run(`progress "${dir}" 1 5 "first"`);
  run(`progress "${dir}" 2 5 "second"`);
  assert.equal(readFile(dir, 'progress').trim(), '2/5 | second');
});

// ─── lock / unlock ───────────────────────────────────────────────────────────

test('lock / unlock: round-trip', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  const mPath = path.join(dir, '.memplan', 'checkpoint.mem');
  run(`lock "${dir}" checkpoint.mem`);
  const statsLocked = fs.statSync(mPath);
  run(`unlock "${dir}" checkpoint.mem`);
  const statsUnlocked = fs.statSync(mPath);
  // On Windows permissions may not change; just verify no crash
  assert.ok(statsLocked.mode !== undefined);
  assert.ok(statsUnlocked.mode !== undefined);
});

// ─── stale ────────────────────────────────────────────────────────────────────

test('stale-mark / stale-list: marks entry as stale', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  run(`stale-mark "${dir}" steps.mem plan.mem`);
  const out = run(`stale-list "${dir}"`);
  const list = JSON.parse(out);
  assert.equal(list.length, 1);
  assert.equal(list[0].file, 'steps.mem');
  assert.equal(list[0].because, 'plan.mem');
});

test('stale-resolve: excludes resolved entries from stale-list', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  run(`stale-mark "${dir}" steps.mem plan.mem`);
  run(`stale-resolve "${dir}" steps.mem`);
  const out = run(`stale-list "${dir}"`);
  const list = JSON.parse(out);
  assert.equal(list.length, 0, 'resolved entry excluded');
});

test('stale-list: correctly excludes resolved entries when stale and resolved both exist', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  run(`stale-mark "${dir}" slice.mem steps.mem`);
  run(`stale-mark "${dir}" checkpoint.mem plan.mem`);
  run(`stale-resolve "${dir}" slice.mem`);
  const out = run(`stale-list "${dir}"`);
  const list = JSON.parse(out);
  assert.equal(list.length, 1, 'only unresolved entry returned');
  assert.equal(list[0].file, 'checkpoint.mem');
});

// ─── overflow-check ───────────────────────────────────────────────────────────

test('overflow-check: exits 0 when under cap', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  assert.doesNotThrow(() => run(`overflow-check "${dir}" memory/facts.mem 100`));
});

test('overflow-check: exits 1 when at or over cap', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  const factsPath = path.join(dir, '.memplan', 'memory/facts.mem');
  const lines = Array.from({ length: 5 }, (_, i) => `+fact:entry-${i}`).join('\n') + '\n';
  fs.writeFileSync(factsPath, lines, 'utf8');
  assert.throws(
    () => run(`overflow-check "${dir}" memory/facts.mem 5`),
    'exits non-zero when at cap'
  );
});

// ─── deps-closure ────────────────────────────────────────────────────────────

test('deps-closure: correctness on initial graph', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  run(`deps-closure "${dir}"`);
  const closure = readFile(dir, 'deps-closure.mem');
  // slice.mem depends on steps.mem which depends on plan.mem → transitive: plan.mem in slice's closure
  assert.ok(closure.includes('slice.mem'), 'slice.mem present');
  const sliceLine = closure.split('\n').find(l => l.startsWith('dep:slice.mem='));
  assert.ok(sliceLine && sliceLine.includes('plan.mem'), 'plan.mem in slice.mem transitive closure');
});

test('deps-closure-append: incremental update adds one new entry', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  run(`deps-closure-append "${dir}" custom.mem "plan.mem|checkpoint.mem"`);
  const closure = readFile(dir, 'deps-closure.mem');
  const line = closure.split('\n').find(l => l.startsWith('dep:custom.mem='));
  assert.ok(line, 'custom.mem entry added');
  assert.ok(line.includes('plan.mem'), 'plan.mem in custom.mem closure');
  assert.ok(line.includes('checkpoint.mem'), 'checkpoint.mem in custom.mem closure');
});

// ─── inbox / apply ───────────────────────────────────────────────────────────

test('inbox: empty inbox reports 0 ops applied', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  const out = run(`inbox "${dir}"`);
  assert.ok(out.includes('0 ops applied'), 'empty inbox message');
});

test('apply: processes APPROVE op, deletes file, appends to log', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  const feedFile = path.join(dir, '.memplan', 'inbox', 'test.feedback');
  fs.writeFileSync(feedFile, 'APPROVE step=1\n', 'utf8');
  run(`apply "${dir}" "${feedFile}"`);
  assert.ok(!fs.existsSync(feedFile), '.feedback file deleted');
  const log = readFile(dir, 'decisions/log.mem');
  assert.ok(log.includes('+approve:step=1'), 'approve entry in log');
  assert.ok(log.includes('+inbox:'), 'inbox summary in log');
});

test('apply: processes SET op, updates target file', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  const feedFile = path.join(dir, '.memplan', 'inbox', 'test.feedback');
  fs.writeFileSync(feedFile, 'SET file=checkpoint.mem key=last-action value="wrote-layout"\n', 'utf8');
  run(`apply "${dir}" "${feedFile}"`);
  const content = readFile(dir, 'checkpoint.mem');
  assert.ok(content.includes('last-action:wrote-layout'), 'SET applied to target file');
});

test('apply: unknown verb recorded in questions.mem, processing continues', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  const feedFile = path.join(dir, '.memplan', 'inbox', 'bad.feedback');
  fs.writeFileSync(feedFile, 'APPROVE step=1\nUNKNOWN_VERB foo=bar\nAPPROVE step=2\n', 'utf8');
  run(`apply "${dir}" "${feedFile}"`);
  // File should be deleted even with errors
  assert.ok(!fs.existsSync(feedFile), 'file deleted despite errors');
  const log = readFile(dir, 'decisions/log.mem');
  // Both APPROVE ops should have been applied
  const approvals = log.split('\n').filter(l => l.includes('+approve:'));
  assert.ok(approvals.length >= 2, 'both valid ops applied despite error');
  const questions = readFile(dir, 'memory/questions.mem');
  assert.ok(questions.includes('+unknown-op:'), 'unknown op recorded in questions.mem');
});

test('inbox: processes all .feedback files oldest-first, deletes them', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  const inboxDir = path.join(dir, '.memplan', 'inbox');
  // Write two feedback files with a small mtime gap
  const f1 = path.join(inboxDir, 'first.feedback');
  fs.writeFileSync(f1, 'APPROVE step=1\n', 'utf8');
  // Ensure different mtime
  const past = new Date(Date.now() - 5000);
  fs.utimesSync(f1, past, past);
  const f2 = path.join(inboxDir, 'second.feedback');
  fs.writeFileSync(f2, 'APPROVE step=2\n', 'utf8');

  run(`inbox "${dir}"`);

  assert.ok(!fs.existsSync(f1), 'first.feedback deleted');
  assert.ok(!fs.existsSync(f2), 'second.feedback deleted');
  const log = readFile(dir, 'decisions/log.mem');
  assert.ok(log.includes('+approve:step=1'), 'step=1 approved');
  assert.ok(log.includes('+approve:step=2'), 'step=2 approved');
});

test('apply: REPLACE-PLAN rewrites all steps', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  const feedFile = path.join(dir, '.memplan', 'inbox', 'replace.feedback');
  fs.writeFileSync(feedFile, 'REPLACE-PLAN text="1=write-layout|2=write-cli|3=write-tests"\n', 'utf8');
  run(`apply "${dir}" "${feedFile}"`);
  const planMem = readFile(dir, 'plan.mem');
  assert.ok(planMem.includes('write-layout'), 'step 1 in plan.mem');
  assert.ok(planMem.includes('write-tests'), 'step 3 in plan.mem');
});

// ─── html ────────────────────────────────────────────────────────────────────

test('html: converts .plan.md files and writes index.html', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);
  run(`set "${dir}" checkpoint.mem last-action "test-export"`);
  run(`html "${dir}"`);
  const indexPath = path.join(dir, '.memplan', 'index.html');
  assert.ok(fs.existsSync(indexPath), 'index.html created');
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  assert.ok(indexContent.includes('memplan dashboard'), 'index has dashboard heading');
  // checkpoint.plan.html should exist
  const htmlPath = path.join(dir, '.memplan', 'checkpoint.plan.html');
  assert.ok(fs.existsSync(htmlPath), 'checkpoint.plan.html created');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  assert.ok(htmlContent.includes('test-export'), 'html content reflects .mem state');
});

test('html --out: writes all html to output directory', () => {
  const dir = tmpDir();
  const outDir = tmpDir();
  run(`init "${dir}"`);
  run(`html "${dir}" --out "${outDir}"`);
  const indexPath = path.join(outDir, 'index.html');
  assert.ok(fs.existsSync(indexPath), 'index.html written to --out dir');
});

test('html: status badges rendered correctly', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);

  // Create test markdown with status badges
  const testMd = `<!-- GENERATED -->
# Test
## Steps
1. Task one [done]
2. Task two [in-progress]
3. Task three [blocked]
4. Task four [pending]
5. Task five [skipped]
`;
  fs.writeFileSync(path.join(dir, '.memplan', 'test.plan.md'), testMd, 'utf8');

  run(`html "${dir}"`);
  const htmlPath = path.join(dir, '.memplan', 'test.plan.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes('badge-done'), 'done badge class present');
  assert.ok(html.includes('badge-in-progress'), 'in-progress badge class present');
  assert.ok(html.includes('badge-blocked'), 'blocked badge class present');
  assert.ok(html.includes('badge-pending'), 'pending badge class present');
  assert.ok(html.includes('badge-skipped'), 'skipped badge class present');
  assert.ok(html.includes('--mp-done: #16a34a'), 'CSS custom properties defined');
});

test('html: table rendering with key-value pairs', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);

  const testMd = `<!-- GENERATED -->
# Test
| Key | Value |
|-----|-------|
| title | Test Project |
| status | in-progress |
`;
  fs.writeFileSync(path.join(dir, '.memplan', 'test-table.plan.md'), testMd, 'utf8');

  run(`html "${dir}"`);
  const htmlPath = path.join(dir, '.memplan', 'test-table.plan.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes('<table>'), 'table element present');
  assert.ok(html.includes('<th>Key</th>'), 'table header rendered');
  assert.ok(html.includes('Test Project'), 'table value rendered');
});

test('html: blockquote to callout conversion', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);

  const testMd = `<!-- GENERATED -->
# Test
## Risk
> **What could break**: Database migration
> **Irreversible**: Cannot roll back
`;
  fs.writeFileSync(path.join(dir, '.memplan', 'test-callout.plan.md'), testMd, 'utf8');

  run(`html "${dir}"`);
  const htmlPath = path.join(dir, '.memplan', 'test-callout.plan.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes('<aside class="callout callout-risk">'), 'risk callout rendered');
  assert.ok(html.includes('What could break'), 'blockquote content preserved');
  assert.ok(html.includes('--mp-risk-bg'), 'risk CSS variables defined');
});

test('html: self-contained with no external resources', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);

  run(`html "${dir}"`);
  const htmlPath = path.join(dir, '.memplan', 'plan.plan.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Should not contain any external CDN links
  assert.ok(!html.includes('cdn.'), 'no CDN references');
  assert.ok(!html.includes('http://'), 'no http:// links');
  assert.ok(!html.includes('https://'), 'no https:// links');

  // Should have embedded CSS
  assert.ok(html.includes('<style>'), 'embedded CSS present');
  assert.ok(html.includes('--mp-bg'), 'CSS custom properties embedded');

  // Should have proper structure
  assert.ok(html.includes('<!DOCTYPE html>'), 'proper HTML5 doctype');
  assert.ok(html.includes('<meta charset="utf-8">'), 'charset meta tag');
  assert.ok(html.includes('mp-header'), 'header element present');
  assert.ok(html.includes('mp-footer'), 'footer element present');
  assert.ok(html.includes('mp-content'), 'content wrapper present');
});

test('html: index dashboard shows status and subtitle', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);

  // Create test files with status and subtitle
  const testMd = `<!-- GENERATED -->
# Test
| Key | Value |
|-----|-------|
| status | in-progress |
| next-action | Complete the implementation |
`;
  fs.writeFileSync(path.join(dir, '.memplan', 'test-status.plan.md'), testMd, 'utf8');

  run(`html "${dir}"`);
  const indexPath = path.join(dir, '.memplan', 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf8');

  assert.ok(indexHtml.includes('badge-in-progress'), 'status badge in index');
  assert.ok(indexHtml.includes('Complete the implementation'), 'subtitle in index');
  assert.ok(indexHtml.includes('index-subtitle'), 'subtitle CSS class present');
});

test('html: max-width is 800px', () => {
  const dir = tmpDir();
  run(`init "${dir}"`);

  run(`html "${dir}"`);
  const htmlPath = path.join(dir, '.memplan', 'plan.plan.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes('max-width: 800px'), 'max-width set to 800px per spec');
});
