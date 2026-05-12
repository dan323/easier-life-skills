# Changelog

## [Unreleased]

### Added
- **Web UI — in-site Full catalog page** — the build now emits `catalog.html` alongside `CATALOG.md`. The new page is a styled, self-contained rendering of the catalog (same skills/agents/MCP/hooks/bundles data) that picks up theme variables from `assets/style.css`, so it matches the marketplace UI on GitHub Pages. The footer's `Full catalog` link now points at `./catalog.html` (same tab) instead of the GitHub blob view, keeping users in-site. `scripts/lib/catalog.ts` exposes a new `generateCatalogHtml()` alongside `generateCatalog()`; `scripts/build-index.ts` writes both files. `catalog.html` is gitignored — rebuilt on every CI run and uploaded by `actions/upload-pages-artifact`.
- **`tests/footer.test.ts`** — regression test asserting the Full catalog link points to `./catalog.html` and opens in the same tab.

### Fixed
- **Web UI — accessibility: nested-interactive controls on cards (WCAG 4.1.2)** — every plugin/skill/agent/MCP/command/hook card was rendered as `role="button"` *plus* contained focusable children (a title link to GitHub and a Copy button), which axe flagged as nested-interactive (≈15 violations on the homepage). Cards now use a single keyboard target: the title is a real `<button class="card-name">` that opens the detail panel; the wrapping `<div class="skill-card">` is non-interactive (no `role`, `tabindex`, or click handler). A CSS "stretched link" overlay (`.card-name::after { position: absolute; inset: 0; }` over `.skill-card { position: relative; }`) keeps clicks on the whole card area routed to the title button, while `.card-install` and `.plugin-chips` / `.card-chips` are lifted with `z-index: 1` so the Copy button and the `+N more` expand button stay independently clickable. Focus moves to `:focus-within` on the card so the entire tile shows the focus ring when the title is focused. The "View on GitHub" affordance previously on the card title is still reachable from the open panel (`panel-name` link / `Source` section).
- **Web UI — accessibility: nested-interactive controls on the marketplace source tag (WCAG 4.1.2)** — each chip in the marketplace bar was a `<div role="button" tabindex="0">` containing a real `<button class="source-add-copy">`, flagging 3 nested-interactive violations. Chips now follow the same pattern as plugin cards: the wrapper `<div class="source-tag">` is non-interactive, the filter toggle is a real `<button class="source-toggle" aria-pressed>` holding the label, and the `+` copy button is a sibling. A stretched-link overlay (`.source-toggle::after`) keeps clicks on the chip body activating the filter while the copy button (`z-index: 1`) remains independently clickable. Removes the previous `e.target.closest('.source-add-copy')` guard that mixed the two click handlers.
- **Web UI — accessibility: page content not contained by landmarks (WCAG 1.3.1)** — 10 region violations (QuickStart heading + steps, Controls view-toggle, Marketplace "Add your marketplace" CTA) sat outside any landmark region, so assistive-tech landmark navigation couldn't reach them. `QuickStart.tsx` now declares its `<section class="quickstart" aria-labelledby="quickstart-heading">` with a matching `<h2 id="quickstart-heading">` (a `<section>` only becomes a landmark when accessibly named). `Controls.tsx` swaps `<div class="controls">` for `<section class="controls" aria-label="Filters and view">`. `MarketplaceBar.tsx` swaps `<div class="marketplace-bar">` for `<nav class="marketplace-bar" aria-label="Marketplaces">`. `<main>`, `<header>`, and `<footer>` were already in place. Element-name swaps only — visible HTML, IDs, and CSS classes preserved.
- **Web UI — UX consistency: card titles** — title-as-link on some cards and title-as-span on others (built-in vs external marketplaces) made the click behaviour ambiguous; clicking the title now uniformly opens the detail panel regardless of source.

## [1.13.0] - 2026-05-11

