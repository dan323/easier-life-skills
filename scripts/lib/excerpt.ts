/* lib/excerpt.ts — builds the short SKILL.md preview shown in the web UI detail panels */

/** Maximum excerpt length in characters, inclusive of the trailing ellipsis. */
export const EXCERPT_LIMIT = 1000;

// Same invisible / direction-override set the injection scanner flags.
const HIDDEN_CHARS = /[​-‏‪-‮﻿]/g;

/** A heading that opens the step-by-step part of a skill: `## Phase 1: …`, `### Step 2 — …`. */
const PHASE_HEADING = /^ {0,3}#{1,6}\s+(phase|step)\b/i;

/**
 * Return the opening part of a SKILL.md body (frontmatter stripped): everything
 * up to the first "Phase"/"Step" heading, capped at `limit` characters. When the
 * cap cuts the text, it backs off to the last line or word boundary and appends
 * an ellipsis. Headings inside fenced code blocks are ignored. Returns '' when
 * nothing is left.
 *
 * The result is raw markdown from a possibly untrusted repo. Consumers must
 * treat it as an opaque string and render it as plain text, never as HTML.
 */
export function extractExcerpt(content: string, limit: number = EXCERPT_LIMIT): string {
  const normalized = content.replace(/\r\n?/g, '\n').replace(HIDDEN_CHARS, '');
  const body = normalized.replace(/^---\n(?:[\s\S]*?\n)?---[ \t]*(\n|$)/, '');

  const kept: string[] = [];
  // CommonMark: a fence closes only on the same character, at least as long as
  // the opener, with nothing but whitespace after it.
  let fence: { ch: string; len: number } | null = null;
  for (const line of body.split('\n')) {
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
      const run = close?.[1] ?? '';
      if (run && run[0] === fence.ch && run.length >= fence.len) fence = null;
    } else {
      const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      const run = open?.[1] ?? '';
      if (run && !(run.startsWith('`') && (open?.[2] ?? '').includes('`'))) {
        fence = { ch: run.charAt(0), len: run.length };
      } else if (PHASE_HEADING.test(line)) {
        break;
      }
    }
    kept.push(line);
  }

  const text = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length <= limit) return text;

  let hard = text.slice(0, limit - 1);
  // Don't leave half of a surrogate pair at the cut.
  if (/[\uD800-\uDBFF]$/.test(hard)) hard = hard.slice(0, -1);
  const minCut = Math.floor(limit / 2);
  const nl = hard.lastIndexOf('\n');
  const sp = hard.lastIndexOf(' ');
  const cut = nl >= minCut ? nl : sp >= minCut ? sp : hard.length;
  return hard.slice(0, cut).trimEnd() + '…';
}
