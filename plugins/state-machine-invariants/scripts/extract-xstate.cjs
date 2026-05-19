#!/usr/bin/env node
/* extract-xstate.cjs — lift an XState v5 `createMachine(...)` config from a
 * TS/JS source file into the state-machine-invariants IR JSON.
 *
 * Usage:
 *     node extract-xstate.cjs <file.ts> [--out <path>] [--no-sidecar]
 *     node extract-xstate.cjs self-test
 *
 * Default behaviour: prints the IR JSON to stdout AND writes
 * `<file>.fsm.ir.json` (extension replaced) next to the input. Pass
 * `--no-sidecar` to skip the sidecar write, or `--out <path>` to override
 * its location.
 *
 * Exit codes:
 *     0  success (IR on stdout, sidecar written unless --no-sidecar)
 *     2  @babel/parser unavailable, or bad usage  → fall back to Python
 *     3  parse failed
 *     4  no createMachine(...) call found
 *     5  createMachine() first argument is not a static object literal
 *     6  self-test failed
 *
 * Caveats are returned inline in the IR (`caveats: [...]`); the script does
 * not exit non-zero just because some part of the config was opaque.
 */
'use strict';

const fs = require('fs');
const path = require('path');

let parser;
try {
  parser = require('@babel/parser');
} catch (e) {
  console.error('extract-xstate: @babel/parser not resolvable. Use extract-xstate-fallback.py.');
  process.exit(2);
}

function parseSource(source) {
  return parser.parse(source, {
    sourceType: 'module',
    allowReturnOutsideFunction: true,
    plugins: ['typescript', 'jsx'],
  });
}

function findFirst(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'range') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        const hit = findFirst(child, predicate);
        if (hit) return hit;
      }
    } else if (value && typeof value === 'object') {
      const hit = findFirst(value, predicate);
      if (hit) return hit;
    }
  }
  return null;
}

