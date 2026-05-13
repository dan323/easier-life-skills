# Changelog

## [1.17.1] - 2026-05-13

### Added
- **Consent banner + GA4 Consent Mode v2** — the deployed marketplace serves EEA visitors, so the `_ga` cookie set by `gtag.js` requires explicit consent under ePrivacy. `assets/src/analytics.ts` now installs the gtag snippet with all consent categories (`analytics_storage`, `ad_storage`, `ad_user_data`, `ad_personalization`) defaulting to `denied`; gtag.js loads but no `g/collect` beacons fire until the user accepts. New `assets/src/components/ConsentBanner.tsx` shows on first visit with equally-prominent Accept / Decline buttons (CNIL guidance — neither option may be visually emphasised). Choice persists in `localStorage` under `analytics_consent` and survives reloads. On Accept, the app calls `gtag('consent', 'update', { analytics_storage: 'granted' })` and explicitly fires a `page_view` event so the visit isn't lost (the auto-pageview at config time was suppressed by the default-denied consent). On Decline, the choice persists and no events ever flow on that device. New "Manage analytics consent" button in the footer lets visitors revoke / re-grant at any time. Ad-related consent categories are never granted because the site runs no ads. New `tests/consent-banner.test.ts` covers first-visit render, Accept/Decline persistence, and footer-revoke; harness gains an in-memory localStorage shim because happy-dom v20 ships a no-op localStorage when no `--localstorage-file` is configured. `docs/architecture.md` → Analytics expanded with a "Privacy and consent" subsection; README's GA mention now references the consent flow.

### Fixed
- **GA4 events never reaching the server from EEA traffic** — root cause of "everything wired, nothing in DebugView, zero `g/collect` requests in Network": GA4 defaults `analytics_storage` to `denied` in EEA when Consent Mode isn't explicitly configured, so `gtag.js` queues events to `dataLayer` but never dispatches them. Fixed by the consent flow above. After the user accepts, events flow normally.

## [1.17.0] - 2026-05-13

### Added
- **Google Analytics 4 wiring on the deployed marketplace site** (Feature 3a from `docs/plan.md`, scoped down from the original telemetry plan). `assets/src/analytics.ts` injects `gtag.js` and configures it on app boot when a `GA_ID` build-time define is set. The id flows through `esbuild --define:GA_ID="\"${GA_MEASUREMENT_ID:-}\""` in `package.json` and `.github/workflows/pages.yml`'s `GA_MEASUREMENT_ID: ${{ vars.GA_MEASUREMENT_ID }}` env. Unset = no script loaded, no events sent, so forks and local dev stay clean by default and vitest never makes a network request (the `typeof GA_ID === 'undefined'` guard short-circuits when esbuild's substitution didn't happen). Two custom events fire with high-signal-only intent: `entity_open` (any plugin/skill/agent/MCP/command/hook card opens its detail panel — params: `kind`, `name`, `source`) and `install_copy` (an install command or `marketplace add` is copied — params: `kind`, `name`, `source`, `command_type: install | marketplace_add`). Standard GA4 pageviews flow automatically; chatty events like view switches, search queries, filter toggles, and sort flips are deliberately not tracked. Wiring touches `app.tsx` (boot), `App.tsx` (`handleOpenPlugin` / `handleOpenEntity` / `copyAdd` instrumented), `CopyButton.tsx` (new optional `analyticsEvent` prop fired on click), and the five entity cards + `EntityPanel.tsx` + `PluginPanel.tsx` install/marketplace_add rows. The deferred Feature 3b (skill-execution telemetry that GA can't see) is intentionally not built — see `docs/plan.md` for the rationale. `docs/architecture.md` has a new "Analytics" section covering enable instructions, event schema, and privacy stance.

