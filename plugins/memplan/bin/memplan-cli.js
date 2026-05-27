#!/usr/bin/env node

/**
 * memplan-cli.js — Mechanical operations for the memplan plugin.
 *
 * Handles all file I/O for .memplan/ workspace so AI agents provide only reasoning,
 * not mechanics. See plugins/memplan/references/memscript-v1.md for format spec.
 */

import fs from 'fs';
import path from 'path';

// Initial dependency graph template from dependencies.plan.md
const INITIAL_DEPS = `dep:steps.mem=plan.mem|overview.mem
dep:slice.mem=steps.mem|progress
dep:checkpoint.mem=progress|plan.mem
dep:risk.mem=failures.mem|plan.mem
dep:budget.mem=hot.mem
`;

// Generated file header for .plan.md files
const GENERATED_HEADER = `<!-- AUTO-GENERATED from .mem counterpart - DO NOT EDIT DIRECTLY -->
<!-- This file is read-only. Edit the .mem file and run memplan-cli.js render to regenerate. -->

`;

/**
 * Parse deps.mem content into a Map: target -> Set(sources)
 */
function parseDeps(content) {
  const deps = new Map();
  const lines = content.trim().split('\n').filter(line => line.trim());

  for (const line of lines) {
    const match = line.match(/^dep:([^=]+)=(.*)$/);
    if (match) {
      const target = match[1];
      const sources = match[2] ? match[2].split('|').filter(s => s.trim()) : [];
      deps.set(target, new Set(sources));
    }
  }

  return deps;
}

/**
 * Compute transitive closure of dependency graph.
 * Returns a Map: target -> Set(all transitive sources)
 */
function computeClosure(deps) {
  const closure = new Map();

  // Initialize with direct dependencies
  for (const [target, sources] of deps) {
    closure.set(target, new Set(sources));
  }

  // Fixed-point iteration: keep expanding until no changes
  let changed = true;
  while (changed) {
    changed = false;

    for (const [target, sources] of closure) {
      const oldSize = sources.size;

      // For each direct source, add its transitive dependencies
      for (const source of Array.from(sources)) {
        if (closure.has(source)) {
          for (const transitive of closure.get(source)) {
            sources.add(transitive);
          }
        }
      }

      if (sources.size > oldSize) {
        changed = true;
      }
    }
  }

  return closure;
}

/**
 * Format closure map as MemScript dep: lines
 */
function formatClosure(closure) {
  const lines = [];

  // Sort by target name for deterministic output
  const sortedTargets = Array.from(closure.keys()).sort();

  for (const target of sortedTargets) {
    const sources = Array.from(closure.get(target)).sort();
    lines.push(`dep:${target}=${sources.join('|')}`);
  }

  return lines.join('\n') + '\n';
}

/**
 * Command: init <dir>
 * Bootstrap .memplan/ workspace from scratch. Idempotent.
 */
function cmdInit(projectDir) {
  const memplanDir = path.join(projectDir, '.memplan');

  // Check if already initialized
  if (fs.existsSync(memplanDir)) {
    console.log('Already initialised');
    return 0;
  }

  // Create directory structure
  fs.mkdirSync(memplanDir, { recursive: true });
  fs.mkdirSync(path.join(memplanDir, 'memory'), { recursive: true });
  fs.mkdirSync(path.join(memplanDir, 'decisions'), { recursive: true });
  fs.mkdirSync(path.join(memplanDir, 'inbox'), { recursive: true });
  fs.mkdirSync(path.join(memplanDir, 'sessions'), { recursive: true });

  // Write initial files
  fs.writeFileSync(path.join(memplanDir, 'progress'), '0/0 | not started\n');
  fs.writeFileSync(path.join(memplanDir, 'branch-intent'), '(not set)\n');

  // Write deps.mem with initial template
  const depsPath = path.join(memplanDir, 'deps.mem');
  fs.writeFileSync(depsPath, INITIAL_DEPS);

  // Compute and write deps-closure.mem
  const deps = parseDeps(INITIAL_DEPS);
  const closure = computeClosure(deps);
  const closurePath = path.join(memplanDir, 'deps-closure.mem');
  fs.writeFileSync(closurePath, formatClosure(closure));

  // Create empty stub files for Phase 1
  const stubFiles = [
    'plan.mem',
    'checkpoint.mem',
    'hot.mem',
    'slice.mem',
    'stale.mem',
    'overview.mem',
    'memory/persona.mem',
    'memory/entities.mem',
    'memory/aliases.mem',
    'memory/code-map.mem',
    'memory/facts.mem',
    'memory/failures.mem',
    'memory/questions.mem',
    'decisions/log.mem'
  ];

  for (const file of stubFiles) {
    const filePath = path.join(memplanDir, file);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '');
    }
  }

  // Generate .plan.md counterparts with generated header
  for (const file of stubFiles) {
    if (file.endsWith('.mem')) {
      const planPath = path.join(memplanDir, file.replace('.mem', '.plan.md'));
      fs.writeFileSync(planPath, GENERATED_HEADER);
      // Lock the .plan.md file (read-only)
      fs.chmodSync(planPath, 0o444);
    }
  }

  console.log('.memplan/ created successfully');
  return 0;
}