### Changed
- **Web UI rewritten in Preact** — `assets/src/` is now a Preact component tree (`components/App.tsx` owns app state via `useState`/`useLayoutEffect`; `components/cards/*` for each card; `PluginPanel.tsx`, `EntityPanel.tsx`, `Controls.tsx`, `MarketplaceBar.tsx`, `Filters.tsx`, `Header.tsx`, `QuickStart.tsx`, `Footer.tsx`, `Grid.tsx`, `Expandable.tsx`, `CopyButton.tsx`). The imperative DOM modules (`render.ts`, `panel.ts`, `entity-panel.ts`, `filters.ts`, `source-tag.ts`, `state.ts`, `card-*.ts`) were deleted; only the framework-agnostic `api.ts`, `url-state.ts`, `utils.ts`, `constants.ts`, `types.ts`, and the rewritten `marketplace.ts` remain. The build entry is now `app.tsx`. **Behavior is identical** — verified by the new test suite below.
- **`index.html` reduced to a 16-line shell** (was 225 lines) — the header, quickstart, controls, marketplace bar, footer, and both detail panels are now rendered by Preact from a single `<div id="root">`. The visible HTML, CSS classes, and DOM IDs remain unchanged so the existing `assets/style.css` is untouched.
- **`assets/src/url-state.ts`** — refactored from singleton-coupled `syncStateToUrl()` to pure `readUrlState() / writeUrlState(state)` so state owners can be replaced without touching URL serialisation.

### Added
- **Web UI regression test suite** — `tests/` contains vitest + happy-dom behavioural tests that boot the real `app.tsx` against a fixture `skills_index.json` and drive the page via user-visible DOM. Coverage includes initial render, search, sort, view toggle for all 7 tabs, category/source filters, plugin panel, entity panel for all 5 kinds, URL state sync+restore, and copy buttons. Run with `npm test` (`npm run test:watch` for the watch loop).
- **Panel interactivity regression tests** — `tests/panel-interactivity.test.ts` makes DOM-state assertions (no ancestor of the open panel may carry `inert` or `aria-hidden="true"`; `#root` must be cleared of both attributes after the panel closes). This catches the class of bug where a previous version applied `inert` to `#root` itself, freezing every interaction inside the panel. Behavioural-only tests cannot catch this because happy-dom silently ignores `inert`.

### Fixed
- **Web UI — panels no longer freeze every interaction when opened** — the previous version walked `document.body.children` and applied the `inert` attribute to each non-panel sibling to trap focus. After the Preact rewrite the panels live inside `<div id="root">` rather than as direct body children, so `inert` landed on `#root` itself — which contains the panels — making the close button and overlay unclickable. The body-children walk was removed; focus management and scroll-lock are retained.
- **Web UI — plugin panel removes redundant per-item copy buttons** — the SkillCard, AgentCard, McpCard, CommandCard, and HookCard components now accept `showInstall: boolean` and skip rendering their `.card-install` row when it's `false`. The plugin panel passes `showInstall={false}` to all embedded cards, so the only copy buttons left are the plugin-level `Copy install` / `Copy add` rows at the bottom of the panel. Grid views still pass `showInstall={true}`.
- **Web UI — plugin install row stays visible while the panel scrolls** — the marketplace-add and install rows are now wrapped in `#panel-install-footer`, a sticky element (`position: sticky; bottom: -24px`) pinned to the bottom of the scrolling `.panel-content`. Plugins with many skills no longer hide the install command below the fold.
- **`npm run dev`** — one-command local development. Runs `tsx scripts/build-index.ts` once (to generate `skills_index.json`), then esbuild's built-in `--serve` mode on `http://127.0.0.1:4567/` with automatic rebuild on file changes. `index.html` includes a small inline live-reload snippet that subscribes to esbuild's `/esbuild` SSE endpoint and refreshes the page after each rebuild; the snippet only activates on `localhost`/`127.0.0.1` so it's a no-op on GitHub Pages.
- **Build / dev dependencies** — `preact ^10.29.1` (runtime), `@preact/preset-vite`, `vitest`, and `happy-dom` (test-time). Bundle is 75.8 KB unminified.
- **`assets/src/marketplace.ts`** — repurposed as a pure data loader: returns `{ plugins, skills, agents, mcpServers, commands, hooks, bundles, sources, meta }` or an error envelope. Previously mutated global state; now consumed by `App.tsx` via `setState`.

## [1.12.0] - 2026-05-11

