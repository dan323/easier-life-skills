# Site Audit: https://dan323.github.io/easier-life-skills/
*Generated: 2026-05-09T08:20:00Z*

## Summary

| Category       | Critical | High | Medium | Low | Total |
|----------------|----------|------|--------|-----|-------|
| UX             | 0        | 4    | 5      | 4   | 13    |
| Accessibility  | 0        | 9    | 6      | 1   | 16    |
| Performance    | 0        | 0    | 1      | 4   | 5     |
| Bugs           | 0        | 2    | 2      | 1   | 5     |
| **Total**      | **0**    | **15**| **14** | **10**| **39** |

> **Lighthouse performance score: 94/100**

---

## Critical Issues

*No critical issues found.*

---

## UX Issues

### High

- **https://dan323.github.io/easier-life-skills/** (Content clarity) — The "Get started in 2 steps" code block for step 2 is pre-filled with `/plugin install changelog@easier-life-skills` rather than a generic placeholder. A user who copies it verbatim installs `changelog` regardless of which plugin they actually browsed to.
  *Fix: Replace the hardcoded example with `/plugin install <skill-name>@easier-life-skills` and add a note like "(replace `<skill-name>` with the plugin you want)".*

- **https://dan323.github.io/easier-life-skills/CATALOG.md** (Content clarity) — The "Full catalog" footer link navigates to a raw Markdown file served as `text/plain`. The browser renders unstyled monospace text with no page title, no navigation, and a console error. Confirmed via live browser test.
  *Fix: Either render CATALOG.md inside the SPA as a styled panel, link to the GitHub-rendered view, or add a "Back to marketplace" HTML anchor at the top of the raw file.*

- **https://dan323.github.io/easier-life-skills/CATALOG.md** (Navigation) — The CATALOG.md page is a dead-end with no logo, no navigation, and no route back except the browser Back button.
  *Fix: Add a "Back to marketplace" link, or serve the catalog as an in-app rendered page.*

- **https://dan323.github.io/easier-life-skills/** (Consistency) — The "+7 more", "+8 more", and "+2 more" expand buttons on plugin skill tags use purely numeric labels with no noun. It is unclear whether clicking expands skills, tags, or opens a detail panel.
  *Fix: Change labels to "+7 more skills" (or whichever noun applies) so the action is self-describing.*

### Medium

- **https://dan323.github.io/easier-life-skills/** (Navigation) — All application state (category, view, sort, repo) is stored in URL hash params, but there is no visible summary line reflecting the current filter context for users following a shared URL.
  *Fix: Add a visible label such as "Showing: Skills — sorted Z to A" below the filter controls that reflects hash state.*

- **https://dan323.github.io/easier-life-skills/** (Consistency) — Category filter buttons (Automation, Code Quality, etc.) are only shown in the Plugins view. Switching to Skills, Agents, or other tabs hides them entirely without explanation.
  *Fix: Either show the category bar in all views (greyed-out or adapted) or add a visible note when entering a non-Plugins view.*

- **https://dan323.github.io/easier-life-skills/#repo=anthropics%2Fskills** (Content clarity) — When the source filter is set to `anthropics/skills`, the category bar silently narrows (removing Automation, Code Quality, Mixed), which users could mistake for a rendering bug.
  *Fix: Add a tooltip or inline note such as "Showing categories available in anthropics/skills" when the category list is narrowed by a source filter.*

- **https://dan323.github.io/easier-life-skills/** (Mobile hints) — Source-list filter items are `<div>` elements with `cursor: pointer`. On mobile, these lack native tap-target sizing and may be difficult to activate reliably.
  *Fix: Convert source-list items to `<button>` elements or add `role="button"` and a `min-height: 44px`.*

- **https://dan323.github.io/easier-life-skills/** (Consistency) — The `mattpocock-skills` plugin card has a `null` description. If the UI renders an empty card body silently, that card is visually inconsistent with all others.
  *Fix: Provide a fallback description "No description available" and ensure card layout does not collapse when description is absent.*

### Low

- **https://dan323.github.io/easier-life-skills/** (Content clarity) — The sort button label reads "Sort: A→Z" when sorted A→Z, ambiguously describing the current state rather than the click action.
  *Fix: Use a label like "Sort Z→A" (the action) with a secondary indicator "Currently: A→Z", or a tooltip clarifying the toggle.*