- **`workflow` plugin** — declarative YAML format for chaining skills into multi-step pipelines (Feature 2 from `docs/plan.md`). New `plugins/workflow/` plugin ships a runner skill that parses `workflow.yaml`, validates inputs and step ids, resolves `${{ inputs.<name> }}` / `${{ steps.<id>.output }}` interpolation, spawns one subagent per step via the `Agent` tool, captures output from `$WORKFLOW_OUTPUT` (or stdout as a fallback), and writes a `workflow-output.json` summary. Execution is strictly sequential — if a step exits non-zero the runner halts and marks subsequent steps as skipped. The authoritative schema lives in `plugins/workflow/references/format.md`; `plugins/workflow/examples/document-and-deploy.yaml` shows a brainstorm → document → PR pipeline. Four evals cover happy path, missing required input, failing step, and idempotent re-run. v1 deliberately defers conditionals, parallelism, retries, secrets injection, and top-level outputs; the reasons are tabulated in `docs/architecture.md` and the format reference. Workflows are **plugin-internal config**, not a separate marketplace entity — the build pipeline doesn't index them, and the runner reads any YAML path the user supplies. Promoting workflows to a first-class marketplace entity is deferred until multiple external marketplaces start authoring them (originally drafted as a top-level entity, rolled back as over-engineering for a single-source, single-author surface). Documentation: `docs/architecture.md` describes the runner + future-work list; `docs/contributing.md` has a new "Authoring a Workflow" section; `.claude/CLAUDE.md` and `README.md` list the plugin in their Current Plugins / plugins tables.

## [1.16.0] - 2026-05-13

### Added
- **`scaffold` plugin** — new productivity plugin that generates a complete plugin skeleton from a single `key=value` prompt (e.g. `scaffold name=index-audit description="Audit database indexes" category=code-quality agents=index-walker`). Writes `plugins/<name>/.claude-plugin/plugin.json`, a phase-structured `skills/<name>/SKILL.md`, an `evals/evals.json` with 3 placeholder evals, plus optional `agents/<a>.md` and `references/<t>.md` files when those args are passed. Canonical template strings live in `plugins/scaffold/references/templates.md` so the single source of truth stays out of the SKILL body and can be updated independently when the plugin layout evolves. Idempotent: refuses to overwrite an existing plugin directory unless the bare `force` flag is supplied. Includes 4 evals (happy path, scaffold-with-agent, collision-error, scaffold-with-both) and an `examples/scaffolded-output/` snapshot. `docs/contributing.md` now recommends `/scaffold` as the canonical way to start a new plugin; the README and `.claude/CLAUDE.md` plugin tables are updated.

## [1.15.0] - 2026-05-13