### Added
- **Web UI — left-side detail panel for skills, agents, MCP servers, commands, and hooks** — entity cards in those views are now clickable (and Enter/Space focusable) and open a panel that slides in from the left edge. The panel shows the full description, kind + category + source badges, the relevant chip section (Tools for skills/agents, Triggers-on for hooks, Keywords for skills, Command for MCP servers), the parent bundles a skill belongs to, a Source link to the raw file, plus the `marketplace add` + `plugin install` rows already used by the plugin panel. The existing plugin panel stays on the right, so both can be open at once on wide screens.

### Changed
- **Web UI — agent cards no longer list tools inline** — the `Tools: …` line was producing horizontal overflow on agents with many tools (e.g. `task-agent`); tools are now only rendered as colored chips inside the entity detail panel, keeping the grid card the same shape as other entity cards.
- **Web UI — entity card descriptions explicitly clamped to 2 lines with ellipsis** — already enforced by `-webkit-line-clamp: 2; overflow: hidden` on `.card-desc`, but now the full text is reachable via the new detail panel instead of having to click the card to expand inline. Cards became `role="button"` + `tabindex="0"` to advertise the new affordance to keyboard / AT users.
- **`assets/src/types.ts`** — `Skill.tools` added (optional) to reflect what the index actually carries; needed by the new panel to render the Tools section.

## [1.11.0] - 2026-05-11

### Added
- **Web UI — per-marketplace install command on every source tag** — each marketplace chip in the marketplace bar now has a `+` button that copies `/plugin marketplace add <owner>/<repo>` to the clipboard, so visitors can install marketplaces beyond the built-in `dan323/easier-life-skills` directly from the chip row. The tag itself still acts as a filter toggle; the `+` is keyboard-focusable and stops click propagation so it doesn't double-fire as a filter toggle.
- **Web UI — plugin detail panel surfaces the `marketplace add` step** — when an opened plugin's source is not the built-in marketplace (e.g. `anthropics/skills`, `mattpocock/skills`), the panel renders a `/plugin marketplace add <owner>/<repo>` row above the existing install row, with its own Copy button. Built-in plugins continue to show only the install row (the marketplace add is already covered by the page's quickstart).

### Changed
- **Web UI — `source-tag` element converted from `<button>` to `<div role="button">`** — needed to nest the per-tag `+` copy button without producing invalid HTML; Enter/Space still toggle the filter, `aria-pressed` is preserved.
- **Web UI — `assets/src/constants.ts`** — extracted the `BUILTIN_REPO` constant (`dan323/easier-life-skills`) out of `app.ts` so the panel can detect non-builtin sources without a circular import.

## [1.10.0] - 2026-05-11

### Changed
- **`cv-linkedin` 2.1.0 — relaxed the "every bullet needs a metric" rule to reflect real engineering CVs** — Phase 3b's quantification check is now a broader **outcome check**: a bullet is complete if it carries a number, a scope/scale phrase, a named system, a before/after comparison, or a complexity signal — not only a digit. Hard numbers remain the right outcome for PMs and EMs (whose work is inherently measured in KPIs), but for engineers, scope and named systems are equally valid. Phase 5's placeholder is renamed `[METRIC]` → `[OUTCOME]` and must list at least two non-number options so users are not pushed to invent metrics. The change makes the skill more honest about what real engineering CVs look like (roughly 20–30% of bullets carry hard numbers; the rest convey outcome through scope and systems language).
- **`cv-linkedin` Phase 5 rule** — `[OUTCOME]` placeholders are now applied only to **pure-task** bullets ("Wrote unit tests"). Bullets that already carry scope, a named system, or a comparison are left as-is, even if they have no digit. The "Changes Made" block surfaces this explicitly.

### Added
- **`cv-linkedin` eval 2 assertion `no-outcome-placeholder-on-complete-bullets`** — verifies the skill leaves already-complete bullets alone instead of piling on placeholders (catches regressions to the old dogmatic behaviour).

## [1.9.0] - 2026-05-11

