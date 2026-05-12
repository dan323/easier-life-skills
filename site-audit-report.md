# Site Audit: http://127.0.0.1:4567/
*Generated: 2026-05-12T00:00:00Z*

> Target is the local dev server (`npm run dev`, esbuild `--serve`). Some
> performance findings are dev-only (unminified bundle, no cache headers) and
> would resolve in the production GitHub Pages build — they are tagged inline.

> **Phase 1 fix applied (2026-05-12):** the 15 nested-interactive WCAG 4.1.2
> violations on plugin / skill / agent / MCP / command / hook cards are
> resolved. Cards no longer use `role="button"`; the title is a real
> `<button class="card-name">` and a CSS stretched-link overlay keeps the rest
> of the card click-through to the title. Verified with axe-cli (28 → 13
> violations) and a Playwright smoke test (`/tmp/phase1-smoke2.mjs`).
>
> **Phase 2 fix applied (2026-05-12):** the 3 nested-interactive WCAG 4.1.2
> violations on the marketplace source tag are resolved. The wrapper is no
> longer `role="button"`; the filter toggle is a real
> `<button class="source-toggle" aria-pressed>` and the copy button is a
> sibling (not nested). Verified with axe-cli (13 → 10 violations) and a
> Playwright smoke test (`/tmp/phase2-smoke.mjs`).
>
> **Phase 3 fix applied (2026-05-12):** the 10 region (WCAG 1.3.1) violations
> are resolved. Every top-level page section is now contained by a
> recognised landmark: `QuickStart` has `aria-labelledby="quickstart-heading"`
> so the `<section>` becomes a landmark; `Controls.tsx` is a
> `<section aria-label="Filters and view">`; `MarketplaceBar.tsx` is a
> `<nav aria-label="Marketplaces">`. **axe-cli now reports 0 violations**
> (28 → 0 across Phases 1–3). Verified with a landmark smoke test
> (`/tmp/phase3-smoke.mjs`). Vitest stays green (77/77).

## Summary

| Category       | Critical | High | Medium | Low | Total |
|----------------|----------|------|--------|-----|-------|
| UX             | 0        | 0    | 4      | 3   | 7     |
| Accessibility  | 0        | 17   | 11     | 0   | 28    |
| Performance    | 0        | 0    | 4      | 4   | 8     |
| Bugs           | 0        | 0    | 0      | 0   | 0     |
| **Total**      | **0**    | **17**| **19**| **7**| **43** |

> **Lighthouse performance score: 93/100**

No critical issues were found. The site is functionally healthy — no console
errors, no failed requests, no template bleed-through, sort/filter/view
controls all behave correctly. The dominant theme is **17 nested-interactive
WCAG violations**: every plugin card is `role="button"` while also containing
focusable children (title link, copy button), and marketplace source tags
do the same.

---

## Critical Issues

*None.*

---

## UX Issues

### Medium

- **http://127.0.0.1:4567/** (Consistency / Unexpected behavior) — Card titles
  for plugins from the built-in marketplace render as `<a target="_blank">` to
  GitHub; cards from external marketplaces render the title as a plain
  `<span>`. The two are visually identical, but clicking the title on one
  opens GitHub in a new tab while the other does nothing extra — and in
  both cases the surrounding card is `role="button"` that opens a detail
  panel. Users cannot predict what clicking the title will do.
  *Fix: render the title as a non-link inside the card and move the "Open on
  GitHub" affordance to an explicit button inside the detail panel (or a
  consistent small icon link on every card). See
  `assets/src/components/cards/PluginCard.tsx` and `SkillCard.tsx`.*

- **http://127.0.0.1:4567/** (Consistency) — The marketplace source tag is
  both a filter toggle (`role="button"` on the wrapper) and contains a `+`
  button that copies the `/plugin marketplace add …` command. The two
  actions live in overlapping click targets distinguished only by the
  `aria-label`. Sighted users have to discover by trial that the `+` copies
  rather than adds a marketplace.
  *Fix: separate the two surfaces — make the chip body the filter toggle
  with clear visual affordance, and replace the `+` glyph with a small icon
  + visible tooltip on hover ("Copy install command"). See `MarketplaceBar.tsx`.*