- **https://dan323.github.io/easier-life-skills/** (Navigation) — The GitHub header link lacks a visible "opens in new tab" indicator (external-link icon + `aria-label`).
  *Fix: Add a standard external-link icon and `aria-label="GitHub (opens in new tab)"` to the link.*

- **https://dan323.github.io/easier-life-skills/#view=agents** (Content clarity) — The Agents view provides no explanation of what an "agent" is in this marketplace's terminology versus a "skill" or "plugin".
  *Fix: Add a one-sentence contextual note under the Agents tab header.*

- **https://dan323.github.io/easier-life-skills/** (Mobile hints) — The 7-tab type row (Plugins / Skills / Agents / MCP Servers / Commands / Hooks / Bundles) may overflow on narrow viewports since multi-word labels like "MCP Servers" take significant space.
  *Fix: Implement a scrollable horizontal tab strip with visible scroll affordances, or collapse less-used tabs behind a "More" dropdown on mobile.*

---

## Accessibility Issues

### High

- **https://dan323.github.io/easier-life-skills/** (WCAG 2.4.1) — `.skip-link` — The skip-to-main-content link is visually hidden via `left: -9999px` and uses `position: fixed` on focus with no guarantee of rendering above all overlays at all viewport sizes. Should be verified with NVDA/JAWS.
  *Fix: Use the standard clip pattern (`clip-path` or `clip + overflow:hidden`) instead of offscreen positioning for the skip link.*

- **https://dan323.github.io/easier-life-skills/CATALOG.md** (WCAG 2.4.2) — `<title>` — The CATALOG.md page has an empty title (sitemap records `"title": ""`).
  *Fix: Serve CATALOG.md as an HTML page with a meaningful `<title>`, or replace the link with one pointing to a properly titled page.*

- **https://dan323.github.io/easier-life-skills/** (WCAG 4.1.2) — `<a id="panel-name" class="panel-name">` — The plugin detail panel's name anchor is an empty, focusable `<a>` with no text and no `aria-label` when the panel is closed, making it invisible to assistive technologies.
  *Fix: Add `aria-hidden="true"` and `tabindex="-1"` to `#panel-name` when the panel is closed, or apply the `inert` attribute to the entire closed panel.*

- **https://dan323.github.io/easier-life-skills/** (WCAG 4.1.2) — `.source-tag` elements — Marketplace source filter tags are `<div>` elements with click handlers but no `role="button"`, no `tabindex`, and no keyboard event handling. Completely inaccessible to keyboard and AT users.
  *Fix: Change each source tag to a `<button>` element (strongly preferred over adding ARIA attributes to a `<div>`).*

- **https://dan323.github.io/easier-life-skills/** (WCAG 2.1.1) — `.skill-card` — Plugin cards are `<div>` elements with `click` listeners and `cursor: pointer` but no `role`, no `tabindex`, and no keyboard handler. Keyboard users cannot open the plugin detail panel.
  *Fix: Add `role="button"` and `tabindex="0"` to each card, and a `keydown` handler triggering open on Enter and Space.*

- **https://dan323.github.io/easier-life-skills/** (WCAG 4.1.2) — `.copy-btn` buttons — All Copy buttons carry only the visible text "Copy" or "Copy all". With 16 Copy buttons on the same page, screen reader users cannot distinguish which command each button copies.
  *Fix: Add a descriptive `aria-label` to each Copy button, e.g., `aria-label="Copy install command for changelog"`.*

- **https://dan323.github.io/easier-life-skills/#cat=automation** (WCAG 4.1.2) — Plugin detail panel — When a card is clicked and the panel opens, focus is not programmatically moved into the panel. Keyboard and screen reader users remain focused on the card behind the overlay.
  *Fix: After `panel.classList.add('open')`, call `closeBtn.focus()` to move focus into the panel. On close, restore focus to the triggering card.*

- **https://dan323.github.io/easier-life-skills/#cat=automation** (WCAG 4.1.2) — Plugin detail panel — The panel does not implement a focus trap. Keyboard users can Tab through the underlying page behind the overlay.
  *Fix: Use the `inert` attribute on all sibling elements outside the panel when it is open, or implement a manual focus trap cycling Tab/Shift+Tab within panel focusable elements.*

- **https://dan323.github.io/easier-life-skills/** (WCAG 2.1.1) — `#panel-overlay` — The overlay backdrop has a click handler to close the panel but no keyboard equivalent. Acceptable only if the close button reliably receives focus on panel open (see focus management finding above).
  *Fix: Confirm the close button receives focus when the panel opens so keyboard users always have a reachable dismiss path.*