### Changed
- **`cv-linkedin` 2.0.0 — switched LinkedIn data source from live fetching to the official LinkedIn data export (breaking)** — Phase 2 now reads CSVs from a user-provided export directory (`Profile.csv`, `Positions.csv`, `Education.csv`, `Skills.csv` required; `Certifications.csv`, `Languages.csv`, `Projects.csv`, `Volunteering.csv` optional). The previous WebFetch-based scrape only ever returned the LinkedIn top card because the rest of the profile is lazy-loaded behind authenticated XHR calls, and cookie-based scraping additionally violates LinkedIn's TOS. The data export is LinkedIn's sanctioned mechanism and gives complete source-of-truth data. `WebFetch` removed from the skill's tool list.
- **`cv-linkedin` Phase 0 now walks the user through requesting the export** — if the export directory is missing, the skill emits the URL `https://www.linkedin.com/mypreferences/d/download-my-data`, the categories to tick (`Profile`, `Positions`, `Education`, `Skills`, `Certifications`, `Languages`, `Projects`), and waits for the user to return with the path. The "skip LinkedIn" path still works for CV-only runs.
- **`cv-linkedin` Phase 4e (CV vs. LinkedIn alignment) is now concrete** — comparisons are anchored on `Company Name` (Positions.csv) and `School Name` (Education.csv) joins against the CV rather than fuzzy text matching.

### Added
- **`cv-linkedin` reference doc `linkedin-export-schema.md`** — documents required/optional CSV columns, the `Month YYYY` date format, the `Description` multi-line gotcha (must use a real CSV parser, not `split(",")`), the `Started On`/`Start Date` column-name drift across export vintages, and the absence of "featured skills" flagging in the export.
- **`cv-linkedin` eval 6** — covers the "user has only a LinkedIn username, no export yet" path; asserts the skill emits export instructions and refuses to fabricate analysis from the bare username.

## [1.8.0] - 2026-05-09

### Fixed
- **Accessibility (High — WCAG 2.1.1)** — plugin cards (`.skill-card`) now have `role="button"`, `tabindex="0"`, and Enter/Space keydown handlers so keyboard-only users can open the detail panel
- **Accessibility (High — WCAG 4.1.2)** — source-filter tags converted from `<div>` to `<button>` elements; `aria-pressed` updated on toggle
- **Accessibility (High — WCAG 4.1.2)** — detail panel: focus moves to Close button on open; sibling content is marked `inert` (focus trap); focus is restored to the triggering card on close; panel has `role="dialog"`, `aria-modal="true"`, and `aria-hidden="true"` when closed
- **Accessibility (High — WCAG 4.1.2)** — all Copy buttons now have descriptive `aria-label="Copy install command for <name>"` instead of the generic "Copy" that was indistinguishable across 16 buttons
- **Accessibility (Medium — WCAG 4.1.2)** — view toggle buttons, category filter buttons now carry `aria-pressed="true/false"` updated on each click; sort button carries a full `aria-label` describing current order and click action
- **Accessibility (Medium — WCAG 2.4.1)** — skip link now uses the standard clip pattern (`clip-path: inset(50%)`) instead of `left: -9999px` offscreen positioning
- **Bugs** — `plugin.description` null guard added in `card-plugin.ts`, `panel.ts`, and `render.ts`; null description no longer crashes `.trim()` or renders the literal string "null"
- **UX** — "Full catalog" footer link now points to the GitHub-rendered CATALOG.md page (opens in new tab) instead of the raw file with no navigation and a console error
- **UX** — expand button label now reads "+N items" instead of the ambiguous "+N more"
- **UX** — GitHub header link has `aria-label="GitHub (opens in new tab)"`
- **Performance** — added `<link rel="preload" as="fetch" href="skills_index.json">` so the JSON starts loading in parallel with bundle.js, reducing the 3-hop fetch chain
- **Performance** — `.marketplace-bar` now has `min-height: 48px` to reserve layout space before JS renders source tags, reducing CLS

## [1.7.0] - 2026-05-09

### Changed
- **`site-audit` 1.3.0 — reduced token usage** — eliminated the two main sources of excess token consumption:
  - **Removed Phase 2 reference embedding**: the skill no longer reads all five reference files (`ux-checks.md`, `accessibility-checks.md`, `performance-checks.md`, `bug-patterns.md`, `script-authoring.md`) into the main context and embeds them verbatim in every agent prompt; each specialist agent now receives only the path to its reference file and reads it independently, removing ~15 KB from the orchestrator context and significantly shortening each of the four parallel agent prompts
  - **Windows compatibility for `bug-script-runner`**: the agent now runs `uname -s` as its first step; on Windows (`MINGW`/`MSYS`/`CYGWIN`) it skips the `npx playwright test` spec-file path entirely (which previously burned 100k+ tokens due to `/tmp` divergence between the Write tool and Bash) and instead uses the Playwright MCP tools directly to navigate, inspect console errors, check network requests, detect template bleed-through, and click safe interactive elements; the Linux/macOS spec-file path is unchanged