### Fixed
- **IDE — IntelliJ TS6142 on `.tsx` files: `--jsx is not set`** — IntelliJ walks up from `assets/src/components/Expandable.tsx` and finds the root `tsconfig.json`, which only `include`s `scripts/**/*.ts` and has no JSX settings. `tsconfig.web.json` (which has `jsx: react-jsx` + `jsxImportSource: preact`) is never auto-discovered because its filename isn't the default. Added `assets/tsconfig.json` that extends `../tsconfig.web.json` and includes `src/**/*.ts(x)` so the IDE's nearest-tsconfig walk lands on the JSX-aware config. No build-pipeline changes — `npm run typecheck` still runs `tsc --noEmit && tsc -p tsconfig.web.json`; the new file is purely for the IDE TypeScript service. Verified: 16 test files / 82 tests still pass.
- **Build index — hook events parsed as a single literal string** — `scripts/lib/frontmatter.ts` had no special case for YAML inline arrays, so hook frontmatter like `events: [Stop, SubagentStop]` was stored as the literal string `"[Stop, SubagentStop]"`. `parseHook` then took the `typeof events === 'string'` branch and wrapped it as a one-element array, so `skills_index.json` ended up with `"events": ["[Stop, SubagentStop]"]` and the hook card / entity panel rendered a single chip containing the bracketed text instead of one chip per event (matching how `tools` chips render on agents). `parseFrontmatter` now routes every scalar value through a `parseScalar()` helper that detects `[…]` and splits it into a real array (stripping optional `'`/`"` quotes around each item, dropping empties), so existing string values are unaffected. The `tools: Bare, Comma, List` post-processing still runs for legacy comma-separated values. Regenerated `skills_index.json` now contains `"events": ["Stop","SubagentStop"]` for `cost-tracker` and `["Stop"]` for `audit-logger`; the existing `HookCard` + `EntityPanel` chip-mapping renders one chip per event without further code changes.
- **Web UI — visible keyboard focus on `.card-name` and `.source-toggle` (WCAG 2.4.7 / 2.4.11)** — both interactive elements used a stretched-link `::after` overlay for click-area routing and explicitly set `outline: none` on `:focus` *and* `:focus-visible`, leaving keyboard users with no focus indicator on the marketplace's primary interactions (every card title, every marketplace chip). `:focus-visible` now paints a two-tone ring on the existing `::after` overlay — `box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--accent)` — so the focus halo traces the full card / chip body it activates rather than just the inline button text. The non-`:focus-visible` (mouse-click) state still has no outline so the ring doesn't flash on pointer activation.
- **Web UI — search form keyboard submission (WCAG 3.2.2)** — `Controls.tsx`'s `<form role="search">` had no submit control, so screen-reader users hitting Enter and users on AT that only triggers `submit`-style events couldn't fire the form, and submitting via Enter also appended a stray `?` to the URL on form action. Added a visually-hidden `<button type="submit" class="sr-only">Search</button>` inside the wrap and an explicit `onSubmit={e => e.preventDefault()}` handler on the form — filtering still happens live on input, but the form now has a real submit target and no longer rewrites the URL on Enter.
- **Web UI — card-click contract affordance** — clicking a plugin/skill/agent/MCP/command/hook card name opens an in-page detail panel, but the name rendered as a flat monospace label with no visual cue, so users expecting a deep-linkable page were surprised by the in-place panel. Each `.card-name` button now contains a `.card-name-text` span and an `aria-hidden` `.card-name-chevron` (`›`), with the chevron rendered subtly at rest (opacity 0.55) and brightening + nudging right on hover/focus. The chevron is excluded from the accessible name and the hover-underline now applies only to `.card-name-text` so the chevron doesn't get an underline. Touches all six card components (`PluginCard`, `SkillCard`, `AgentCard`, `McpCard`, `CommandCard`, `HookCard`) and the shared `.card-name` block in `assets/style.css`.
- **Web UI — badge colors missing for the newly-introduced categories** — the previous "Add categories" change split `code-quality` into `testing`/`security`/`performance` and pulled `devops` out of `automation`, but `assets/style.css` was never updated to add matching `--cat-*` colour variables or `.badge-<cat>` rules. Cards and detail panels in those four categories fell through to the bare `.badge-cat { border: none; }` rule and rendered as transparent / unstyled text, while the older categories kept their full background-and-foreground colour pairing. Added four colour variable pairs and the four corresponding `.badge-*` selectors: `testing` cyan (`#22d3ee` on `#0c2a30`), `devops` indigo (`#818cf8` on `#1a1b3a`), `security` red (`#f87171` on `#2d0e0e`), `performance` magenta (`#ec4899` on `#2e0f1f`). Each pair was picked to be visually distinct from the existing seven category colours (documentation blue, code-quality amber, productivity green, automation purple, design mauve, development grey, mixed orange). No component changes — the `badge-` + `category` class concatenation in the cards/panels already pointed at these selectors; they just didn't exist before.

### Changed
- **Category vocabulary expanded — `code-quality` split + `automation` separated from `devops`** — the previous 4-category scheme (`productivity`, `documentation`, `code-quality`, `automation`) had grown overloaded: `code-quality` was holding 29 entities (a third of the catalog) and `automation` mixed agent task-orchestration with CI/CD and container work. Split out three sub-categories from `code-quality` — `testing` (TDD, test generation, QA, test automation, webapp-testing), `security` (security audits, security scanning), `performance` (perf optimisation and auditing) — and pulled deployment/CI/Docker out of `automation` into a new `devops` category, leaving `automation` for repeat-task automation and orchestration. The two previously-uncategorised mattpocock skills are now labelled too: `handoff` → `productivity`, `prototype` → `development`. `.claude-plugin/external-overrides.json` remaps the affected external entries from `DustyWalker/claude-code-marketplace` (agents `security-auditor`, `test-suite-generator`, `performance-optimizer`, `test-automator`, `qa-engineer`, `deployment-engineer`, `cicd-automation`, `docker-specialist`; commands `test`, `security-scan`, `deploy`), from `mattpocock/skills` (`tdd`, plus new `handoff` and `prototype`), and from `anthropics/skills` (`webapp-testing` → `testing`). Local change: `plugins/site-audit/agents/performance-auditor.md` now sets `category: performance` in YAML frontmatter to override the parent plugin's `code-quality`; the other four site-audit agents stay on `code-quality`. `mixed` is now reserved for plugin bundles with no single goal — production-agents-suite (explicit) and mattpocock-skills (auto-assigned because its skills span multiple categories). `.claude/CLAUDE.md` and `docs/contributing.md` updated to describe the new vocabulary and to note that the field is free-form (no enum validation in the build pipeline). After rebuild the 88 entities now distribute as: code-quality 20, productivity 20, documentation 11, development 10, automation 6, testing 6, design 5, devops 4, performance 2, security 2, mixed 2 — zero uncategorised.

