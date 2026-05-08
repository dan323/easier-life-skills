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

## Browser findings (interactive crawl)
- Console `error` messages on load → high/critical depending on content
- Console `error` messages produced *after* a click → high (record the click path)
- `requestfailed` events (network-level resource failures) → medium
- HTTP 4xx/5xx for page resources → high for 5xx, medium for 4xx
- Navigation failure (timeout, SSL error) → critical
- Click on a link/button that lands on a 4xx/5xx page → high (record click path)
- Click that triggers an XHR/fetch returning 4xx/5xx → medium

## Interactive UX failure patterns (only visible by clicking)
- **Dead click** — a button or link that, when clicked, does nothing observable
  (no navigation, no console activity, no DOM mutation, no network request)
  → medium
- **Modal trap** — a modal opens but its close button (`✕`, `Close`, `Cancel`,
  `Esc` key, backdrop click) does not dismiss it → high
- **Menu opens but links are dead** — dropdown reveals links that 404 or do
  nothing → high
- **Search returns nothing useful** — search form returns a results page with
  no items, no "no results" empty state, and no error → medium
- **Pagination loop** — Next/Prev returns the same page, or page N returns 404
  → high
- **Cookie banner re-appears** — banner returns after clicking Accept/Reject,
  blocking interaction → high
- **Empty button label** — button whose accessible name is empty, `undefined`,
  `null`, or a literal template token (`{{...}}`, `${...}`) → high
- **Hover-only menu on touch** — menu only opens on hover, with no click
  handler → medium (mobile users cannot reach the contents)

## Severity guide
- **critical** — data loss, security issue, or complete feature failure
- **high** — feature broken for all or most users
- **medium** — broken in specific cases or for a subset of users
- **low** — cosmetic or low-impact functional issue