### Added
- **`site-audit-report.md`** — new audit of the project's own GitHub Pages site (`https://dan323.github.io/easier-life-skills/`); 39 findings across UX (13), accessibility (16), performance (5), and bugs (5); Lighthouse score 94/100; no critical issues

## [1.6.0] - 2026-05-09

### Fixed
- **Accessibility (Critical — WCAG 1.3.1)** — search input now has `aria-label="Search skills"`; previously had no accessible name, so screen readers announced "edit, blank"
- **Accessibility (High — WCAG 2.4.1)** — added a visually-hidden skip link (`Skip to main content`) as the first focusable element; `<main>` now has `id="main"`
- **Accessibility (High — WCAG 4.1.2)** — `#panel-close` button now has `aria-label="Close"` with the `×` glyph wrapped in `aria-hidden`
- **Accessibility (High — WCAG 4.1.2)** — decorative `★` in the GitHub header link is now `aria-hidden`; screen readers no longer announce "black star"
- **Accessibility (High — WCAG 1.4.3)** — `.badge-source` foreground lifted to `#8ba3c4` on `#0e1424` (was ~3.99:1, now ≥4.5:1); `.badge-documentation` text changed to `#4f9bff` on `#0d2137` (was ~3.51:1, now ~5.2:1)
- **Accessibility (Medium — WCAG 4.1.2)** — `#skill-count` and `#count` now have `aria-live="polite" aria-atomic="true"` so filter changes are announced to screen readers
- **Accessibility (Low — WCAG 1.3.5)** — search input is now wrapped in `<form role="search">` to expose the search landmark
- **UX — missing focus styles** — added global `:focus-visible` rule (2px accent outline); all buttons, links, and interactive controls now have a visible keyboard focus ring
- **UX — muted text contrast** — `--text-muted` lifted from `#8b949e` to `#b1bac4` for improved legibility
- **UX — footer "Full catalog" 404** — link changed from `https://github.com/dan323/easier-life-skills/blob/master/CATALOG.md` (the file is gitignored and never committed) to the relative `CATALOG.md` served by GitHub Pages
- **UX — external link inconsistency** — footer "Contribute" and "GitHub" links now use `target="_blank" rel="noopener"`, matching the header GitHub button
- **UX — sort button ambiguity** — sort button text changed to `Sort: A→Z` / `Sort: Z→A` with matching `Click to sort …` tooltip so current order and next action are unambiguous
- **UX — copy confirmation** — "Copied!" confirmation extended from 1.8 s to 3 s; a `#sr-announce` `aria-live="polite"` region now announces "Command copied to clipboard" to screen readers
- **UX — quickstart jargon** — added "Run these commands inside the Claude Code CLI" note with a link to the Claude Code docs above the quickstart steps
- **UX — misleading copy button** — Step 2 "Copy example" button relabelled to "Copy (changelog example)" to make clear it copies a specific example, not the placeholder shown
- **UX — favicon 404** — added inline SVG `<link rel="icon">` data URI; eliminates the 404 console error on every page load
- **UX — H1 not a home link** — `<h1>` is now wrapped in `<a href=".">` so clicking the logo resets all URL state
- **UX — mobile tap targets** — on `≤640px` all interactive buttons now have `min-height: 44px; min-width: 44px` (WCAG 2.5.5 target size)
- **UX — view toggle mobile overflow** — view toggle is now `overflow-x: auto` on narrow viewports so the 7 buttons scroll rather than wrap

