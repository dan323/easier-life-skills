#!/usr/bin/env node
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'measure-session.mjs');

function run(args) {
  return JSON.parse(execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8' }));
}

function writeTranscript(lines) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'measure-test-')), 's.jsonl');
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return file;
}

const usage = (input, output, cw = 0, cr = 0) => ({
  input_tokens: input,
  output_tokens: output,
  cache_creation_input_tokens: cw,
  cache_read_input_tokens: cr,
});

const assistant = (id, blocks, u) => ({
  type: 'assistant',
  message: { id, content: blocks, usage: u },
});

test('dedupes usage shared across lines of the same message id', () => {
  const u = usage(100, 10);
  const file = writeTranscript([
    assistant('m1', [{ type: 'thinking' }], u),
    assistant('m1', [{ type: 'text', text: 'hi' }], u), // same id — must not double-count
    assistant('m2', [{ type: 'text', text: 'bye' }], usage(50, 5)),
    { type: 'user', message: {} },
  ]);
  const row = run([file]);
  assert.equal(row.assistantMessages, 2);
  assert.equal(row.inputTokens, 150);
  assert.equal(row.outputTokens, 15);
  // 150×1 + 15×5 = 225
  assert.equal(row.weightedCost, 225);
});

test('counts tool calls by name and ignores .memplan edits for first-edit metric', () => {
  const file = writeTranscript([
    assistant('m1', [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }], usage(100, 10)),
    assistant(
      'm2',
      [{ type: 'tool_use', id: 't2', name: 'Write', input: { file_path: 'C:\\proj\\.memplan\\hot.mem' } }],
      usage(100, 10)
    ),
    assistant(
      'm3',
      [{ type: 'tool_use', id: 't3', name: 'Edit', input: { file_path: 'C:\\proj\\src\\main.js' } }],
      usage(100, 10)
    ),
  ]);
  const row = run([file, '--project-root', 'C:\\proj']);
  assert.deepEqual(row.toolCalls.byName, { Bash: 1, Write: 1, Edit: 1 });
  assert.equal(row.firstProductiveEditFound, true);
  // All three messages count: the memplan Write is ceremony, the real Edit lands in m3.
  assert.equal(row.tokensBeforeFirstEdit, 450);
});

test('edits outside --project-root do not qualify; missing edit falls back to full cost', () => {
  const file = writeTranscript([
    assistant(
      'm1',
      [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: '/tmp/elsewhere/x.js' } }],
      usage(200, 20)
    ),
  ]);
  const row = run([file, '--project-root', 'C:\\proj']);
  assert.equal(row.firstProductiveEditFound, false);
  assert.equal(row.tokensBeforeFirstEdit, row.weightedCost);
});

test('matches /c/… and /mnt/c/… paths against a C:\\ project root', () => {
  const file = writeTranscript([
    assistant(
      'm1',
      [{ type: 'tool_use', id: 't1', name: 'Write', input: { file_path: '/mnt/c/proj/src/a.js' } }],
      usage(100, 0)
    ),
  ]);
  const row = run([file, '--project-root', 'C:\\proj']);
  assert.equal(row.firstProductiveEditFound, true);
});

test('--overhead sums frontmatter description bytes across the manifest skills', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'measure-overhead-'));
  fs.mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'skills', 'alpha'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'p', version: '1.0.0', skills: ['./skills/alpha'] })
  );
  fs.writeFileSync(
    path.join(dir, 'skills', 'alpha', 'SKILL.md'),
    '---\nname: alpha\ndescription: >\n  Twenty bytes here ok\ntools: Bash\n---\nbody\n'
  );
  const row = run(['--overhead', dir]);
  assert.equal(row.skills.length, 1);
  assert.equal(row.skills[0].descriptionBytes, 'Twenty bytes here ok'.length);
  assert.equal(row.approxTokensPerSession, Math.round(20 / 4));
});
