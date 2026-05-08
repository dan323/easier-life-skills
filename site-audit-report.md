# Site Audit: https://dan323.github.io/easier-life-skills
*Generated: 2026-05-07T13:00:00Z*

## Summary

| Category       | Critical | High | Medium | Low | Total |
|----------------|----------|------|--------|-----|-------|
| UX             | 0        | 4    | 8      | 5   | 17    |
| Accessibility  | 1        | 5    | 2      | 2   | 10    |
| Performance    | 0        | 0    | 1      | 5   | 6     |
| Bugs           | 0        | 0    | 0      | 0   | 0     |
| **Total**      | **1**    | **9**| **11** | **12** | **33** |

> **Lighthouse performance score: 99/100**

The page loads cleanly — no JS errors, no broken images, no template bleed-through, all referenced static assets return 200. Functional surface is solid; the bulk of the findings are accessibility gaps (search input has no accessible name, no skip link, low-contrast badges) and a handful of UX polish issues (missing focus styles, undersized tap targets, ambiguous sort label).

---

## Critical Issues

### 1.3.1 Info and relationships — input#search
**Issue:** The search input has only a placeholder; no `<label>`, `aria-label`, or `aria-labelledby`, so it has no accessible name. Screen-reader users hear "edit, blank" with no indication of what to type.
**Fix:** Add a visually-hidden `<label for="search">Search skills</label>` or `aria-label="Search skills"` on the input.

---

## UX Issues

### High

- **CATALOG.md footer link** (Error and empty states) — `https://github.com/dan323/easier-life-skills/blob/master/CATALOG.md` returns 404 (verified). Users following "Full catalog" land on a GitHub 404.
  *Fix: Create CATALOG.md, point the link to the correct branch/path (e.g., `main` or to the Pages catalog), or remove the link.*

- **Tap target size on mobile** (Mobile hints) — Copy buttons, filter buttons, view toggle and sort use ~4–6px padding with ~0.78rem font, well below the 44×44px recommended hit area on touch devices.
  *Fix: Increase padding so each interactive control is at least 44×44px on mobile breakpoints.*

- **Missing focus styles** (Consistency) — Only the search input shows a focus ring; buttons and the view toggle have no visible `:focus-visible` style, so keyboard users can't tell where focus is.
  *Fix: Add a clear `:focus-visible` outline (e.g. 2px solid accent with offset) to all buttons, links, and the view toggle.*

- **No loading or error state for the catalog** (Content clarity) — Header shows "… items loaded" and the grids stay visually empty until `bundle.js` populates them. If the JSON fetch is slow or fails, there is no skeleton, spinner, or error message.
  *Fix: Render a loading skeleton/spinner for the grid; show a friendly retry-able error message if the catalog fails to load.*

### Medium

- **Modal opens without history change** (Unexpected behavior) — Clicking a plugin card opens an in-page modal panel; the URL doesn't change, so the browser back button won't close the panel as users expect.
  *Fix: Push a hash/state when opening the panel so back closes it; add `aria-haspopup="dialog"` and a subtle "Details" affordance on cards.*

- **`/` shortcut is undocumented and unguarded** (Unexpected behavior) — Pressing `/` focuses search but the shortcut is only hinted via placeholder text, and may steal keystrokes when users type `/` in other contexts.
  *Fix: Ignore the shortcut when focus is in any input/textarea/contenteditable; expose it via an accessible help tooltip or shortcuts list.*

- **Search input lacks a visible label** (Forms) — Only a placeholder ("Search skills…"), which disappears on focus and is not a substitute for a label.
  *Fix: Add a visually-hidden `<label for="search">` or an `aria-label` (also fixes the critical a11y finding above).*

- **Sort button label vs tooltip mismatch** (Consistency) — Button text says `A→Z` while `title="Sort Z→A"`; current order vs next action is ambiguous.
  *Fix: Use one consistent pattern, e.g. label `Sort: A→Z`, tooltip `Click to sort Z→A`, and update both on toggle.*

- **Quickstart jargon for first-time visitors** (Content clarity) — `/plugin marketplace add` and `<skill-name>@easier-life-skills` have no surrounding explanation of where to run them or what Claude Code is.
  *Fix: Add a one-line "Run these inside Claude Code CLI" above Step 1 with a link to Claude Code docs.*