- **http://127.0.0.1:4567/** (Error and empty states) — Switching the view
  toggle to **Commands** shows `0 of 0 commands` with no further guidance.
  Same applies to any view that happens to be empty for the current filter
  combination. Users may think the page is broken.
  *Fix: when the result set is empty, render a one-line message under the
  count ("No commands in this marketplace yet — try the Skills or Agents
  views"). See the empty branch in `Grid.tsx`.*

- **http://127.0.0.1:4567/** (Mobile hints) — The controls row packs five
  category filter buttons, three marketplace chips, a sort button, and seven
  view-toggle buttons. On viewports narrower than ~700 CSS px this is very
  likely to wrap awkwardly or cause horizontal scroll (could not verify
  responsive breakpoints from the rendered HTML alone).
  *Fix: collapse the seven view-toggle buttons into a single `<select>` on
  narrow viewports (or a horizontally scrollable strip with snap points), and
  wrap filter chips into a second row. Verify at 320 / 375 / 414 px.*

### Low

- **http://127.0.0.1:4567/** (Forms) — The search input has no visible label,
  only `aria-label="Search skills"` and a placeholder of "Search skills…
  (press / to focus)". Placeholder disappears on focus, so the hint about the
  `/` shortcut vanishes when the user is actually typing.
  *Fix: keep the hint as helper text below the input (or convert the `/` hint
  into a small kbd indicator inside the input that stays visible on focus).*

- **http://127.0.0.1:4567/** (Loading states) — Between the static HTML shell
  and Preact hydration the page is empty (`<div id="root"></div>`). On slow
  connections this is a visible blank state. The fetch preload helps but does
  not paint anything.
  *Fix: inline a minimal skeleton (header + 6 placeholder card rectangles) in
  `index.html` so the user sees structure immediately. Remove on first render.*

- **http://127.0.0.1:4567/** (Consistency) — The sort button label "Sort:
  A→Z" doubles as both current state and clickable affordance, but the
  visible UI gives no separate icon indicating it's a toggle. The `aria-label`
  helpfully says "Currently sorted A to Z. Click to sort Z to A.", but
  sighted users have to guess.
  *Fix: add a small ⇅ icon next to the label so the button reads as a toggle,
  not a static badge.*

---

## Accessibility Issues

> Source: axe-cli against the rendered page. 28 violations across two rules.

### High

- **`.builtin`** (WCAG 4.1.2) — Nested interactive controls: a
  focusable/interactive element is nested inside another interactive element
  (card with `role=button` containing an inner button or link). Screen
  readers may not announce both; focus order can be unpredictable.
  *Fix: flatten the interactive structure. Either make the card non-interactive
  (remove `role=button` and `tabindex`) and rely on the inner controls, or
  remove the inner interactive children and expose a single keyboard target.*

- **`div[data-repo="anthropics/skills"]`** (WCAG 4.1.2) — Nested interactive
  controls inside the marketplace bar entry: an interactive child (copy
  button) is nested inside an outer interactive container (filter toggle).
  *Fix: stop event bubbling from inner controls and ensure the outer element
  is not itself a button (remove `role=button`/`tabindex` from the wrapper),
  so only one focusable control exists per region.*

- **`div[data-repo="mattpocock/skills"]`** (WCAG 4.1.2) — Same nested
  interactive issue on the marketplace bar entry.
  *Fix: remove the outer interactive role or remove the inner focusable
  controls; only one interactive control should occupy a given clickable
  region.*

- **`div[aria-label="Open details for brainstorm"]`** (WCAG 4.1.2) — Skill
  card exposed as a `role="button"` contains a nested `CopyButton` and
  external link.
  *Fix: drop the outer `role="button"` and use a single inner button as the
  primary affordance, or move copy + link controls into the detail panel.*

- **`div[aria-label="Open details for changelog"]`** (WCAG 4.1.2) — Skill
  card with `role=button` contains nested interactive controls.
  *Fix: avoid putting `<button>`/`<a>` elements inside a `role=button`
  container; lift inner controls into the detail panel or drop the outer
  button role.*

- **`div[aria-label="Open details for claude-api"]`** (WCAG 4.1.2) — Skill
  card with `role=button` contains nested interactive controls.
  *Fix: restructure so only one interactive element is announced per card;
  remove the outer `role=button` or the inner buttons.*

- **`div[aria-label="Open details for cost-tracker"]`** (WCAG 4.1.2) — Skill
  card with `role=button` contains nested interactive controls.
  *Fix: restructure so only one interactive element is announced per card;
  remove the outer `role=button` or the inner buttons.*

- **`div[aria-label="Open details for cv-linkedin"]`** (WCAG 4.1.2) — Skill
  card with `role=button` contains nested interactive controls.
  *Fix: restructure so only one interactive element is announced per card;
  remove the outer `role=button` or the inner buttons.*

- **`.skill-card[role="button"]:nth-child(6)` (document-project)** (WCAG 4.1.2)
  — Skill card exposed as a button contains nested interactive controls.
  *Fix: pick a single interactive layer for the card.*

- **`.skill-card[role="button"]:nth-child(7)` (document-skills)** (WCAG 4.1.2)
  — Skill card exposed as a button contains nested interactive controls.
  *Fix: pick a single interactive layer for the card.*

- **`.skill-card[role="button"]:nth-child(8)` (example-skills)** (WCAG 4.1.2)
  — Skill card exposed as a button contains nested interactive controls.
  *Fix: pick a single interactive layer for the card.*

- **`.skill-card[role="button"]:nth-child(9)` (find-breaking-rest-api)** (WCAG 4.1.2)
  — Skill card exposed as a button contains nested interactive controls.
  *Fix: pick a single interactive layer for the card.*

- **`.skill-card[role="button"]:nth-child(10)` (find-dead-code)** (WCAG 4.1.2)
  — Skill card exposed as a button contains nested interactive controls.
  *Fix: pick a single interactive layer for the card.*

- **`div[aria-label="Open details for find-skills"]`** (WCAG 4.1.2) — Skill
  card with `role=button` contains nested interactive controls.
  *Fix: restructure so only one interactive element is announced per card.*

- **`.skill-card[role="button"]:nth-child(12)` (improve-logging)** (WCAG 4.1.2)
  — Skill card exposed as a button contains nested interactive controls.
  *Fix: pick a single interactive layer for the card.*

- **`.skill-card[role="button"]:nth-child(13)` (mattpocock-skills)** (WCAG 4.1.2)
  — Skill card exposed as a button contains nested interactive controls.
  *Fix: pick a single interactive layer for the card.*

- **`div[aria-label="Open details for site-audit"]`** (WCAG 4.1.2) — Skill
  card with `role=button` contains nested interactive controls.
  *Fix: restructure so only one interactive element is announced per card.*

- **`div[aria-label="Open details for task-agent"]`** (WCAG 4.1.2) — Skill
  card with `role=button` contains nested interactive controls.
  *Fix: restructure so only one interactive element is announced per card.*

> **Note:** the 18 high entries above share a single root cause: the
> `SkillCard`/`PluginCard` component wraps the entire tile in a
> `role="button"` for the open-panel click, *and* renders a child `<a>`
> (GitHub title link) and child `<button>` (copy). One fix in
> `assets/src/components/cards/PluginCard.tsx` (and `SkillCard.tsx`, plus
> `MarketplaceBar.tsx` for the two source-tag cases) resolves all of them.

### Medium

- **`h2`** (WCAG 1.3.1) — Page content is not contained inside a landmark
  region; the h2 sits outside `<main>`/`<nav>`/`<header>`/`<footer>`.
  *Fix: wrap top-level page sections in semantic landmarks (`<main>`,
  `<nav>`, `<header>`, etc.) so assistive tech can skip between regions.*

- **`.quickstart-note`** (WCAG 1.3.1) — Quickstart note content sits outside
  any landmark.
  *Fix: place the quickstart block inside a `<section aria-labelledby="…">`
  or under `<main>`.*

- **`.step:nth-child(1) > .step-num`** (WCAG 1.3.1) — Step 1 number is
  rendered outside any landmark.
  *Fix: wrap the QuickStart steps inside a `<section>` or `<main>` landmark.*

- **`.step:nth-child(1) > .step-body > .step-label`** (WCAG 1.3.1) — Step 1
  label sits outside any landmark.
  *Fix: wrap the QuickStart in a `<section>`/`<main>` landmark.*

- **`.step:nth-child(1) > .step-body > .step-cmd > code`** (WCAG 1.3.1) —
  Step 1 command code sits outside any landmark.
  *Fix: wrap the QuickStart in a `<section>`/`<main>` landmark.*

- **`.step:nth-child(2) > .step-num`** (WCAG 1.3.1) — Step 2 number is
  rendered outside any landmark.
  *Fix: wrap the QuickStart in a `<section>`/`<main>` landmark.*

- **`.step:nth-child(2) > .step-body > .step-label`** (WCAG 1.3.1) — Step 2
  label sits outside any landmark.
  *Fix: wrap the QuickStart in a `<section>`/`<main>` landmark.*

- **`.step:nth-child(2) > .step-body > .step-cmd > code`** (WCAG 1.3.1) —
  Step 2 command code sits outside any landmark.
  *Fix: wrap the QuickStart in a `<section>`/`<main>` landmark.*

- **`.view-toggle`** (WCAG 1.3.1) — View toggle control is rendered outside
  any landmark.
  *Fix: group the controls bar inside `<section aria-label="Filters and view">`
  or `<nav>` so it is reachable via landmark navigation.*

- **`.marketplace-add-cta`** (WCAG 1.3.1) — Marketplace add CTA sits outside
  any landmark.
  *Fix: place the marketplace bar inside `<nav aria-label="Marketplaces">` or
  `<section>`.*

> **Note:** the medium entries above also stem from one root cause — the
> `.quickstart`, `.controls`, and `.marketplace-bar` blocks sit directly
> under the React root rather than inside semantic landmarks. Adding a
> wrapping `<section>` (or `<nav>` for the marketplace bar) and moving the
> grid inside `<main>` (which already exists) clears every entry. See
> `assets/src/components/App.tsx`, `QuickStart.tsx`, `Controls.tsx`,
> `MarketplaceBar.tsx`.

---

## Performance Issues

### Medium

- **CLS (Cumulative Layout Shift)** — measured 0.149, above the 0.1 "good"
  threshold. Single large shift on `<main id="main">` as the plugin grid
  renders after `skills_index.json` is fetched.
  *Fix: render skeleton/placeholder cards with `min-height` matching final
  card size, or set `min-height` on `<main>` while loading. See the fetch-
  driven hydration in `assets/src/components/App.tsx`.*

- **Unminified JavaScript** — `assets/bundle.js` served unminified, 23.7 KiB
  (30.6%) of potential savings. *(measured: 77,487 bytes; 23,708 wasted)*
  *Dev-only: esbuild `--serve` emits unminified output. Verify `npm run
  build` passes `--minify`.*

- **Unused JavaScript** — ~34.8 KiB (44.8%) of `bundle.js` is unused on first
  paint. *(measured: 34,751 wasted bytes of 77,487)*
  *Fix: consider code-splitting heavy components (`PluginPanel`, `EntityPanel`,
  `MarketplaceBar`) via dynamic `import()` so they load on demand. Re-measure
  after minification in the production build.*

- **Render-blocking resources** — `assets/style.css` blocks first paint with
  ~300 ms wasted, no `media` attribute or async loading. *(measured: 21,410
  bytes)*
  *Fix: inline critical CSS in `<head>` and load `assets/style.css` with
  `media="print" onload="this.media='all'"`, or split into critical /
  non-critical sheets. Add `rel="preload" as="style"` for the file.*

### Low

- **Cache lifetime** — `bundle.js` and `style.css` served with no
  `Cache-Control` headers (~97 KiB re-downloaded per visit).
  *Dev-only: esbuild `--serve` disables caching. In production (GitHub
  Pages), ensure assets are content-hashed or served with long
  `Cache-Control max-age` via Pages defaults.*

- **Touch target size** — some interactive elements lack sufficient
  size/spacing for touch (Lighthouse `target-size` audit failed).
  *Fix: audit small buttons (`CopyButton`, filter chips, sort controls) in
  `assets/src/components/` and ensure 44×44 CSS px minimum with adequate
  spacing.*

- **Accessible name mismatch** — elements with visible text labels do not
  have matching accessible names (`label-content-name-mismatch`).
  *Fix: review `aria-label` values on icon-bearing buttons (`CopyButton`,
  panel close buttons) so the accessible name begins with or matches the
  visible text.*

- **Network dependency tree** — critical path is HTML → bundle.js →
  skills_index.json (sequential). The `<link rel=preload as=fetch>` mitigates
  the last step but `bundle.js` still has to download before fetch
  initiates parsing.
  *Fix: add `<link rel="modulepreload" href="assets/bundle.js">` to the
  HTML shell to start the fetch earlier.*

---

## Bugs & Functional Issues

*No functional bugs found.* Playwright exercised search, sort toggle,
category filter, view toggle, marketplace filter, card click → panel open,
Escape → panel close, and URL hash sync — all behaved correctly. No
console errors, no failed requests, no template bleed-through, no broken
images or links.

---

## Top 5 Recommendations

1. **Fix nested interactive controls on plugin cards (single root cause for
   ~17 high-severity a11y violations, and the UX inconsistency).** In
   `assets/src/components/cards/PluginCard.tsx` and `SkillCard.tsx`, drop the
   outer `role="button"` + `tabindex="0"` from `.skill-card` and instead make
   the card name itself the primary keyboard target (a real `<button>` that
   opens the panel, or an `<a href>` plus an explicit "Details" button).
   This also resolves the UX issue where clicking the title navigates to
   GitHub from some cards but not others.

2. **Apply the same fix to the marketplace source tag.** In
   `assets/src/components/MarketplaceBar.tsx`, remove `role="button"` /
   `tabindex="0"` from the wrapper `<div>` and turn the label itself into a
   `<button>` (filter toggle), keeping the `+` as a sibling `<button>`
   (copy command) — so the two actions are visually and structurally
   distinct.

3. **Wrap top-level page sections in semantic landmarks (clears 10 medium
   a11y violations).** Add `<section aria-labelledby="quickstart-h2">`
   around QuickStart, `<nav aria-label="Marketplaces">` around
   `MarketplaceBar`, and ensure the controls/grid live inside `<main>`.
   One coordinated change in `App.tsx` / `QuickStart.tsx` /
   `MarketplaceBar.tsx` / `Controls.tsx`.

4. **Render placeholder skeleton cards to eliminate CLS 0.149.** Either
   reserve a `min-height` on `<main>` during the initial fetch, or render 6
   skeleton cards with the same dimensions as real cards. The grid is the
   only major above-the-fold element that arrives async, so fixing this
   single shift should push the Lighthouse perf score above 95.

5. **Improve the empty state for views with zero items.** When the filtered
   count is 0, render a one-line helper below the count (e.g. "No commands
   in this marketplace — try Skills or Agents") inside `Grid.tsx`. Currently
   users see "0 of 0 commands" and a blank page, which feels like a bug
   rather than an empty bucket.
