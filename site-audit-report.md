# Site Audit: https://dan323.github.io/easier-life-skills/
*Generated: 2026-05-12T00:00:00Z*

## Summary

| Category      | Critical | High  | Medium | Low   | Total  |
|---------------|----------|-------|--------|-------|--------|
| UX            | 0        | 2     | 7      | 6     | 15     |
| Accessibility | 0        | 1     | 0      | 0     | 1      |
| Performance   | 0        | 0     | 0      | 3     | 3      |
| Bugs          | 0        | 0     | 0      | 0     | 0      |
| **Total**     | **0**    | **3** | **7**  | **9** | **19** |

> **Lighthouse performance score: 99/100**

---

## Critical Issues

*No critical issues found.*

---

## UX Issues

### High

- **https://dan323.github.io/easier-life-skills/** (Unexpected behavior) — Clicking a plugin/skill/agent card name opens an in-page modal/panel rather than navigating; cards look like links so users expecting a deep-linkable page may be surprised, and the modal state may not be obviously shareable.
  *Fix: Either make card names true links to a routable URL (e.g. `/#plugin/name`) and ensure the panel deep-links and can be shared, or add a visual affordance (chevron or "View details" label) that signals an in-place panel instead of navigation.*
- **https://dan323.github.io/easier-life-skills/** (Consistency) — `.card-name:focus`/`:focus-visible` and `.source-toggle:focus`/`:focus-visible` explicitly set `outline:none`, which breaks keyboard focus visibility on the primary interactive elements.
  *Fix: Remove the `outline:none` overrides on `.card-name` and `.source-toggle`, or replace with an equally visible custom focus indicator (e.g. a `box-shadow` ring using `--accent`) that meets WCAG 2.4.7 / 2.4.11.*

### Medium

- **https://dan323.github.io/easier-life-skills/** (Mobile hints) — The keyboard-shortcut chip (`.search-kbd` showing `/`) is rendered inside the search field but has no touch equivalent; on mobile it is decorative clutter that may obstruct typed text.
  *Fix: Hide `.search-kbd` on touch/coarse-pointer devices via `@media (hover: none) and (pointer: coarse) { .search-kbd { display: none } }` or under the 640px breakpoint.*
- **https://dan323.github.io/easier-life-skills/** (Unexpected behavior) — Switching the view type (Plugins / Skills / Agents / MCP / Commands / Hooks / Bundles) likely resets scroll and may not preserve the search/filter context; empty-state copy implies filters don't carry across views.
  *Fix: Preserve the search term across view-type changes and announce "Now showing N skills" via the existing `aria-live` region, or explicitly indicate "Search cleared because you switched view".*
- **https://dan323.github.io/easier-life-skills/** (Error and empty states) — When fetching a marketplace source fails, the UI shows a small `✕` badge ("could not load skills_index.json from <repo>") but offers no retry button or guidance.
  *Fix: Add a "Retry" button next to the failing source chip and link to a short troubleshooting tip (e.g. "GitHub raw content may be rate-limited; try again in a minute").*
- **https://dan323.github.io/easier-life-skills/** (Content clarity) — The catalog mixes seven entity types (Plugins, Skills, Agents, MCP Servers, Commands, Hooks, Bundles) without an above-the-fold explanation of how they relate. New users may not know which tab to start with.
  *Fix: Add a one-sentence subtitle or tooltip per view-type tab explaining the relationship (e.g. "Plugins bundle Skills, Agents and MCP Servers"), and make Plugins the default with a small "What's the difference?" help link.*
- **https://dan323.github.io/easier-life-skills/** (Consistency) — `skills_index.json` contains entries with missing descriptions, missing homepage URLs, and null `category` values; these render as blank fields or uncategorised groups, inconsistent with sibling cards.
  *Fix: In `scripts/build-index.ts`, fall back to placeholder copy ("No description provided" / "Uncategorised"), hide empty homepage links entirely, and surface a CI warning when required metadata is missing.*
- **https://dan323.github.io/easier-life-skills/catalog.html** (Content clarity) — The standalone catalog page shows skill descriptions in Korean (under the Customization category) without a language indicator on an otherwise English page.
  *Fix: Translate non-English descriptions in the build step, add a `lang` attribute and a small "(Korean)" tag next to those entries, or group multilingual content under a clearly labelled section.*
- **https://dan323.github.io/easier-life-skills/** (Forms) — The search input has only an `aria-label` and placeholder — there is no visible `<label>`. Users lose context once they start typing, and sighted users never see the field's purpose explained.
  *Fix: Add a visible label (e.g. "Find a skill" above the input) or a persistent helper line beneath the input explaining what fields are searched (name, description, keywords).*

### Low

- **https://dan323.github.io/easier-life-skills/** (Unexpected behavior) — Search filters on every keystroke without debouncing; fine today but the `aria-live` count will fire on every character and may feel janky as the index grows.
  *Fix: Debounce the search by ~150ms before filtering and before updating the `aria-live` count.*
- **https://dan323.github.io/easier-life-skills/** (Navigation) — No breadcrumb or path indicator when a plugin/skill detail panel is open; users arriving via a shared URL with panel state may not realise there is a marketplace behind it.
  *Fix: Show a small "Marketplace › <plugin name>" breadcrumb at the top of the panel, and label the close button "Back to marketplace" when the panel was deep-linked.*