- **Copy-confirmation is short and silent for screen readers** (Unexpected behavior) — "Copied!" disappears in ~1.8s and there is no `aria-live` announcement.
  *Fix: Increase the visual confirmation to ~3s; add an `aria-live="polite"` region announcing "Command copied to clipboard".*

- **View toggle wraps awkwardly on small screens** (Consistency) — 7 buttons (Plugins / Skills / Agents / MCP Servers / Commands / Hooks / Bundles) wrap or overflow on narrow viewports; the `active` styling is also subtle.
  *Fix: On `<640px` render the toggle as a scrollable horizontal segmented control (or a `<select>`); strengthen the active-button contrast.*

- **External-link behaviour inconsistent** (Navigation) — Header GitHub link uses `target="_blank"` without an external-link icon; the footer GitHub link has no `target` attribute.
  *Fix: Standardise external-link behaviour across header and footer; add a small external-link icon for clarity.*

### Low

- **"Updated …" placeholder remains if JS fails** (Content clarity) — Footer shows an ellipsis until `bundle.js` injects the date; on script failure the page looks unfinished.
  *Fix: Provide a server-rendered fallback timestamp at build time, or hide the "Updated" label until populated.*

- **"Copy example" label is misleading** (Consistency) — Step 2 button copies `/plugin install changelog@easier-life-skills` but the visible code shows `<skill-name>`.
  *Fix: Rename to "Copy (changelog example)" or have it copy the `<skill-name>` placeholder verbatim.*

- **Truncated card descriptions have no read-more affordance** (Content clarity) — Descriptions are clamped via `-webkit-line-clamp:2`; users only discover the rest by clicking.
  *Fix: Add a subtle `…` fade or explicit "View details" link to signal truncation.*

- **Muted text/badges may fail AA contrast** (Consistency) — Heuristic check suggests `#8b949e` muted text on the dark background and the small-text badge variants are below 4.5:1.
  *Fix: Lift muted text luminance (e.g. `#b1bac4`) and re-check every badge variant for AA.*

- **H1/logo isn't a home link** (Navigation) — There is no clickable affordance to clear filters or close an open panel and "go home".
  *Fix: Make the H1/logo a link that clears search/filters and closes any open panel.*

---

## Accessibility Issues

### High

- **WCAG 1.4.3 — `.badge.badge-source`** — Contrast ~3.99:1 against its background, below the 4.5:1 AA threshold.
  *Fix: Darken the badge background (e.g. `#0e1424`) or lighten the text colour.*

- **WCAG 1.4.3 — `.badge.badge-cat.badge-documentation`** — Contrast ~3.51:1, below AA.
  *Fix: Use a higher-contrast pairing (e.g. text `#4f9bff` on `#0d2137`).*

- **WCAG 2.4.1 — No skip link** — Keyboard and screen-reader users must traverse header and controls before reaching `<main>`.
  *Fix: Add a visually-hidden-on-blur `<a href="#main" class="skip-link">Skip to main content</a>` as the first focusable element; give `<main>` `id="main"`.*

- **WCAG 4.1.2 — `button#panel-close`** — Only text is "×"; `title="Close"` is not a reliable accessible name.
  *Fix: Add `aria-label="Close"` and wrap the glyph in `<span aria-hidden="true">×</span>`.*

- **WCAG 4.1.2 — `a.btn-gh`** — "★ GitHub" link contains a decorative star with no `aria-hidden`; some screen readers will announce it as "black star".
  *Fix: Wrap the star in `<span aria-hidden="true">★</span>` (or rely on the visible "GitHub" text alone).*

### Medium

- **WCAG 4.1.2 — `.view-toggle`** — Acts as a tab list (selecting which grid is shown) but uses plain `<button>`s; no `role="tablist"`/`role="tab"`/`aria-selected`/`aria-controls`.
  *Fix: Add tablist semantics, `aria-selected` on the active button, `aria-controls` linking to each grid, and roving-tabindex arrow-key navigation.*