### Added
- **`site-audit` plugin** — audits a live website for UX issues, accessibility violations (WCAG 2.1), performance problems, and functional bugs; spawns four specialist agents in parallel (`ux-analyst`, `accessibility-auditor`, `performance-auditor`, `bug-hunter`); uses Lighthouse, axe-cli, pa11y, and Playwright via `npx` when available, with AI-based WebFetch analysis as fallback; writes `site-audit-report.md` with findings grouped by severity; includes an `audit-logger` hook that appends completed audits to `~/.claude/audit-history.jsonl`
- **`site-audit` interactive bug-hunter** (1.1.0) — `bug-hunter` agent now drives a real browser via the Playwright MCP server (declared in `plugins/site-audit/.mcp.json`), navigating and clicking turn-by-turn instead of running a one-shot script; crawl is bounded to **3 hops from the seed URL**, **same host only**, with a 25-page budget; safe-click rules skip submit, login, checkout, purchase, and other destructive controls; falls back to passive HTML analysis if the MCP server is unavailable; new "Interactive UX failure patterns" section in `references/bug-patterns.md` covers dead clicks, modal traps, dead menus, pagination loops, recurring cookie banners, and empty button labels
- **`site-audit` shared site map + on-the-fly Playwright script** (1.2.0) — new `site-mapper` agent crawls once via the Playwright MCP server and writes `sitemap.json` (URLs, real selectors, forms, links, console errors, failed network requests) to `/tmp/site-audit-<host>/`; `ux-analyst`, `accessibility-auditor`, and `performance-auditor` now read this artifact instead of crawling themselves (they retain their original fallback when no sitemap is provided); new `bug-script-runner` agent replaces the previous interactive `bug-hunter` — it authors a Playwright `bugs.spec.ts` on the fly using only selectors that appear in `sitemap.json`, runs it via `npx playwright test --reporter=json`, and converts failed assertions into bug findings; new `references/script-authoring.md` documents selector-grounding, click-safety, severity-prefixed test titles, and reporter shape; `accessibility-auditor` now audits up to 10 pages from the sitemap (was: seed only); `performance-auditor` audits up to 3 diverse pages (was: seed only); `site-mapper` hard-fails if the Playwright MCP server is unavailable, halting the audit with a clear install hint instead of silently degrading
- **`cost-tracker` hook plugin** — `Stop`/`SubagentStop` hook that appends a JSON line to `~/.claude/cost-log.jsonl` with `date`, `session_id`, `input_tokens`, `output_tokens`, and `estimated_usd` (Sonnet pricing by default); aggregatable with `jq` one-liners; requires Python 3
- **Sort controls** — A→Z / Z→A toggle button in the controls bar; applies to all views (plugins, skills, agents, MCP servers, commands, hooks); sort direction is persisted in the URL hash
- **Keyboard shortcut** — press `/` anywhere on the page to focus the search box and select all text
- **"Add your marketplace →" CTA** — link in the marketplace bar opens a GitHub issue template (`.github/ISSUE_TEMPLATE/add-marketplace.yml`) that collects `owner/repo`, description, and a requirements checklist

### Fixed
- **`task-agent` plugin manifest** — removed the `agents` field from `plugin.json`; Claude Code's current manifest validator rejected the `["./agents/…"]` string-array format with "agents: Invalid input", preventing the plugin from loading
- **Local-first marketplace resolution** — `fetch-marketplace.ts` now reads `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json` via `readFile` (local-filesystem-first) instead of always fetching remotely; local builds now pick up newly added plugins immediately without needing to push first

## [1.5.0] - 2026-05-03

### Added
- **Commands and Hooks support** — build pipeline, web UI, and type definitions now index and display Command and Hook entities alongside plugins, skills, agents, and MCP servers; each has its own grid view and card component
- **URL state sharing** — active view, search query, category filters, and repo filters are now synced to the URL hash (`#view=skills&q=…&cat=…&repo=…`); links to specific filtered states are now shareable and survive page reload (`url-state.ts`)
- **`card-hook.ts`** — dedicated card component for hooks, showing event trigger chips alongside install command

### Changed
- **Web UI component split** — monolithic `components.ts` (250 lines) replaced by individual `card-plugin.ts`, `card-skill.ts`, `card-agent.ts`, `card-mcp.ts`, `card-command.ts`, `card-bundle.ts`, `source-tag.ts`, `filters.ts`, and `utils.ts`; each entity type is now independently editable
- **Skill-specific model URLs** — each skill's `rawSkillUrl` now links directly to its source file in the upstream repo with the correct branch ref

