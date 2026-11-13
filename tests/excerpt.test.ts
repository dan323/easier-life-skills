import { describe, it, expect } from 'vitest';
import { extractExcerpt, buildPreview, EXCERPT_LIMIT } from '../scripts/lib/excerpt.js';

describe('extractExcerpt', () => {
  it('strips frontmatter and stops at the first phase heading', () => {
    const md = [
      '---',
      'name: demo',
      'description: Demo skill',
      '---',
      '',
      '# Demo',
      '',
      'Intro paragraph.',
      '',
      '## Task Tracking',
      'Track things.',
      '',
      '## Phase 1: Detect',
      'Phase body that must not appear.',
    ].join('\n');
    expect(extractExcerpt(md)).toBe('# Demo\n\nIntro paragraph.\n\n## Task Tracking\nTrack things.');
  });

  it('also stops at "Step" headings and handles CRLF', () => {
    const md = '---\r\nname: x\r\n---\r\n# X\r\n\r\nHello.\r\n\r\n### Step 1 — Parse\r\nhidden';
    expect(extractExcerpt(md)).toBe('# X\n\nHello.');
  });

  it('ignores phase-like headings inside fenced code blocks', () => {
    const md = '# X\n\n```bash\n# Phase 1 comment\nls\n```\n\nAfter fence.\n\n## Phase 1\nhidden';
    expect(extractExcerpt(md)).toBe('# X\n\n```bash\n# Phase 1 comment\nls\n```\n\nAfter fence.');
  });

  it('caps long bodies at the limit on a word boundary with an ellipsis', () => {
    const md = '# Long\n\n' + 'word '.repeat(600);
    const out = extractExcerpt(md);
    expect(out.length).toBeLessThanOrEqual(EXCERPT_LIMIT);
    expect(out.endsWith('…')).toBe(true);
    expect(out.endsWith(' …')).toBe(false);
    expect(out.slice(0, -1).endsWith('word')).toBe(true);
  });

  it('respects a custom limit', () => {
    const out = extractExcerpt('abcdefghijklmnopqrstuvwxyz', 10);
    expect(out).toBe('abcdefghi…');
  });

  it('removes invisible and bidi-override characters', () => {
    expect(extractExcerpt('# A​b‮﻿c')).toBe('# Abc');
  });

  it('buildPreview reports whether the excerpt is only part of the body', () => {
    expect(buildPreview('---\nname: x\n---\n# X\n\nShort.')).toEqual({ excerpt: '# X\n\nShort.', truncated: false });
    expect(buildPreview('# X\n\nIntro.\n\n## Phase 1\nmore').truncated).toBe(true);
    expect(buildPreview('x '.repeat(800)).truncated).toBe(true);
    expect(buildPreview('').truncated).toBe(false);
  });

  it('returns an empty string when the body is empty', () => {
    expect(extractExcerpt('---\nname: x\n---\n')).toBe('');
  });

  it('falls back to the opening of the body when it starts with a phase heading', () => {
    expect(extractExcerpt('---\nname: x\n---\n# Phase 1 — Interview\n\nOpen warmly.\n\n## Phase 2\nmore'))
      .toBe('# Phase 1 — Interview\n\nOpen warmly.\n\n## Phase 2\nmore');
    expect(extractExcerpt('## Phase 1\n' + 'x '.repeat(800)).length).toBeLessThanOrEqual(1000);
  });

  it('keeps a ~~~ block with a sample phase heading inside a ``` block', () => {
    const md = '# X\n\n```md\n~~~\n## Phase 1\n~~~\n## Phase 2\n```\n\nAfter.\n\n## Phase 1\nhidden';
    expect(extractExcerpt(md)).toBe('# X\n\n```md\n~~~\n## Phase 1\n~~~\n## Phase 2\n```\n\nAfter.');
  });

  it('handles a 4-backtick wrapper around a 3-backtick block', () => {
    const md = '# X\n\n````md\n```\n## Phase 1\n```\n## Phase 2\n````\nAfter\n## Step 1\nhidden';
    expect(extractExcerpt(md)).toBe('# X\n\n````md\n```\n## Phase 1\n```\n## Phase 2\n````\nAfter');
  });

  it('does not close a fence on a line with trailing text', () => {
    const md = '# X\n```\n``` not a close\n## Phase 1\n```\nAfter\n## Phase 1\nhidden';
    expect(extractExcerpt(md)).toBe('# X\n```\n``` not a close\n## Phase 1\n```\nAfter');
  });

  it('does not split a surrogate pair when truncating', () => {
    expect(extractExcerpt('\u{1F600}'.repeat(20), 10)).toBe('\u{1F600}'.repeat(4) + '…');
  });

  it('stops at indented (up to 3 spaces) phase headings', () => {
    expect(extractExcerpt('# X\nintro\n  ## Phase 1\nhidden')).toBe('# X\nintro');
  });

  it('strips empty frontmatter blocks', () => {
    expect(extractExcerpt('---\n---\n# X\nbody')).toBe('# X\nbody');
  });

  it('leaves HTML-looking text untouched (escaping is the renderer\'s job)', () => {
    expect(extractExcerpt('# X\n<script>alert(1)</script>')).toBe('# X\n<script>alert(1)</script>');
  });
});