### Added
- **Catalog — `Tools` column on skill rows** — closes a long-standing asymmetry between agent and skill rendering: agent rows in `CATALOG.md` / `catalog.html` already had a `Tools` column, skill rows didn't. Both row types now use a shared `summariseTools()` helper (first 3 tools, then `…` for any extras), so the visual treatment is identical. External skills whose `SKILL.md` frontmatter omits a `tools:` declaration render an empty cell — there's no parser bug, the field is genuinely absent upstream. `scripts/lib/catalog.ts` (`skillRow`, `skillRowHtml`, the markdown header, the HTML headers list) updated.
- **Test harness — `cardByName` / `cardLabel` helpers** — the recent `.card-name-chevron` change made every card's `textContent` end with a `›`, breaking five tests that compared `b.textContent === name`. `tests/harness.ts` now exports `cardLabel(btn)` (reads `.card-name-text`, falling back to `textContent`) and `cardByName(gridId, name)`. The duplicated local `cardByName` helpers in `entity-panel.test.ts`, `panel-card-install.test.ts`, `panel-interactivity.test.ts`, and `plugin-panel.test.ts` were removed in favour of the shared one; `copy-buttons.test.ts` was updated to read `.card-name .card-name-text`.
- **Categories for agents, hooks, commands, and MCP servers** — these four sub-entity types now carry a `category` field alongside skills and plugins. Resolution order: `external-overrides.json` (per repo + entity type + name) → YAML frontmatter `category:` field (agents/hooks/commands only — MCP has no YAML) → inherited from the parent plugin's `plugin.json`. The web UI's filter bar is now visible in the Agents/MCP Servers/Commands/Hooks views (hidden only on Bundles), and each card renders a dynamic category badge (or "Uncategorized") in place of the previous hardcoded type label. `CATALOG.md` / `catalog.html` group agents/MCP servers/commands/hooks by category, mirroring the existing skills layout. `.claude-plugin/external-overrides.json` accepts new optional keys per repo: `agents`, `hooks`, `commands`, `mcpServers` (same shape as `skills` / `plugins`). `scripts/lib/types.ts`, `scripts/lib/fetch-marketplace.ts`, `scripts/build-index.ts`, `scripts/lib/catalog.ts`, `assets/src/types.ts`, `assets/src/components/{App,Controls,Grid}.tsx`, and the four cards in `assets/src/components/cards/` are updated end-to-end. Filter regression tests cover the new agents/MCP/commands/hooks filtering paths; the view-toggle test now asserts the filter bar is visible in every entity view and hidden only on Bundles.

## [1.14.0] - 2026-05-12