### Fixed
- **Skill path resolution at plugin root** — when a skill is declared as `"./"` in `plugin.json`, `parseSkill` now falls back to the plugin name instead of producing an empty string, and uses `filter(Boolean)` to avoid double-slash paths (deeea00)

## [1.4.0] - 2026-05-02

### Fixed
- **`main`/`master` branch mismatch** — the GitHub Trees API requires the exact branch ref; repos that use `main` as their default branch (e.g. `anthropics/knowledge-work-plugins`) previously returned 404 for all tree lookups because the build always tried `master` first. Raw content fetches (`raw.githubusercontent.com`) silently redirect `master`→`main` so file reads worked, but tree-based skill discovery failed entirely. Fix: if the Trees API returns 404, retry with the alternate canonical name (`master`↔`main`). Skills for `knowledge-work-plugins` jumped from ~146 to ~300 after this fix.
- **External plugin skill discovery** — `fetch-marketplace.ts` no longer uses the local repo's filesystem when resolving skills for external plugins (repos referenced via `source: url` or `source: git-subdir`); previously, paths like `skills/` would match the local directory instead of fetching from the remote repo
- **SHA-pinned sources** — plugins with `sha`-pinned upstream refs (no `ref` branch) now correctly resolve to the pinned SHA instead of defaulting to `main`; affects `fastly-agent-toolkit`, `brightdata-plugin`, `searchfit-seo`, `ai-firstify`, `product-tracking-skills`, `box`, and similar externally-hosted plugins
- **Per-repo root isolation** — `build-index.ts` now passes `null` as the local root for all non-local marketplaces, ensuring no cross-contamination between the local repo's file tree and remote repo content

### Added
- **Tree API response cache** — successful GitHub tree fetches are written to `.cache/trees/` (gitignored); subsequent builds reuse the disk cache, so only the first build with `GITHUB_TOKEN` needs to hit the API for each repo
- **CI tree cache** — `pages.yml` uses `actions/cache@v4` to persist `.cache/trees/` between CI runs, keyed on `marketplaces.json` content

## [1.3.0] - 2026-05-02

### Added
- **TypeScript migration** — build scripts (`scripts/build-index.ts`, `scripts/lib/*.ts`) and web assets (`assets/src/*.ts`) are now written in TypeScript; `tsconfig.json` covers scripts, `tsconfig.web.json` covers the browser app
- **esbuild bundling** — web assets are compiled from `assets/src/app.ts` into a single `assets/bundle.js`; `npm run build` now runs both the index generator and the bundler
- **`npm run typecheck`** — checks both the scripts and the web app
- **External category overrides** — `.claude-plugin/external-overrides.json` now categorises all uncategorised plugins and skills from `anthropics/knowledge-work-plugins` and `anthropics/skills`

### Changed
- **Read-only detection** — skills are now tagged `readOnly` based on their declared `tools` frontmatter: no `Write`, `Edit`, or `NotebookEdit` in the tool list = read-only; the old text-string heuristic (`"This skill is read-only"`) is removed
- **Remote directory listing** — `fetch-marketplace.ts` now fetches one recursive git tree per repo (GitHub Trees API) instead of one Contents API call per directory listing; significantly fewer API calls and more rate-limit friendly
- **CI** — `GITHUB_TOKEN` is now passed to the `npm run build` step so the tree fetch uses the higher authenticated rate limit
- `assets/bundle.js` is gitignored; it is generated by CI and included in the GitHub Pages deployment artifact

### Removed
- Old JS source files in `scripts/lib/` (`catalog.js`, `fetch-marketplace.js`, `frontmatter.js`) and `scripts/build-index.js` — replaced by TypeScript equivalents
- Old JS web asset modules (`assets/app.js`, `assets/api.js`, `assets/state.js`, `assets/components.js`, `assets/marketplace.js`, `assets/render.js`, `assets/panel.js`) — replaced by `assets/src/*.ts`

## [1.2.0] - 2026-05-01

### Added
- **Plugin detail panel** — clicking a plugin in the website opens a slide-in drawer showing its description (or a copyable prompt if none), skills, agents, MCP servers, and bundle membership
- **Plugins view** — new default tab in the website; plugins, skills, agents, MCP servers, and bundles each have their own grid view
- **Agent support** — build pipeline and website now index and display agents; `copilot-review-fixer` is the first registered agent (bundled with `task-agent`)
- **MCP server support** — build pipeline and website now index and display MCP servers
- `.claude-plugin/bundles.json` — bundle definitions extracted from build script into a standalone config file
- `scripts/lib/catalog.js` — generates Agents and MCP Servers sections in `CATALOG.md`