/**
 * Command: set <dir> <file> <key> [<value>]
 * Set a mutable key in a .mem file. Removes all existing lines matching ^key:,
 * then appends key:value.
 * For simple files like branch-intent (no MemScript), <key> is treated as the value.
 */
function cmdSet(projectDir, file, keyOrValue, value) {
  const memplanDir = path.join(projectDir, '.memplan');
  const filePath = path.join(memplanDir, file);

  // For special files like branch-intent that are not MemScript, just overwrite
  // In this case, keyOrValue is actually the value
  if (file === 'branch-intent' || file === 'progress') {
    fs.writeFileSync(filePath, keyOrValue + '\n');
    console.log(`${file} set to: ${keyOrValue}`);
    return 0;
  }

  // For MemScript files, read, modify, write
  const key = keyOrValue;
  if (value === undefined) {
    console.error('Error: MemScript files require both key and value');
    return 1;
  }

  let content = '';
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf-8');
  }

  // Remove all existing lines with this key
  const lines = content.split('\n').filter(line => {
    return !line.match(new RegExp(`^${key}:`));
  });

  // Append new key:value
  lines.push(`${key}:${value}`);

  // Write back
  const newContent = lines.filter(line => line.trim() || line === '').join('\n');
  fs.writeFileSync(filePath, newContent + '\n');

  console.log(`${file}: ${key} set`);
  return 0;
}

/**
 * Command: deps-closure <dir>
 * Compute transitive closure of deps.mem and write to deps-closure.mem
 */
function cmdDepsClosure(projectDir) {
  const memplanDir = path.join(projectDir, '.memplan');
  const depsPath = path.join(memplanDir, 'deps.mem');
  const closurePath = path.join(memplanDir, 'deps-closure.mem');

  if (!fs.existsSync(depsPath)) {
    console.error('Error: deps.mem not found');
    return 1;
  }

  const content = fs.readFileSync(depsPath, 'utf-8');
  const deps = parseDeps(content);
  const closure = computeClosure(deps);

  fs.writeFileSync(closurePath, formatClosure(closure));
  console.log('deps-closure.mem updated');
  return 0;
}

/**
 * Main entry point
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: memplan-cli.js <command> <dir> [args...]');
    console.error('Commands: init, set, deps-closure');
    return 1;
  }

  const command = args[0];
  const projectDir = path.resolve(args[1]);

  try {
    switch (command) {
      case 'init':
        return cmdInit(projectDir);
      case 'set':
        if (args.length < 4) {
          console.error('Usage: memplan-cli.js set <dir> <file> <value>  OR  set <dir> <file> <key> <value>');
          return 1;
        }
        // args[2] = file, args[3] = key or value, args[4] = value (optional)
        return cmdSet(projectDir, args[2], args[3], args[4]);
      case 'deps-closure':
        return cmdDepsClosure(projectDir);
      default:
        console.error(`Unknown command: ${command}`);
        return 1;
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return 1;
  }
}

process.exit(main());
