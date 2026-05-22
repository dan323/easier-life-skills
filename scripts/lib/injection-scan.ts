/* lib/injection-scan.ts — heuristic prompt-injection scanner for SKILL.md and agent .md content */

export interface ScanFlag {
  rule:   string;
  detail: string;
}

export interface ScanResult {
  passed:         boolean;
  flags:          ScanFlag[];
  /** Version string of the skill/agent at the time of scanning. */
  scannedVersion: string;
}

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
    // Zero-width space (U+200B), ZWNJ, ZWJ, LRM, RLM, LRE–PDF (U+202A–202E), BOM (U+FEFF)
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

export function scanContent(content: string, version: string): ScanResult {
  const flags: ScanFlag[] = [];
  for (const { rule, pattern, detail } of RULES) {
    if (pattern.test(content)) {
      flags.push({ rule, detail });
    }
  }
  return { passed: flags.length === 0, flags, scannedVersion: version };
}
