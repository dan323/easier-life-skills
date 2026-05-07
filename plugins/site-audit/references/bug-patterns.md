# Bug Patterns

## Broken link patterns
- `<a href="">` or `<a href="#">` used as navigation (not a same-page anchor)
- `<a href="javascript:void(0)">` used as navigation link
- Relative paths like `/page` or `../section` — fetch them; HTTP 404 → medium, 500 → high
- External links — sample a few; 404 → low (may be transient), connection refused → medium

## Broken resource patterns
- `<img src="">` — empty src causes a request to the current page URL → high
- `<img src="undefined">`, `<img src="null">` — leaked JS variable → high
- `<img src="{{...}}">`, `<img src="${...}">` — unrendered template variable → critical
- `<script src="...">` or `<link href="...">` returning 404 — fetch the top 5 → high

## Form bugs
- `<form>` with no `action` and no `id`/`class`/`data-*` hinting at a JS submit handler → high
- `<form method="get">` containing `<input type="password">` — credentials appear in URL → critical
- `<form action="...">` pointing to a URL that returns 404 → critical
- `<button type="submit">` or `<input type="submit">` with no visible label text → medium
- Form submitting but page shows no feedback (no redirect, no success message visible in HTML) → high

## Mixed content (on HTTPS pages)
- `<img src="http://...">`, `<script src="http://...">`, `<link href="http://...">` pointing to
  third-party resources → browsers block these silently → high

## Auto-behavior bugs
- `<meta http-equiv="refresh" content="N;url=...">` with N < 5 — user can't read the page → high
- `<audio autoplay>` or `<video autoplay>` without `muted` — blocked by modern browsers → high
- `<video autoplay muted>` without `playsinline` on mobile — may not play → low

## Template bleed-through (server-side rendering leak)
- Visible text containing `{{`, `{%`, `<%`, `${` literals → critical
- Visible text containing `[object Object]` → high
- Visible text containing literal `undefined` or `null` as a word → high

## Playwright findings (if available)
- Console `error` messages → high/critical depending on content
- `requestfailed` events (network-level resource failures) → medium
- HTTP 4xx/5xx for page resources → high for 5xx, medium for 4xx
- Navigation failure (timeout, SSL error) → critical

## Severity guide
- **critical** — data loss, security issue, or complete feature failure
- **high** — feature broken for all or most users
- **medium** — broken in specific cases or for a subset of users
- **low** — cosmetic or low-impact functional issue
