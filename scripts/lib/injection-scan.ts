/* lib/injection-scan.ts — heuristic prompt-injection scanner for SKILL.md, agent .md, and metadata fields */

import type { ScanFlag, ScanResult } from './types.js';

export type { ScanFlag, ScanResult };

/**
 * Rules applied in order. Each rule is checked independently; all matches
 * are collected — a single flag is enough to mark the result as failed.
 *
 * Design goal: near-zero false positives on legitimate skills. Rules target
 * patterns that are unambiguous attack signatures, not general instruction
 * language (which every SKILL.md legitimately contains).
 *
 * EXCLUDED intentionally:
 *   - "you are now ..." — common in legitimate skills ("You are now acting as a
 *     changelog generator"). Only the explicit anti-Claude override is flagged.
 *   - Generic "ignore" — skills legitimately say "ignore test files", "ignore
 *     node_modules", etc.
 */
const RULES: Array<{ rule: string; pattern: RegExp; detail: string }> = [
  {
    rule:    'hidden-chars',
    // U+200B zero-width space, U+200C ZWNJ, U+200D ZWJ,
    // U+200E LRM, U+200F RLM, U+202A–U+202E bidi overrides, U+FEFF BOM
    pattern: /[​‌‍‎‏‪‫‬‭‮﻿]/,
    detail:  'Contains invisible or direction-override Unicode characters',
  },
  {
    rule:    'system-inject',
    pattern: /ignore\s+(all\s+)?previous\s+instructions|\bDAN\s+mode\b|\[SYSTEM\]/i,
    detail:  'Contains known system-level instruction injection phrases',
  },
  {
    rule:    'anthropic-override',
    // Targets explicit attempts to disable safety guardrails, not persona instructions
    pattern: /ignore\s+anthropic['']?s?\s+guidelines|pretend\s+you\s+have\s+no\s+(alignment|restrict|guideline)/i,
    detail:  'Attempts to disable Anthropic safety guidelines',
  },
  {
    rule:    'credential-exfil',
    // Matches reading credential files; not mere path references in comments
    pattern: /(?:cat|read|open|curl\s+-[^"'\n]*)\s+["']?~\/\.(ssh\/|aws\/credentials|config\/claude|netrc\b)/i,
    detail:  'Reads sensitive credential files (possible data exfiltration)',
  },
];

/**
 * Maximum character lengths enforced on external metadata before scanning and
 * storing. Limits are inclusive of any trailing ellipsis added by truncate().
 */
export const FIELD_LIMITS = {
  description:    500,
  keyword:         60,
  maxKeywords:     20,
  name:           100,
} as const;

/**
 * Truncate a string so its length is at most `max` characters (inclusive of
 * the trailing ellipsis when truncation occurs).
 */
export function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max - 1) + '…' : value;
}

function scanField(text: string, field: string): ScanFlag[] {
  const flags: ScanFlag[] = [];
  for (const { rule, pattern, detail } of RULES) {
    if (pattern.test(text)) {
      flags.push({ rule, field, detail });
    }
  }
  return flags;
}

/** Scan the full file body (SKILL.md or agent .md). */
export function scanBody(content: string, version: string): ScanResult {
  const flags = scanField(content, 'body');
  return { passed: flags.length === 0, flags, scannedVersion: version };
}

/**
 * Scan metadata fields (description + keywords) and merge into an existing
 * body scan result. Returns a new ScanResult with all flags combined.
 */
export function mergeMetadataScan(
  bodyScan:    ScanResult,
  description: string,
  keywords:    string[],
): ScanResult {
  const descFlags = scanField(description, 'description');
  const kwFlags   = scanField(keywords.join(' '), 'keywords');
  const allFlags  = [...bodyScan.flags, ...descFlags, ...kwFlags];
  return { passed: allFlags.length === 0, flags: allFlags, scannedVersion: bodyScan.scannedVersion };
}
