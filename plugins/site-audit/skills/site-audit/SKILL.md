---
name: audit-site
description: >
  Audit a website for UX issues, bugs, accessibility problems, performance issues,
  and behavior that would surprise users. Use when the user says "audit this site",
  "check this URL", "review this website", "find issues on", "test this page",
  "what's wrong with", or anything about evaluating a live website for quality.
  Writes a site-audit-report.md with findings grouped by severity.
tools: WebFetch, Bash, Agent, Write, Read, TaskCreate, TaskUpdate
version: 1.1
---

# Site Audit

Audit a live website by first crawling it once with `site-mapper` to produce a
shared `sitemap.json` artifact, then spawning four specialist agents in
parallel that all read the same artifact. Aggregate findings into
`site-audit-report.md`.

**Prereqs:** Node.js ≥ 18 (for `npx`). The Playwright MCP server is required
(declared in `plugins/site-audit/.mcp.json`) — `site-mapper` hard-fails if it
is not available, because every downstream agent depends on the real selectors
and runtime observations only a browser can produce. axe-cli, pa11y, and
Lighthouse are still fetched on demand via `npx --yes` per their respective
agents.

---

## Task Tracking

Before doing any work, call `TaskCreate` for each phase below. Call `TaskUpdate` (status `in_progress`) when you begin a phase and `TaskUpdate` (status `completed`) when you finish it.

- Get URL and verify reachability
- Build site map
- Run parallel analysis (UX, accessibility, performance, bugs)
- Parse results
- Write report

---

## Phase 0 — Get the URL

Extract the target URL from the user's message.

If no URL was provided, ask:
> "Which website URL should I audit?"

Normalize:
- Add `https://` if no scheme is present
- Strip trailing slash

Compute the host (e.g. `example.com`) and the working directory:
`/tmp/site-audit-<host>/`. Create the directory:

```bash
mkdir -p /tmp/site-audit-<host>
```

The `sitemap.json` artifact will live at `/tmp/site-audit-<host>/sitemap.json`.

---

## Phase 1 — Verify reachability

Fetch the homepage using WebFetch. If it fails, stop and report:
> "Cannot reach [URL]: [error]. Please check the URL and try again."

Extract the page title and meta description. Do not save or embed the full
HTML — the sitemap artifact produced by `site-mapper` is the canonical source
of page structure for all downstream agents.

---

## Phase 3a — Build the site map (sequential)

Spawn `site-mapper` and **wait for it** before starting Phase 3b. The artifact
it writes is the shared input for all four downstream agents.

### Agent: site-audit:site-mapper

Prompt:
```
Crawl [URL] and write a sitemap artifact.

Sitemap output path: /tmp/site-audit-<host>/sitemap.json

Crawl rules and selector recording rules are in your agent definition.
Hard-fail with a JSON error message if the Playwright MCP server is
unavailable — do not fall back to passive analysis.
```

When `site-mapper` returns:

- If the response is a JSON object with an `error` field, **stop the entire
  audit** and surface the message to the user:
  > "Site map could not be built: [error message]. The audit cannot continue
  > without it. Please install the Playwright MCP server (`npx --yes
  > @playwright/mcp@latest`) and re-run."
  Do not write `site-audit-report.md`.
- Otherwise verify the file exists with a one-line `Read` of its first lines.
  If the file is missing despite no explicit error, stop with the same error
  message.

---

## Phase 3b — Parallel analysis

Spawn the four specialist agents **simultaneously** using the Agent tool. Do
not wait for one before starting the next — fire all four in the same turn.
Each receives the sitemap path so it can ground its work in the same observed
reality.

### Agent: site-audit:ux-analyst

Prompt:
```
Audit the UX of [URL].

Sitemap path: /tmp/site-audit-<host>/sitemap.json
UX checklist: plugins/site-audit/references/ux-checks.md — Read this file first.

Return ONLY a JSON array of findings. No prose, no markdown fences.
Each object: {"severity":"critical|high|medium|low","category":"<from checklist>","page":"<url>","issue":"<description>","recommendation":"<specific fix>"}
```

### Agent: site-audit:accessibility-auditor