function isCreateMachine(node) {
  if (node.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (!callee) return false;
  if (callee.type === 'Identifier' && callee.name === 'createMachine') return true;
  if (callee.type === 'MemberExpression' && callee.property && callee.property.name === 'createMachine') return true;
  return false;
}

const OPAQUE = Symbol('opaque');

function lift(node) {
  if (!node) return undefined;
  switch (node.type) {
    case 'StringLiteral':  return node.value;
    case 'NumericLiteral': return node.value;
    case 'BooleanLiteral': return node.value;
    case 'NullLiteral':    return null;
    case 'TemplateLiteral':
      return node.expressions.length === 0 ? node.quasis[0].value.cooked : { [OPAQUE]: 'template-literal' };
    case 'ArrayExpression':
      return node.elements.map(el => (el == null ? null : lift(el)));
    case 'ObjectExpression': {
      const out = {};
      const caveats = [];
      for (const prop of node.properties) {
        if (prop.type === 'SpreadElement') { caveats.push('spread-element-skipped'); continue; }
        if (prop.computed) { caveats.push('computed-property-skipped'); continue; }
        if (prop.type === 'ObjectMethod') {
          const k = prop.key.name || prop.key.value;
          if (k) out[k] = { [OPAQUE]: 'method' };
          continue;
        }
        const key =
          prop.key.type === 'Identifier'    ? prop.key.name :
          prop.key.type === 'StringLiteral' ? prop.key.value :
          null;
        if (!key) { caveats.push('non-literal-property-skipped'); continue; }
        out[key] = lift(prop.value);
      }
      if (caveats.length) out.__caveats = caveats;
      return out;
    }
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return { [OPAQUE]: 'function' };
    case 'Identifier':
      return { [OPAQUE]: 'identifier', name: node.name };
    case 'UnaryExpression':
      if (node.operator === '-' && node.argument.type === 'NumericLiteral') return -node.argument.value;
      return { [OPAQUE]: 'unary' };
    default:
      return { [OPAQUE]: node.type };
  }
}

function isOpaque(v) {
  return v && typeof v === 'object' && OPAQUE in v;
}

function normalizeGuard(value) {
  if (value === undefined || value === null) return { type: 'always' };
  if (typeof value === 'boolean')             return value ? { type: 'always' } : { type: 'literalFalse' };
  if (typeof value === 'string')              return { type: 'expr', expr: value };
  if (isOpaque(value)) {
    if (value[OPAQUE] === 'function')   return { type: 'function' };
    if (value[OPAQUE] === 'identifier') return { type: 'expr', expr: value.name };
    return { type: 'function' };
  }
  return { type: 'expr', expr: JSON.stringify(value) };
}

function normalizeTransitionList(value, parentPath) {
  // Returns [{target, guard}, …]. target is the raw target string (resolution
  // happens in resolveTarget after the full state tree is known).
  if (typeof value === 'string') return [{ target: value, guard: { type: 'always' } }];
  if (Array.isArray(value)) {
    return value.map(item => {
      if (typeof item === 'string') return { target: item, guard: { type: 'always' } };
      if (item && typeof item === 'object') {
        return { target: item.target, guard: normalizeGuard(item.cond ?? item.guard) };
      }
      return { target: undefined, guard: { type: 'function' } };
    });
  }
  if (value && typeof value === 'object') {
    return [{ target: value.target, guard: normalizeGuard(value.cond ?? value.guard) }];
  }
  return [];
}

function buildIR(config) {
  const ir = {
    id: typeof config.id === 'string' ? config.id : null,
    initial: null,
    final: [],
    events: [],
    states: [],
    transitions: [],
    compound: {},
    parallel: {},
    caveats: [],
  };
  if (config.__caveats) ir.caveats.push(...config.__caveats.map(c => `root: ${c}`));

  const eventSet = new Set();
  const pendingTransitions = [];

  function fq(parentPath, name) { return parentPath ? `${parentPath}.${name}` : name; }

  function walk(name, node, parentPath) {
    const full = fq(parentPath, name);
    ir.states.push(full);
    if (!node || typeof node !== 'object') return;
    if (node.__caveats) ir.caveats.push(...node.__caveats.map(c => `${full}: ${c}`));

    if (node.type === 'final') ir.final.push(full);

    if (node.type === 'parallel') {
      const children = Object.keys(node.states || {});
      ir.parallel[full] = children.map(c => fq(full, c));
      for (const c of children) walk(c, node.states[c], full);
    } else if (node.states && typeof node.states === 'object' && Object.keys(node.states).length > 0) {
      const children = Object.keys(node.states);
      const initial = typeof node.initial === 'string' ? fq(full, node.initial) : fq(full, children[0]);
      ir.compound[full] = { initial, children: children.map(c => fq(full, c)) };
      for (const c of children) walk(c, node.states[c], full);
    }

    for (const [event, target] of Object.entries(node.on || {})) {
      eventSet.add(event);
      const list = normalizeTransitionList(target, full);
      for (const t of list) {
        pendingTransitions.push({ from: full, event, target: t.target, guard: t.guard });
      }
    }
  }

  if (config.states && typeof config.states === 'object') {
    for (const [name, state] of Object.entries(config.states)) {
      if (name === '__caveats') continue;
      walk(name, state || {}, '');
    }
  }

  ir.initial = typeof config.initial === 'string' ? config.initial : null;
  ir.events = [...eventSet];

  const stateSet = new Set(ir.states);
  for (const p of pendingTransitions) {
    if (!p.target) { ir.caveats.push(`${p.from} -${p.event}->: missing target`); continue; }
    let resolved = p.target;
    if (!stateSet.has(resolved)) {
      const parent = p.from.includes('.') ? p.from.slice(0, p.from.lastIndexOf('.')) : '';
      const sibling = fq(parent, resolved);
      if (stateSet.has(sibling)) resolved = sibling;
    }
    ir.transitions.push({ from: p.from, event: p.event, to: resolved, guard: p.guard });
  }

  return ir;
}

function extractFromSource(source) {
  let ast;
  try { ast = parseSource(source); } catch (e) { return { error: 3, reason: `parse failed: ${e.message}` }; }
  const call = findFirst(ast, isCreateMachine);
  if (!call) return { error: 4, reason: 'no createMachine(...) call found' };
  const arg = call.arguments[0];
  if (!arg || arg.type !== 'ObjectExpression') return { error: 5, reason: 'createMachine() first argument is not a static object literal' };
  const config = lift(arg);
  return { ir: buildIR(config) };
}

function selfTest() {
  const fixture = `
    import { createMachine } from 'xstate';
    export const m = createMachine({
      id: 'auth',
      initial: 'loggedOut',
      states: {
        loggedOut: {
          on: {
            SUBMIT: [
              { target: 'adminFlow',    cond: 'isAdmin' },
              { target: 'adminFlow',    cond: 'isAdmin' },
              { target: 'standardFlow' }
            ],
            CANCEL: 'loggedOut'
          }
        },
        adminFlow:    { type: 'final' },
        standardFlow: { type: 'final' },
        passwordReset: {}
      }
    });
  `;
  const result = extractFromSource(fixture);
  if (result.error) { console.error(`self-test: ${result.reason}`); process.exit(6); }
  const ir = result.ir;
  const expect = (cond, msg) => { if (!cond) { console.error(`self-test FAIL: ${msg}`); process.exit(6); } };
  expect(ir.id === 'auth', 'id is auth');
  expect(ir.initial === 'loggedOut', 'initial is loggedOut');
  expect(ir.final.includes('adminFlow') && ir.final.includes('standardFlow'), 'final states resolved');
  expect(ir.states.includes('passwordReset'), 'passwordReset declared');
  expect(ir.events.sort().join(',') === 'CANCEL,SUBMIT', 'events extracted');
  const submits = ir.transitions.filter(t => t.from === 'loggedOut' && t.event === 'SUBMIT');
  expect(submits.length === 3, `expected 3 SUBMIT transitions, got ${submits.length}`);
  expect(submits[0].guard.type === 'expr' && submits[0].guard.expr === 'isAdmin', 'guard #1 is expr isAdmin');
  expect(submits[1].guard.type === 'expr' && submits[1].guard.expr === 'isAdmin', 'guard #2 is expr isAdmin');
  expect(submits[2].guard.type === 'always', 'guard #3 is always');
  console.log('extract-xstate.cjs self-test: PASS');
}

function parseArgs(argv) {
  const out = { input: null, sidecar: null, noSidecar: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-sidecar') { out.noSidecar = true; continue; }
    if (a === '--out') {
      if (i + 1 >= argv.length) { console.error('extract-xstate: --out requires a path'); process.exit(2); }
      out.sidecar = argv[++i]; continue;
    }
    if (a.startsWith('--out=')) { out.sidecar = a.slice('--out='.length); continue; }
    if (a.startsWith('--')) { console.error(`extract-xstate: unknown flag '${a}'`); process.exit(2); }
    if (out.input === null) { out.input = a; continue; }
    console.error(`extract-xstate: unexpected positional argument '${a}'`); process.exit(2);
  }
  return out;
}

function deriveSidecarPath(input) {
  const ext = path.extname(input);
  return (ext ? input.slice(0, -ext.length) : input) + '.fsm.ir.json';
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.input) {
    console.error('extract-xstate: usage: extract-xstate.cjs <file> [--out <path>] [--no-sidecar]');
    process.exit(2);
  }
  if (args.input === 'self-test') { selfTest(); return; }
  let source;
  try { source = fs.readFileSync(args.input, 'utf8'); }
  catch (e) { console.error(`extract-xstate: cannot read ${args.input}: ${e.message}`); process.exit(2); }
  const result = extractFromSource(source);
  if (result.error) { console.error(`extract-xstate: ${result.reason}`); process.exit(result.error); }
  const json = JSON.stringify(result.ir, null, 2);
  console.log(json);
  if (!args.noSidecar) {
    const sidecarPath = args.sidecar || deriveSidecarPath(args.input);
    fs.writeFileSync(sidecarPath, json + '\n');
  }
}

main();
