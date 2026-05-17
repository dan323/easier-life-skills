import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join } from 'path';

vi.mock('../src/lib/claude.js');
vi.mock('../src/lib/shim.js');

import * as claude from '../src/lib/claude.js';
import * as shim from '../src/lib/shim.js';
import { installSkillsRespectingSource } from '../src/lib/actions.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixture = JSON.parse(readFileSync(join(__dirname, 'fixture.json'), 'utf8'));
const { skills, meta } = fixture;
const sources = meta.sources;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(claude.claudeAvailable).mockResolvedValue(true);
  vi.mocked(claude.getRegisteredMarketplaces).mockResolvedValue(new Set());
  vi.mocked(claude.addMarketplace).mockResolvedValue(undefined);
  vi.mocked(claude.installPlugin).mockResolvedValue(undefined);
  vi.mocked(shim.writeShim).mockReturnValue('/fake/shim/mattpocock-skills');
});

// ── marketplace skill ─────────────────────────────────────────────────────────

describe('installSkillsRespectingSource — marketplace skill', () => {
  it('registers the upstream repo as a marketplace', async () => {
    const skill = skills.find((s: any) => s.name === 'changelog');
    await installSkillsRespectingSource([skill], sources, { dryRun: true });
    expect(claude.addMarketplace).toHaveBeenCalledWith('dan323/easier-life-skills', true);
  });

  it('installs the plugin from the upstream repo', async () => {
    const skill = skills.find((s: any) => s.name === 'changelog');
    await installSkillsRespectingSource([skill], sources, { dryRun: true });
    expect(claude.installPlugin).toHaveBeenCalledWith('docs', 'easier-life-skills', true);
  });

  it('does not register a marketplace already registered', async () => {
    vi.mocked(claude.getRegisteredMarketplaces).mockResolvedValue(new Set(['easier-life-skills']));
    const skill = skills.find((s: any) => s.name === 'changelog');
    await installSkillsRespectingSource([skill], sources, { dryRun: true });
    expect(claude.addMarketplace).not.toHaveBeenCalled();
  });
});

// ── plugin-only skill ─────────────────────────────────────────────────────────

describe('installSkillsRespectingSource — plugin-only skill', () => {
  it('writes a shim for plugin-only source repos', async () => {
    const skill = skills.find((s: any) => s.name === 'tdd');
    await installSkillsRespectingSource([skill], sources, { dryRun: true });
    expect(shim.writeShim).toHaveBeenCalledWith(skill, expect.any(Set), true);
  });

  it('registers the shim directory as a marketplace', async () => {
    const skill = skills.find((s: any) => s.name === 'tdd');
    await installSkillsRespectingSource([skill], sources, { dryRun: true });
    expect(claude.addMarketplace).toHaveBeenCalledWith('/fake/shim/mattpocock-skills', true);
  });

  it('installs the plugin from the shim marketplace', async () => {
    const skill = skills.find((s: any) => s.name === 'tdd');
    await installSkillsRespectingSource([skill], sources, { dryRun: true });
    expect(claude.installPlugin).toHaveBeenCalledWith('mattpocock-skills', 'mattpocock-skills', true);
  });
});

// ── deduplication ─────────────────────────────────────────────────────────────

describe('installSkillsRespectingSource — deduplication', () => {
  it('installs a shared plugin only once across a bundle', async () => {
    // find-dead-code and improve-logging both share pluginName 'code-audit'
    const bundleSkills = skills.filter((s: any) =>
      s.name === 'find-dead-code' || s.name === 'improve-logging',
    );
    await installSkillsRespectingSource(bundleSkills, sources, { dryRun: true });
    const codeAuditCalls = vi.mocked(claude.installPlugin).mock.calls
      .filter(([name]) => name === 'code-audit');
    expect(codeAuditCalls).toHaveLength(1);
  });

  it('registers each marketplace only once even for multiple skills', async () => {
    const bundleSkills = skills.filter((s: any) =>
      s.name === 'find-dead-code' || s.name === 'improve-logging',
    );
    await installSkillsRespectingSource(bundleSkills, sources, { dryRun: true });
    const mpCalls = vi.mocked(claude.addMarketplace).mock.calls
      .filter(([src]) => src === 'dan323/easier-life-skills');
    expect(mpCalls).toHaveLength(1);
  });
});

// ── error handling ────────────────────────────────────────────────────────────

describe('installSkillsRespectingSource — error handling', () => {
  it('throws when claude is not available', async () => {
    vi.mocked(claude.claudeAvailable).mockResolvedValue(false);
    const skill = skills.find((s: any) => s.name === 'changelog');
    await expect(
      installSkillsRespectingSource([skill], sources),
    ).rejects.toThrow('claude');
  });
});
