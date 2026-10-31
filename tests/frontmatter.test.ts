import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../scripts/lib/frontmatter.js';

const fm = (body: string) => parseFrontmatter(`---\n${body}\n---\ncontent`);

describe('parseFrontmatter tools', () => {
  it('splits comma-separated tools', () => {
    expect(fm('tools: Read, Grep').tools).toEqual(['Read', 'Grep']);
  });

  it('maps a space-separated allowed-tools string onto tools', () => {
    expect(fm('allowed-tools: Bash Read Glob').tools).toEqual(['Bash', 'Read', 'Glob']);
  });

  it('keeps scoped entries with spaces whole', () => {
    expect(fm('allowed-tools: Read Bash(git add:*) Grep').tools)
      .toEqual(['Read', 'Bash(git add:*)', 'Grep']);
  });

  it('reads allowed-tools as a block list', () => {
    expect(fm('allowed-tools:\n  - Read\n  - Grep').tools).toEqual(['Read', 'Grep']);
  });

  it('reads allowed-tools as a flow list', () => {
    expect(fm('allowed-tools: [Read, Grep]').tools).toEqual(['Read', 'Grep']);
  });

  it('prefers an explicit tools key over allowed-tools', () => {
    expect(fm('tools: Read\nallowed-tools: Write').tools).toEqual(['Read']);
  });
});

describe('parseFrontmatter block scalars', () => {
  it('folds >- descriptions', () => {
    const r = fm('description: >-\n  first line\n  second line\nname: x');
    expect(r.description).toBe('first line second line');
    expect(r.name).toBe('x');
  });

  it('keeps newlines for | scalars', () => {
    expect(fm('description: |\n  a\n  b').description).toBe('a\nb');
  });
});
