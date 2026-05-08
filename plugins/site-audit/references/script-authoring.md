# Playwright Script Authoring Rules

The bug-script-runner agent generates a Playwright spec file at audit time. The
rules below exist to keep that script (a) safe to run against a live site, (b)
grounded in real selectors, and (c) parseable by the JSON reporter.

## Selector grounding — non-negotiable

- Every selector used in `page.click(...)`, `page.locator(...)`,
  `page.fill(...)`, `expect(page.locator(...)).toBeVisible()`, etc. **must
  appear verbatim** in `sitemap.json` (under `forms[].selector`,
  `forms[].fields[].selector`, `forms[].submit_selector`,
  `interactive[].selector`, or `links[].selector`).
- Do not invent CSS selectors based on what you'd expect a site to have. If
  the artifact does not list a "submit" button on a search form, do not try
  to click one.
- Do not synthesise `data-testid` / `aria-label` selectors that you cannot
  find in the artifact — sitemap.json carries the real accessibility tree.

If a desirable assertion would need a selector that isn't in the artifact,
**skip the assertion** rather than guess. The cost of a missing test is small;
the cost of a fake "bug" caused by a selector that never resolves is large.

## URL grounding

- Only navigate to URLs that appear in `sitemap.json` `pages[].url` or
  `links[].href`.
- Do not invent paths like `/admin`, `/api/health`, `/.git/config` — this is
  an audit, not a probe.

## Click-safety blocklist

Even if a selector is in the artifact, the script must NOT generate a click
on:

- `type="submit"` inside any form that is not `method="get"` (search forms
  with GET are fine).
- Anything inside a form whose `action` host differs from the seed host.
- Buttons/links whose visible text matches (case-insensitive, anywhere in the
  string): `buy`, `purchase`, `pay`, `checkout`, `order`, `subscribe`,
  `sign up`, `register`, `create account`, `log in`, `login`, `sign in`,
  `delete`, `remove`, `cancel subscription`, `confirm`, `send`, `submit`,
  `apply`, `book`, `reserve`, `add to cart`, `add to basket`, `donate`.
- Anything with a `download` attribute or whose `href` ends in `.zip`,
  `.exe`, `.dmg`.

The site-mapper already excludes most of these from `links[]` /
`interactive[]`, but double-check at script-authoring time. A blocked label
is a hard skip, not a "test the dangerous thing carefully" — Playwright would
happily place an order if you let it.

## Severity-prefixed test titles

Every `test('...')` call must start with `[critical]`, `[high]`, `[medium]`,
or `[low]`. The interpreter parses this prefix back out; tests without it
default to medium.

```ts
test('[high] no console errors on load — /products', async ({ page }) => { ... });
```

Match severity to the bug-patterns catalogue:

| Pattern | Severity |
|---|---|
| Template bleed-through (`{{`, `${`, `<%`) in visible text | critical |
| Form action returning 404 | critical |
| `<form method="get">` with a password field | critical |
| Console error on load | high |
| Failed network request 5xx | high |
| Failed network request 4xx | medium |
| Mixed content (http resource on https page) | high |
| Modal that opens but cannot be closed | high |
| Empty button label / `undefined` / `null` / template token | high |
| Dead click (no DOM/network/console activity) | medium |
| Broken image (empty/undefined src) | high |
| Hover-only menu on touch viewport | medium |

## Independence

- One `test()` per assertion per page. No `test.describe.serial`. No shared
  state via module-level variables.
- A single page failing to load must not cascade into 20 false positives
  elsewhere. Each test creates its own fresh `page` (Playwright does this by
  default with the `{ page }` fixture).
- Keep timeouts short (`actionTimeout: 5_000`, `navigationTimeout: 15_000`)
  so a hanging page doesn't burn the time budget.

## Reporter shape — what the interpreter expects

Use the JSON reporter:

```ts
reporter: [['json', { outputFile: 'reporter.json' }]],
```

Each failing spec contributes one finding. The interpreter reads:

- `suites[].title` → the page URL
- `suites[].specs[].title` → severity prefix + bug type + free-form
- `suites[].specs[].tests[].results[].status` → `failed` / `timedOut` /
  `passed`
- `suites[].specs[].tests[].results[].error.message` → goes into `issue`

If your assertion will throw a long Playwright trace, prefer
`expect(...).toHaveCount(0, { message: 'short, parseable: ...' })` so the
finding stays readable.

## Fixtures the script always needs

```ts
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Capture errors so individual assertions can read them.
  page.on('console', msg => {
    if (msg.type() === 'error') (page as any)._consoleErrors ??= [], (page as any)._consoleErrors.push(msg.text());
  });
  page.on('requestfailed', req => {
    (page as any)._failedRequests ??= [], (page as any)._failedRequests.push(req.url());
  });
  page.on('response', res => {
    if (res.status() >= 400) {
      (page as any)._badResponses ??= [], (page as any)._badResponses.push({ url: res.url(), status: res.status() });
    }
  });
});
```

These three listeners are the foundation for the most common assertions
(`no console errors`, `no failed requests`, `no bad responses`). Attach once
per page; assert at the end of each test against the captured arrays.

## What the script must not do

- No `page.evaluate()` of arbitrary JS that mutates the page (read-only
  evaluation is fine, e.g. extracting `innerText`).
- No `page.context().request.post(...)` — this audit is read-only.
- No screenshot or trace artifacts written outside the working directory.
- No `page.waitForTimeout()` longer than 2 000 ms; prefer `waitFor` on a
  selector or network-idle.