### Added
- **Web UI — in-site Full catalog page** — the build now emits `catalog.html` alongside `CATALOG.md`. The new page is a styled, self-contained rendering of the catalog (same skills/agents/MCP/hooks/bundles data) that picks up theme variables from `assets/style.css`, so it matches the marketplace UI on GitHub Pages. The footer's `Full catalog` link now points at `./catalog.html` (same tab) instead of the GitHub blob view, keeping users in-site. `scripts/lib/catalog.ts` exposes a new `generateCatalogHtml()` alongside `generateCatalog()`; `scripts/build-index.ts` writes both files. `catalog.html` is gitignored — rebuilt on every CI run and uploaded by `actions/upload-pages-artifact`.
- **`tests/footer.test.ts`** — regression test asserting the Full catalog link points to `./catalog.html` and opens in the same tab.
- **Web UI — skeleton placeholders while data loads** — until `skills_index.json` resolves, the grid renders 6 `.skeleton-card` placeholders with the same dimensions as a real `.skill-card` (rounded border, surface background, `min-height: 170px`, gentle opacity pulse). `App.tsx` tracks a `loaded` boolean set true after `loadMarketplace()` resolves (success or error); `Grid.tsx` routes `!loaded` through `<SkeletonGrid>` which reserves the per-view grid container by id so the layout never reflows when real cards arrive. The pulse is disabled under `prefers-reduced-motion: reduce`. Resolves the WCAG-adjacent UX issue of a blank `#root` during JS hydration and the Lighthouse `CLS` regression (was 0.149, now 0). Lighthouse performance score on the dev server went from 93 → 99.
- **Web UI — UX polish (Phase 5 of the site audit fixes)** — three small upgrades that close low-severity UX findings: (a) `Controls.tsx` now wraps the search input in a `.search-wrap` with a visible `<kbd>/</kbd>` shortcut chip, anchored to the right edge of the input and hidden by CSS once the input is focused or has content, so the keyboard hint stays discoverable instead of disappearing the moment a user types. The placeholder is shortened to plain `Search skills…`. (b) The sort button now leads with a `⇅` icon span before the label, so sighted users see at a glance that it is a toggle; `aria-label` continues to describe current and next state. (c) `Grid.tsx` now distinguishes "this view has zero items in the dataset" from "your search filtered them all out" — the former renders an extra `.empty-hint` line that names other populated views to switch to ("Try the Plugins, Skills, Agents views instead"), the latter keeps the existing "match your search" copy. New `tests/empty-state.test.ts` boots with a custom fixture that strips commands+hooks and asserts both branches.
- **Web UI — CLS on narrow viewports** — adding more marketplaces (catalog now aggregates 6 source repos) made the marketplace-bar grow from one row on initial render to several rows once data resolves, pushing `<main>` down and reintroducing layout shift. Fixed by (a) reserving 80px base / 240px mobile `min-height` on `.marketplace-bar` so the wrap doesn't push content, (b) reserving 112px base on `.controls` for the category-filter row that materialises after data loads, and (c) replacing `flex: 1; max-width: 340px` with `flex: 0 1 340px` on `.search-wrap` so the search width is stable rather than stretching when sibling filter buttons appear. Lighthouse: Desktop **100/100** (CLS 0.041), Mobile **99/100** (CLS 0.044), both under the 0.1 "good" threshold.
- **Web UI — production bundle minified (Phase 6 of the site audit fixes)** — `npm run build` now passes `--minify` to esbuild, cutting `assets/bundle.js` from ~73 KB to ~44 KB (~40% smaller) without affecting `npm run dev` (still unminified for source-mapped DX). `index.html` adds `<link rel="modulepreload" href="assets/bundle.js" />` so the browser starts fetching the bundle alongside the HTML parse instead of waiting for the `<script type="module">` tag.