### Changed
- **`marketplace.json` is now generated from `plugins/*/` scan** — `build-index.js` reads each `plugins/<name>/.claude-plugin/plugin.json`, derives `name`, `description`, `category`, `source`, and `homepage`, and writes `.claude-plugin/marketplace.json`; the old hand-maintained `marketplace.source.json` is retired
- **CI commits `marketplace.json` back** — `pages.yml` upgraded to `contents: write`; after `npm run build` the pipeline commits `.claude-plugin/marketplace.json` to the branch if it changed (with `[skip ci]` to prevent loops)
- **`plugin.json` now declares `category`** — each of the 8 local plugins has a `category` field; categories no longer live in a separate registry file
- **`fetch-marketplace.js` rewritten** — skills and agents are now auto-discovered from their default directories (`skills/`, `agents/`) when not explicitly declared; a string declaration is treated as a parent directory to scan (via GitHub Contents API for remote repos); MCP servers now accept an object keyed by server name, a string path to a JSON file, or a `.mcp.json` at the plugin root
- **`skills_index.json`** now includes `plugins`, `agents`, `mcpServers`, and updated `meta` counts alongside `skills`
- `marketplaces.json` now accepts an optional `description` per marketplace entry, used in the generated `marketplace.json`
- External plugin categories flow from the upstream `marketplace.json` directly; `external-overrides.json` supplements where the upstream does not declare one
- `pages.yml` — removed AI categorisation; no longer needs `models: read` permission or `MODELS_TOKEN`

### Removed
- `marketplace.source.json` — replaced by per-plugin `category` in `plugin.json` and build-time generation
- AI-based categorisation via GitHub Models API (`categorize.js` deleted, `MODELS_TOKEN` removed from CI)
- "Add marketplace" runtime feature from the website — was non-functional; marketplace list is now build-time only
- `$schema` field removed from generated `marketplace.json` (URL was a 404 with no replacement)

## [1.1.0] - 2026-04-19

### Added
- `find-skills` plugin — analyzes the active repository and recommends relevant Claude Code skills from known marketplaces
- `plugins/task-agent/references/isabelle.md` — General Isabelle language reference: build commands, Isar proof language, tactics, locales, sessions, and HOL vs ZF comparison
- `plugins/task-agent/references/IsarMathLib.md` — IsarMathLib style guide (declarative Isar, comment conventions, file structure, naming rules)
- `brainstorm` trigger added to `docs/getting-started.md` trigger table

### Changed
- Repo restructured as a Claude Code plugin marketplace. Each skill is now a plugin under `plugins/<name>/` with a `.claude-plugin/plugin.json` manifest and `skills/<name>/SKILL.md`.
- Added `.claude-plugin/marketplace.json` — marketplace catalog; install all plugins with `/plugin marketplace add dan323/easier-life-skills`.
- Removed `scripts/` — installation is now handled entirely by the Claude Code plugin system.

## [1.0.0] - 2026-02-01

### Added
- `task-agent` skill — reads `agent-tasks.yml`, picks the next pending task, clones the target repo, spawns a Claude agent to implement the change, opens a PR, and persists state to `agent-tasks-state.yml`
- `agent-tasks.yml` — sample config demonstrating the task-agent format
- `plugins/task-agent/run.sh` — entry point for non-interactive invocation

## [0.1.0] - 2026-01-01

### Added
- `changelog` skill
- `document-project` skill
- `find-dead-code` skill
- `find-breaking-rest-api` skill
- `improve-logging` skill
- `brainstorm` skill

[Unreleased]: https://github.com/dan323/skill-easy-life/compare/v1.5.0...HEAD
[1.5.0]: https://github.com/dan323/skill-easy-life/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/dan323/skill-easy-life/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/dan323/skill-easy-life/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/dan323/skill-easy-life/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/dan323/skill-easy-life/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/dan323/skill-easy-life/compare/v0.1.0...v1.0.0