### Medium

- **https://dan323.github.io/easier-life-skills/** (WCAG 4.1.2) — View toggle buttons (`#view-plugins`, `#view-skills`, etc.) — Active state is conveyed only via CSS class and color; no `aria-pressed` attribute is set.
  *Fix: Add `aria-pressed="true"` to the active view button and `aria-pressed="false"` to others; update on `switchView()`.*

- **https://dan323.github.io/easier-life-skills/** (WCAG 4.1.2) — Category filter buttons (`.filter-btn`) — Active/inactive state communicated only through CSS. No `aria-pressed` attribute.
  *Fix: Set `aria-pressed="true"` on active filter buttons and `aria-pressed="false"` on inactive ones; update in the click handler.*

- **https://dan323.github.io/easier-life-skills/** (WCAG 4.1.2) — Sort button (`#sort-btn`) — Sort direction communicated only through text content change. No `aria-pressed` or `aria-label` update on toggle.
  *Fix: Update `aria-label` on each click to explicitly state current and next direction, e.g., `aria-label="Currently sorted A to Z. Click to sort Z to A."`*

- **https://dan323.github.io/easier-life-skills/** (WCAG 1.4.3) — Small text elements using `color: var(--text-muted)` and badge elements — Contrast appears adequate at larger sizes, but smallest text (0.65–0.72rem badges) and muted-on-dark combinations should be verified with a dedicated tool.
  *Fix: Verify all text/background combinations with WebAIM Contrast Checker, especially badge and caption text at minimum font sizes.*

- **https://dan323.github.io/easier-life-skills/** (WCAG 1.3.1) — `.card-desc` `<p>` — The description paragraph has `cursor: pointer` and `user-select: none` and toggles an `.expanded` class, but has no semantic role or keyboard access for this interactive behavior.
  *Fix: Remove the click-to-expand behavior from the description paragraph (rely on the card-level click), or wrap the expand trigger in a `<button>` with `aria-expanded` state.*

- **https://dan323.github.io/easier-life-skills/** (WCAG 4.1.1) — Dynamically rendered card elements — The dynamic rendering pipeline in `render.ts` replaces grid contents on each render. Risk of duplicate `id` attributes being introduced for panel sub-elements at runtime.
  *Fix: Audit the rendered DOM after page load to confirm no duplicate `id` attributes are present.*

### Low

- **https://dan323.github.io/easier-life-skills/** (WCAG 1.3.5) — `<input id="search" type="search">` — The search input has `autocomplete="off"` explicitly set. No personal-data inputs present. No action required.

---

## Performance Issues

> **Lighthouse performance score: 94/100**

### Medium

- **https://dan323.github.io/easier-life-skills/** (Cumulative Layout Shift) — `body > div.marketplace-bar` causes a layout shift of **0.146** (good threshold: < 0.1) after JavaScript injects the source-list content into the DOM. Value: `CLS 0.146`.
  *Fix: Reserve space for the marketplace-bar before JS executes with a fixed `min-height` in CSS, or render it inline in the HTML so it is present before the JS bundle loads.*

### Low

- **https://dan323.github.io/easier-life-skills/** (Render-blocking resources) — `assets/style.css` is loaded as a render-blocking stylesheet in `<head>`. FCP is fast (0.8 s) so real-world impact is small, but the block adds latency on slow connections. Value: `4063 bytes`.
  *Fix: Inline critical-path CSS in `<head>` and load the full stylesheet with `<link rel="preload" as="style" onload="this.rel='stylesheet'">`.*

- **https://dan323.github.io/easier-life-skills/** (Cache lifetime) — `assets/bundle.js` and `assets/style.css` are served with a 10-minute TTL (600 s) by GitHub Pages. Repeat visitors re-download ~10 KiB on every visit beyond that window.
  *Fix: Use content-hashed filenames (e.g., `bundle.abc123.js`) so assets can be cached indefinitely via `Cache-Control: max-age=31536000, immutable`.*

- **https://dan323.github.io/easier-life-skills/** (Critical request chain depth) — Content depends on a 3-hop sequential fetch chain: HTML → `assets/bundle.js` → `skills_index.json`. Plugin cards only render after all three complete (~139 ms on fast network; longer on mobile). Value: `chain depth: 3`.
  *Fix: Add `<link rel="preload" as="fetch" href="skills_index.json" crossorigin>` in `<head>` so `skills_index.json` starts loading in parallel with `bundle.js`.*