Prompt:
```
Audit the accessibility of [URL].

Sitemap path: /tmp/site-audit-<host>/sitemap.json
WCAG checklist (includes CLI severity mapping): plugins/site-audit/references/accessibility-checks.md — Read this file first.

Return ONLY a JSON array of findings. No prose, no markdown fences.
Each object: {"severity":"critical|high|medium|low","wcag":"<criterion>","page":"<url>","element":"<selector or description>","issue":"<description>","recommendation":"<specific fix>"}
```

### Agent: site-audit:performance-auditor

Prompt:
```
Audit the performance of [URL].

Sitemap path: /tmp/site-audit-<host>/sitemap.json
Performance thresholds and manual checks: plugins/site-audit/references/performance-checks.md — Read this file first.

Return ONLY a JSON object. No prose, no markdown fences.
Format: {"lighthouseScore":<0-100 or null>,"findings":[{"severity":"critical|high|medium|low","metric":"<metric>","page":"<url>","issue":"<description>","value":"<measured value or null>","recommendation":"<specific fix>"}]}
```

### Agent: site-audit:bug-script-runner

This agent reads the sitemap, generates a Playwright spec tailored to the
real selectors observed during the crawl, executes it, and parses the JSON
reporter output. On Windows it falls back to Playwright MCP tools directly.

Prompt:
```
Find functional bugs on [URL].

Sitemap path: /tmp/site-audit-<host>/sitemap.json
Working directory: /tmp/site-audit-<host>/
Bug patterns catalogue: plugins/site-audit/references/bug-patterns.md — Read this file first.
Script-authoring rules: plugins/site-audit/references/script-authoring.md — Read this file too.

Return ONLY a JSON array of findings. No prose, no markdown fences.
Each object: {"severity":"critical|high|medium|low","type":"<bug type>","page":"<url>","issue":"<description, prefix with click path or test title if useful>","recommendation":"<specific fix>"}
```

Wait for all four agents to complete.

---

## Phase 4 — Parse results

For each agent response:

1. Strip any accidental markdown fences (` ```json ` ... ` ``` `)
2. Parse as JSON
3. If parsing fails, wrap the raw text as a single finding:
   `{"severity":"low","category":"other","page":"[URL]","issue":"Agent returned unparseable output: [first 200 chars]","recommendation":"Re-run the audit"}`

For the performance agent, extract `findings` array from the object; record
`lighthouseScore` separately.

Collect all findings in four lists: `uxFindings`, `a11yFindings`,
`perfFindings`, `bugFindings`.

---

## Phase 5 — Write report

Compute per-list counts by severity (critical / high / medium / low / total).

Write `site-audit-report.md` in the current directory. Use this exact
structure:

```markdown
# Site Audit: [URL]
*Generated: [ISO 8601 date and time UTC]*

## Summary

| Category       | Critical | High | Medium | Low | Total |
|----------------|----------|------|--------|-----|-------|
| UX             | N        | N    | N      | N   | N     |
| Accessibility  | N        | N    | N      | N   | N     |
| Performance    | N        | N    | N      | N   | N     |
| Bugs           | N        | N    | N      | N   | N     |
| **Total**      | **N**    | **N**| **N**  | **N**| **N** |

[If lighthouseScore is not null: > **Lighthouse performance score: N/100**]

---

## Critical Issues

[All findings with severity=critical from any category, formatted as:]

### [category/type] — [page]
**Issue:** [issue]
**Fix:** [recommendation]

---

## UX Issues

[All UX findings with severity != critical, grouped by severity: High → Medium → Low]

### High

- **[page]** ([category]) — [issue]
  *Fix: [recommendation]*

### Medium
...

### Low
...

[If no issues: *No UX issues found.*]

---

## Accessibility Issues

[Same structure as UX Issues, plus WCAG criterion where present]

---

## Performance Issues

[Same structure, with metric, page, and value where present]

---

## Bugs & Functional Issues

[Same structure, with type label. Bug findings come from a Playwright spec run
against real selectors observed during the crawl, so each entry maps to a
concrete failed assertion.]

---

## Top 5 Recommendations

Pick the 5 most impactful fixes across all categories. Rank by: severity first,
then estimated fix effort (quick wins before large refactors).

1. **[Title]** — [one sentence why this matters and what to do]
2. ...
```

After writing, confirm to the user:
> "Audit complete. Report written to `site-audit-report.md`.
> Found **N** issues: N critical, N high, N medium, N low.
> Generated Playwright spec preserved at `/tmp/site-audit-<host>/bugs.spec.ts`
> for re-running."