- **https://dan323.github.io/easier-life-skills/** (Consistency) — The footer "Full catalog" link points to `catalog.html` (a separate standalone page) while the rest of the UI is a SPA — clicking it triggers a full page load with no visible loading indicator.
  *Fix: Either render the full catalog as another in-app view, or annotate the link (e.g. "Full catalog (printable page)") so users understand they are leaving the SPA.*
- **https://dan323.github.io/easier-life-skills/** (Mobile hints) — At the 640px breakpoint the marketplace bar reserves `min-height: 240px` to accommodate wrapped source chips, leaving a large blank band above the grid when only 1–2 sources are present.
  *Fix: Drop the fixed `min-height` and let the bar size to content (or apply `min-height` only when source count > N).*
- **https://dan323.github.io/easier-life-skills/** (Content clarity) — The header subtitle reads "N items loaded" but the meaning is ambiguous given seven coexisting entity types.
  *Fix: Replace with view-specific copy that updates with the active view, e.g. "Showing 47 skills from 6 marketplaces".*
- **https://dan323.github.io/easier-life-skills/** (Error and empty states) — Empty-state copy does not offer a "Clear search" shortcut, so users have to manually empty the input.
  *Fix: Add an explicit "Clear search" button (or "Reset filters" link) inside the empty state that clears the search term and any active filters in one click.*

---

## Accessibility Issues

### High

- **https://dan323.github.io/easier-life-skills/** — WCAG 3.2.2 — `#root > section:nth-child(4) > form.search-form[role="search"]` — Search form has no submit button (no `<input type="submit"/"image">` and no `<button type="submit">`), which can prevent users who rely on keyboard form submission from triggering the search.
  *Fix: Add a visible or visually-hidden submit button inside the form (e.g. `<button type="submit" aria-label="Search">Search</button>`). Even though filtering happens live, an explicit submit control improves keyboard and AT support.*

---

## Performance Issues

**Lighthouse score: 99/100** — all Core Web Vitals (FCP, LCP, TTI, CLS, TBT) within "good" thresholds.

### Low

- **cache-insight** (`cacheLifetimeMs=600000` on bundle.js 13.4 KB and style.css 6.1 KB) — Static assets are served with a short 10-minute cache lifetime by GitHub Pages, causing repeat-visit re-downloads (~18 KiB of waste).
  *Fix: GitHub Pages doesn't allow custom Cache-Control headers, but you can add a content-hash to asset filenames (`bundle.<hash>.js`, `style.<hash>.css`) during the build and reference them from `index.html`, so browsers can reuse cached files indefinitely and only refetch on change.*
- **render-blocking-insight** (1 render-blocking stylesheet, ~37 ms on the critical request chain) — `assets/style.css` is loaded as a render-blocking `<link rel="stylesheet">` in `<head>` (6.1 KB transferred, 27.7 KB uncompressed).
  *Fix: Inline the critical above-the-fold CSS in `<head>` and load the rest with `rel="preload"` + onload swap to `rel="stylesheet"`, or simply inline the entire 27 KB `style.css` since it's small enough that the saved RTT outweighs the extra HTML bytes.*
- **speed-index** (3.5 s, score 0.88) — Speed Index is slightly above the 3.4 s "good" threshold even though FCP/LCP/TTI are all ~1.0–1.1 s — the visual completeness ramp is dominated by the Preact render after `skills_index.json` (15 KB) arrives.
  *Fix: Render an above-the-fold skeleton (header + a few placeholder cards) directly into `index.html` so the page paints meaningful pixels before `bundle.js` executes, or inline the first 6 plugins into `index.html` and hydrate from `skills_index.json` after.*

---

## Bugs & Functional Issues

*No bugs found.* The bug-hunter agent loaded the page in Playwright and observed no JS errors, no failed requests, no broken resources, no template bleed-through, no mixed content, no insecure forms, and no broken links. Card-click panel, hash routes, and skip-link target all worked. (Cosmetic note: submitting the search form appends a stray `?` to the URL because the form has no `action` — harmless.)

---

## Top 5 Recommendations

1. **Restore visible focus indicators on `.card-name` and `.source-toggle`** — Remove the `outline:none` overrides (or replace with an `--accent` `box-shadow` ring). Affects every keyboard user on the marketplace's primary interaction; a 2-line CSS fix.
2. **Add a submit button to the search form** — A visually-hidden `<button type="submit" aria-label="Search">` satisfies WCAG 3.2.2, fixes keyboard form submission, and removes the stray `?` in the URL on submit. Trivial change.
3. **Decide the card-click contract and signal it** — Either make card names real links to `/#plugin/<name>` (with deep-linkable, shareable panel state) or add a "View details" chevron so users don't expect navigation. Resolves the most jarring "unexpected behavior" finding and aligns shareability with what cards look like.
4. **Add a visible label and search-scope hint near the search input** — A persistent "Find a skill" label plus a small helper line ("Searches name, description, and keywords") clarifies an otherwise placeholder-only field and helps screen-reader users too.
5. **Paint an above-the-fold skeleton in `index.html`** — Inline a header + placeholder card grid so the page shows meaningful pixels before `bundle.js` executes. Brings Speed Index under 3.4 s and gives a cleaner first impression with minimal build effort.