- **https://dan323.github.io/easier-life-skills/CATALOG.md** (Missing favicon) — The browser requests `https://dan323.github.io/favicon.ico` and receives a 404, adding an unnecessary RTT on every page load. Value: `HTTP 404`.
  *Fix: Add a `favicon.ico` at the repository root or a `<link rel="icon">` tag in `index.html` pointing to a valid asset.*

---

## Bugs & Functional Issues

### High

- **https://dan323.github.io/easier-life-skills/** (Template bleed / null rendering) — The `mattpocock-skills` plugin card has `description: null` in `skills_index.json`. If the card template interpolates this field without a null guard, the literal string `"null"` may appear in the visible card description area.
  *Fix: Add a null guard in `render.ts` / `components.ts`: use `description ?? ''` or `description ?? 'No description available'` before injecting the description into the DOM.*

- **https://dan323.github.io/easier-life-skills/CATALOG.md** (Broken navigation / dead-end page) — Clicking "Full catalog" in the footer navigates to a raw Markdown file that renders as unstyled text with a console error, empty page title, and no navigation back to the marketplace. Confirmed via live browser test.
  *Fix: Render CATALOG.md in-SPA as a styled panel, or link to the GitHub-rendered HTML view. At minimum, add a "Back to marketplace" anchor at the top of the raw file.*

### Medium

- **https://dan323.github.io/easier-life-skills/#view=skills** (Filter state bleed across views) — Category filter (`cat=automation`) and search query persist in the URL when switching between type tabs (e.g., Plugins → Skills), showing 0 results with no indication that a cross-view filter is active. Confirmed via live browser test (URL became `#view=skills&q=xyznotfound&cat=automation`).
  *Fix: Clear or visually surface cross-view filter state when switching tabs, or add a prominent "Clear filters" affordance.*

- **https://dan323.github.io/easier-life-skills/** (Duplicate accessible button names) — 16 "Copy" buttons share the identical accessible name "Copy" (confirmed: Playwright strict-mode violation resolving to 16 elements). Screen readers and keyboard users cannot distinguish between them.
  *Fix: Add `aria-label` to each Copy button identifying what it copies, e.g., `aria-label="Copy install command for changelog"`.*

### Low

- **https://dan323.github.io/easier-life-skills/#cat=automation** (Modal trap risk) — The detail panel's Close button may not dismiss the panel in all hash-routing scenarios. If the panel state is re-triggered when the hash is restored after Back-button navigation, the panel could reopen unexpectedly.
  *Fix: Verify that clicking Close removes the `open` class and that Back-button navigation does not re-trigger the panel. Ensure panel state is not driven solely by the URL hash.*

---

## Top 5 Recommendations

1. **Fix plugin card and source-filter keyboard accessibility** — Plugin cards (`.skill-card`) and source filter tags (`.source-tag`) are `<div>` elements with click handlers but no keyboard access. This blocks all keyboard-only and assistive-technology users from the two core interactions on the page. Add `role="button"`, `tabindex="0"`, and Enter/Space keydown handlers, or convert to native `<button>` elements.

2. **Implement focus management and focus trap for the plugin detail panel** — When the panel opens, focus remains on the card behind the overlay; while open, Tab escapes to the underlying page. On open, call `closeBtn.focus()`; use the `inert` attribute on sibling content; on close, restore focus to the triggering card.

3. **Fix the CATALOG.md dead-end** — The "Full catalog" footer link navigates to a raw Markdown file with a console error, no title, and no back navigation. Render the catalog in-SPA, or replace the link with one pointing to the GitHub-rendered HTML view.

4. **Add `aria-pressed` to all toggle buttons** — View tabs, category filter buttons, and the sort toggle communicate active state only via CSS. Adding `aria-pressed="true/false"` (updated on each click) is a small, targeted change that makes all three controls accessible to screen reader users with no visual change.

5. **Add descriptive `aria-label` to all Copy buttons** — 16 "Copy" buttons share an identical accessible name. Adding `aria-label="Copy install command for <plugin-name>"` to each simultaneously resolves an accessibility issue, a UX confusion point, and a confirmed bug finding, and is among the lowest-effort fixes in the report.