### Fixed
- **Build index — skill descriptions overridden by plugin description** — `scripts/lib/fetch-marketplace.ts`'s `parseSkill` resolved `description` as `pluginEntry.description ?? frontmatter.description ?? ''`, so every skill in `skills_index.json` (and downstream `CATALOG.md` / `catalog.html` / the web UI) showed the parent plugin's one-line description instead of the richer description authored in the SKILL.md frontmatter (e.g. `find-dead-code` lost its DI-framework caveat and trigger phrases). Flipped the fallback to `frontmatter.description ?? pluginEntry.description ?? ''`, matching how agents/commands/hooks/MCP servers already resolve their own description first. Agents, commands, hooks, and MCP servers were unaffected; only skills used the wrong field.
- **CI — GitHub Pages deployment unblocked** — every push since the Preact rewrite (1.13.0) failed at `npm ci` with `Missing: @emnapi/core@1.10.0 from lock file` / `Missing: @emnapi/runtime@1.10.0 from lock file`. The lockfile generated for that commit referenced `@rolldown/binding-wasm32-wasi`'s pinned `@emnapi/core@1.10.0` and `@emnapi/runtime@1.10.0` dependencies without including matching `node_modules/@emnapi/core` and `node_modules/@emnapi/runtime` entries — a structural inconsistency that the runner's `npm ci` strict integrity check rejects. Regenerated `package-lock.json` from scratch (`rm -rf node_modules package-lock.json && npm install`); the missing `@emnapi/*` entries are now present and a few `estree-walker` nestings were deduplicated under `@vitest/mocker`. No runtime/devDependency version changes; `npm ci --dry-run`, `npm run build`, `npm run typecheck`, and the 77-test vitest suite all pass locally.
- **Web UI — accessibility: nested-interactive controls on cards (WCAG 4.1.2)** — every plugin/skill/agent/MCP/command/hook card was rendered as `role="button"` *plus* contained focusable children (a title link to GitHub and a Copy button), which axe flagged as nested-interactive (≈15 violations on the homepage). Cards now use a single keyboard target: the title is a real `<button class="card-name">` that opens the detail panel; the wrapping `<div class="skill-card">` is non-interactive (no `role`, `tabindex`, or click handler). A CSS "stretched link" overlay (`.card-name::after { position: absolute; inset: 0; }` over `.skill-card { position: relative; }`) keeps clicks on the whole card area routed to the title button, while `.card-install` and `.plugin-chips` / `.card-chips` are lifted with `z-index: 1` so the Copy button and the `+N more` expand button stay independently clickable. Focus moves to `:focus-within` on the card so the entire tile shows the focus ring when the title is focused. The "View on GitHub" affordance previously on the card title is still reachable from the open panel (`panel-name` link / `Source` section).
- **Web UI — accessibility: nested-interactive controls on the marketplace source tag (WCAG 4.1.2)** — each chip in the marketplace bar was a `<div role="button" tabindex="0">` containing a real `<button class="source-add-copy">`, flagging 3 nested-interactive violations. Chips now follow the same pattern as plugin cards: the wrapper `<div class="source-tag">` is non-interactive, the filter toggle is a real `<button class="source-toggle" aria-pressed>` holding the label, and the `+` copy button is a sibling. A stretched-link overlay (`.source-toggle::after`) keeps clicks on the chip body activating the filter while the copy button (`z-index: 1`) remains independently clickable. Removes the previous `e.target.closest('.source-add-copy')` guard that mixed the two click handlers.
- **Web UI — accessibility: page content not contained by landmarks (WCAG 1.3.1)** — 10 region violations (QuickStart heading + steps, Controls view-toggle, Marketplace "Add your marketplace" CTA) sat outside any landmark region, so assistive-tech landmark navigation couldn't reach them. `QuickStart.tsx` now declares its `<section class="quickstart" aria-labelledby="quickstart-heading">` with a matching `<h2 id="quickstart-heading">` (a `<section>` only becomes a landmark when accessibly named). `Controls.tsx` swaps `<div class="controls">` for `<section class="controls" aria-label="Filters and view">`. `MarketplaceBar.tsx` swaps `<div class="marketplace-bar">` for `<nav class="marketplace-bar" aria-label="Marketplaces">`. `<main>`, `<header>`, and `<footer>` were already in place. Element-name swaps only — visible HTML, IDs, and CSS classes preserved.
- **Web UI — UX consistency: card titles** — title-as-link on some cards and title-as-span on others (built-in vs external marketplaces) made the click behaviour ambiguous; clicking the title now uniformly opens the detail panel regardless of source.
- **Web UI — accessibility: sort button label-content-name-mismatch (WCAG 2.5.3)** — the sort button's `aria-label` was `Currently sorted A to Z. Click to sort Z to A.`, which omitted the visible label `Sort: A→Z`. Screen reader users heard a different name than sighted users saw, so Lighthouse flagged the button under axe `label-content-name-mismatch` (Lighthouse a11y score 99 → 100). The aria-label now leads with the visible text — `Sort: A→Z. Click to sort Z to A.` — so the accessible name contains the visible label verbatim. Added a `tests/sort.test.ts` assertion that the aria-label starts with the visible `.sort-label` text in both sort directions. Touch-target audit was already passing (the mobile media query enforces 44×44 px on `.filter-btn`, `.sort-btn`, `.view-btn`, `.copy-btn`, `.expand-btn`, `.bundle-copy-btn`, and the panel close + copy buttons).

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

[Unreleased]: https://github.com/dan323/easier-life-skills/compare/v1.17.1...HEAD
[1.17.1]: https://github.com/dan323/easier-life-skills/compare/v1.17.0...v1.17.1
[1.17.0]: https://github.com/dan323/easier-life-skills/compare/v1.16.0...v1.17.0
[1.5.0]: https://github.com/dan323/skill-easy-life/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/dan323/skill-easy-life/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/dan323/skill-easy-life/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/dan323/skill-easy-life/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/dan323/skill-easy-life/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/dan323/skill-easy-life/compare/v0.1.0...v1.0.0
