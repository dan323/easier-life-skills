---
name: audit-site
description: >
  Audit a website for UX issues, bugs, accessibility problems, performance issues,
  and behavior that would surprise users. Use when the user says "audit this site",
  "check this URL", "review this website", "find issues on", "test this page",
  "what's wrong with", or anything about evaluating a live website for quality.
  Writes a site-audit-report.md with findings grouped by severity.
tools: WebFetch, Bash, Agent, Write, Read
version: 1.0
---

# Site Audit

Audit a live website by spawning four specialist agents in parallel, then aggregate
their findings into `site-audit-report.md`.

**Prereqs:** Node.js for optional CLI tools (axe-cli, pa11y, Lighthouse, Playwright).
All tools are tried with `npx --yes` so no global install is required.

---

## Phase 0 — Get the URL

Extract the target URL from the user's message.

If no URL was provided, ask:
> "Which website URL should I audit?"

Normalize:
- Add `https://` if no scheme is present
- Strip trailing slash

---

## Phase 1 — Verify reachability

Fetch the homepage using WebFetch. If it fails, stop and report:
> "Cannot reach [URL]: [error]. Please check the URL and try again."

From the response, extract and save:
- Page title (from `<title>`)
- Meta description content
- Homepage HTML (save first 8 000 characters for passing to agents)

---

## Phase 2 — Load references

Read all four reference files. These contain the checklists each agent uses.
Reading them now (once, lazily) avoids embedding the content in every agent
definition and keeps the reference docs as a single source of truth.

```
Read: plugins/site-audit/references/ux-checks.md          → UX_CHECKS
Read: plugins/site-audit/references/accessibility-checks.md → A11Y_CHECKS
Read: plugins/site-audit/references/performance-checks.md  → PERF_CHECKS
Read: plugins/site-audit/references/bug-patterns.md        → BUG_PATTERNS
```

---

## Phase 3 — Parallel analysis

Spawn all four agents **simultaneously** using the Agent tool. Do not wait for one
before starting the next — fire them all in the same turn.

### Agent: site-audit:ux-analyst

Prompt:
```
Audit the UX of [URL].

Homepage HTML (first 8000 chars):
[HTML]

UX checklist to apply:
[UX_CHECKS]

Return ONLY a JSON array of findings. No prose, no markdown fences.
Each object: {"severity":"critical|high|medium|low","category":"<from checklist>","page":"<url>","issue":"<description>","recommendation":"<specific fix>"}
```

### Agent: site-audit:accessibility-auditor

Prompt:
```
Audit the accessibility of [URL].

Homepage HTML (first 8000 chars):
[HTML]

WCAG checklist to apply (also contains CLI severity mapping):
[A11Y_CHECKS]

Return ONLY a JSON array of findings. No prose, no markdown fences.
Each object: {"severity":"critical|high|medium|low","wcag":"<criterion>","page":"<url>","element":"<selector or description>","issue":"<description>","recommendation":"<specific fix>"}
```

### Agent: site-audit:performance-auditor

Prompt:
```
Audit the performance of [URL].

Performance thresholds and manual checks:
[PERF_CHECKS]

Return ONLY a JSON object. No prose, no markdown fences.
Format: {"lighthouseScore":<0-100 or null>,"findings":[{"severity":"critical|high|medium|low","metric":"<metric>","issue":"<description>","value":"<measured value or null>","recommendation":"<specific fix>"}]}
```

### Agent: site-audit:bug-hunter

Prompt:
```
Find functional bugs on [URL].

Homepage HTML (first 8000 chars):
[HTML]

Bug patterns catalogue:
[BUG_PATTERNS]

Return ONLY a JSON array of findings. No prose, no markdown fences.
Each object: {"severity":"critical|high|medium|low","type":"<bug type>","page":"<url>","issue":"<description>","recommendation":"<specific fix>"}
```

Wait for all four agents to complete.

---

## Phase 4 — Parse results

For each agent response:

1. Strip any accidental markdown fences (` ```json ` ... ` ``` `)
2. Parse as JSON
3. If parsing fails, wrap the raw text as a single finding:
   `{"severity":"low","category":"other","page":"[URL]","issue":"Agent returned unparseable output: [first 200 chars]","recommendation":"Re-run the audit"}`

For the performance agent, extract `findings` array from the object; record `lighthouseScore` separately.

Collect all findings in four lists: `uxFindings`, `a11yFindings`, `perfFindings`, `bugFindings`.

---

## Phase 5 — Write report

Compute per-list counts by severity (critical / high / medium / low / total).

Write `site-audit-report.md` in the current directory. Use this exact structure:

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

[Same structure, with metric and value where present]

---

## Bugs & Functional Issues

[Same structure, with type label]

---

## Top 5 Recommendations

Pick the 5 most impactful fixes across all categories. Rank by: severity first,
then estimated fix effort (quick wins before large refactors).

1. **[Title]** — [one sentence why this matters and what to do]
2. ...
```

After writing, confirm to the user:
> "Audit complete. Report written to `site-audit-report.md`.
> Found **N** issues: N critical, N high, N medium, N low."
