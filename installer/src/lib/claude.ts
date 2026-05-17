// All subprocess interaction with `claude` lives here.
// Exported so tests can mock this module without touching the program.
// These are thin wrappers — no orchestration state (Sets, dedup) lives here.

import { spawn } from 'child_process';
import type { InstalledPlugin } from './types.js';

interface RunOptions {
  capture?: boolean;
}

interface RunResult {
  stdout: string;
  stderr: string;
}

export function runCmd(cmd: string, cmdArgs: string[], { capture = false }: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, {
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout?.on('data', (d: Buffer) => { stdout += d; });
      child.stderr?.on('data', (d: Buffer) => { stderr += d; });
    }
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`\`${cmd} ${cmdArgs.join(' ')}\` exited ${code}${stderr ? '\n' + stderr.trim() : ''}`));
    });
  });
}

export function runClaude(claudeArgs: string[], opts: RunOptions = {}): Promise<RunResult> {
  return runCmd('claude', claudeArgs, opts).catch((err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT') {
      throw new Error('`claude` is not on $PATH. Install Claude Code from https://claude.ai/code, then re-run.');
    }
    throw err;
  });
}

export async function claudeAvailable(): Promise<boolean> {
  try { await runClaude(['--version'], { capture: true }); return true; }
  catch { return false; }
}

export async function getRegisteredMarketplaces(): Promise<Set<string>> {
  try {
    const { stdout } = await runClaude(['plugin', 'marketplace', 'list', '--json'], { capture: true });
    const arr = JSON.parse(stdout) as Array<{ name: string }>;
    return new Set(arr.map((m) => m.name));
  } catch {
    return new Set();
  }
}

export async function listInstalledPlugins(): Promise<InstalledPlugin[]> {
  const { stdout } = await runClaude(['plugin', 'list', '--json'], { capture: true });
  try { return JSON.parse(stdout) as InstalledPlugin[]; } catch { return []; }
}

export async function addMarketplace(source: string, dryRun: boolean): Promise<void> {
  if (dryRun) {
    console.log(`  [dry-run] would run: claude plugin marketplace add ${source}`);
    return;
  }
  console.log(`Adding marketplace ${source}…`);
  await runClaude(['plugin', 'marketplace', 'add', source]);
}

export async function installPlugin(pluginName: string, marketplaceName: string, dryRun: boolean): Promise<void> {
  const target = `${pluginName}@${marketplaceName}`;
  if (dryRun) {
    console.log(`  [dry-run] would run: claude plugin install ${target}`);
    return;
  }
  console.log(`Installing ${target}…`);
  await runClaude(['plugin', 'install', target]);
}

export async function pluginUpdate(pluginName: string, marketplaceName: string, dryRun: boolean): Promise<void> {
  const target = `${pluginName}@${marketplaceName}`;
  if (dryRun) {
    console.log(`  [dry-run] would run: claude plugin update ${target}`);
    return;
  }
  console.log(`Updating ${target}…`);
  await runClaude(['plugin', 'update', target]);
}