- **WCAG 4.1.2 — `#skill-count`, `#count`, `#generated`** — Live counters and the timestamp are populated dynamically without `aria-live`; screen readers won't announce updates when filters/views change.
  *Fix: Add `aria-live="polite"` (and `aria-atomic="true"`) on the count elements.*

### Low

- **WCAG 3.3.2 — Search shortcut hint inside placeholder** — "(press / to focus)" disappears once the user types and isn't reliably exposed to assistive tech.
  *Fix: Move the hint into a persistent `<label>` or `aria-describedby` (e.g. `<span id="search-hint">Press / to focus</span>`).*

- **WCAG 1.3.5 — Search landmark** — The search field isn't wrapped in a `role="search"` landmark.
  *Fix: Wrap the controls (or just the input) in `<form role="search">` to expose the search landmark.*

---

## Performance Issues

### Medium

- **Speed Index 3.6s** — Slightly above the 3.4s "good" threshold. Above-the-fold content (grid, count, footer date) is empty until `bundle.js` fetches the JSON catalog.
  *Fix: Server- or build-time-render the initial skill grid and count into the static HTML so meaningful content paints immediately, instead of relying on `bundle.js` + JSON fetch.*

### Low

- **Render-blocking stylesheet** — `assets/style.css` (~3.8 KB) is loaded synchronously in `<head>`.
  *Fix: Inline the small critical CSS in `<head>` and load the rest via `rel="preload"` + `onload` swap, or split critical / non-critical with `media`.*

- **Cache TTL of 10 minutes on static assets** — GitHub Pages serves `assets/bundle.js` and `assets/style.css` with a short cache lifetime, causing repeat-visit re-downloads (~9 KiB).
  *Fix: GitHub Pages can't customise cache headers; if longer caching matters, host assets behind a CDN that allows immutable, fingerprinted long-`max-age` URLs.*

- **`favicon.ico` returns 404** — `https://dan323.github.io/favicon.ico` 404s on every page load (verified), producing a console error and a wasted request.
  *Fix: Add a real favicon (or `<link rel="icon">` pointing to an existing asset) at the site root.*

- **LCP/CLS risk from client-side rendering** — Current run shows LCP=1.0s, CLS=0, but the pattern (empty initial HTML, JS-injected content) is fragile on slower networks.
  *Fix: Pre-render the initial catalog into the HTML at build time, or reserve fixed-height placeholder skeletons for the grid and count so layout is stable and the LCP element exists in the initial HTML.*

- **Badge contrast (Lighthouse-flagged)** — Same finding as the accessibility audit (`badge-source` ~3.99:1, `badge-documentation` ~3.51:1).
  *Fix: See the 1.4.3 accessibility recommendations.*

---

## Bugs & Functional Issues

*No functional bugs found.* A live Playwright run loaded the page cleanly: `#skill-count` populated to "14", `#generated` populated to "May 7, 2026", no JS errors, no `requestfailed` events, no broken images, no template bleed-through (`{{`, `${`, `[object Object]`, literal `undefined`/`null`). All referenced static assets (`assets/style.css`, `assets/bundle.js`) return 200.

---

## Top 5 Recommendations

1. **Add an accessible name to the search input** — One-line change (`aria-label="Search skills"`) that resolves a WCAG 1.3.1 critical finding and the related medium UX issue at the same time.
2. **Fix the `CATALOG.md` 404 in the footer** — Either commit the file, point the link to the correct branch (or to a Pages-hosted catalog), or remove the link. Verified broken; leaves users at a dead end.
3. **Add a skip link and visible `:focus-visible` styles** — Small CSS/HTML additions that unblock keyboard navigation for the entire site (WCAG 2.4.1 + 2.1.1) and address one of the high UX findings.
4. **Render the initial catalog (or a skeleton) into the static HTML** — Eliminates the empty-page flash, improves Speed Index/LCP, and provides a graceful state if `bundle.js` or the JSON fetch fails. Largest perceived-quality win.
5. **Tighten badge and muted-text contrast** — Bumping a couple of CSS hex values fixes two AA contrast failures (`badge-source`, `badge-documentation`) and the heuristic muted-text concern in one pass.
