# ADR 0003 — Web UI in Preact with no global store

- **Status**: Accepted
- **Date**: 2026-05-11
- **Anchor commit**: `e243d76` (web UI rewrite)
- **Scope**: `assets/src/`, `index.html`, `tests/`

## Context

The marketplace browser at the repo root (`index.html` + `assets/`) was
originally built as a set of imperative DOM modules: hand-written
`document.querySelector` traversal, event-listener wiring, and a
loose singleton state object module-side. It worked but had three
problems:

- **No regression coverage.** Behaviour changes were verified by hand
  against a single fixture, so things like the URL `#hash` state
  syncing, the `/` keyboard shortcut, and Escape-to-close on panels
  silently regressed across refactors.
- **State threading was implicit.** Components reached into the global
  state object directly. Refactors that touched the state shape
  rippled in ways the type system couldn't catch.
- **Re-render correctness was manual.** Every component decided for
  itself when to refresh the DOM. Selective re-render was easy to get
  wrong (and was, repeatedly).

The page is also intentionally cheap to host: a static asset on GitHub
Pages, no backend, no API key required to render. So whatever
framework we pick has to bundle small and have no runtime
infrastructure.

Options:

1. **Stay imperative, add a state library** (e.g., a hand-rolled
   pub/sub or Zustand). Solves state threading but doesn't address the
   re-render correctness or testability problems.
2. **React** with hooks. Solves all three but ships ~45 kB minified
   and is overkill for what is, ultimately, a filterable card grid.
3. **Preact** with hooks. Same component model as React, ~10 kB
   minified, drop-in for `useState` / `useLayoutEffect`.

For *state management* within whichever framework, the question is
the same: a global store (Redux/Zustand/MobX/context-with-reducers)
or hooks at the top.

## Decision

**Use Preact with hooks (`useState`, `useLayoutEffect`) owned by the
top-level `<App>` component. No global state singleton; no Redux /
Zustand / MobX / React Context.** Components communicate only through
props and callbacks.

Specifically:

- `assets/src/app.tsx` renders `<App>` into `#root`. `index.html` is a
  16-line shell; all visible markup lives in components under
  `assets/src/components/`.
- esbuild compiles with `--jsx=automatic --jsx-import-source=preact`.
- `marketplace.ts` is a *pure data loader* — returns parsed index
  plus source counts and stops. It doesn't own state.
- `url-state.ts` exposes pure `readUrlState` / `writeUrlState`
  functions — the hash is the source of truth, not a module-level
  object.
- `useLayoutEffect` (not `useEffect`) for URL sync, the `/` shortcut,
  and panel Escape handlers, so the behaviour is observable
  synchronously after each event — which is what makes the
  regression tests deterministic.

The visible markup, CSS classes, and DOM IDs are unchanged from the
imperative version. `assets/style.css` carries over without edits.

## Consequences

- Tests can drive the page via user-visible DOM (Vitest + happy-dom).
  The `tests/` suite boots the real bundle against
  `tests/fixtures/skills_index.json` and asserts on rendered output;
  no internal-state mocking. 93+ tests today.
- `useLayoutEffect` is the load-bearing pick — using `useEffect`
  would make the regression tests flaky because event-driven side
  effects would run asynchronously. The tests document this implicit
  contract.
- The "no global store" rule extends to the panel state. When two
  components need the same data, the data lifts to `<App>` and flows
  down as props rather than being injected via context. This grows the
  prop list on `<App>`, accepted as the cost of explicit data flow.
- Bundle size stays small: ~52 kB minified for the whole app
  (Preact + components + analytics + consent banner). Suitable for a
  static GitHub Pages page.
- If a future feature genuinely needs cross-cutting state (multiple
  panels, modal stacks, etc.), revisit this ADR — supersede it with
  ADR-NNNN rather than smuggling in Context.

## Notes

The rewrite caught one regression introduced by itself: the original
imperative code applied `inert` to every non-panel body child to trap
focus. Post-rewrite the panels live inside `#root`, so `inert` landed
on `#root` itself, freezing the close button and overlay. Removed in
the same commit. `tests/panel-interactivity.test.ts` asserts that no
ancestor of an open panel carries `inert` or `aria-hidden="true"`
(happy-dom silently ignores `inert`, so attribute-level checking is
the only way to regression-test it).

The IDE-facing `assets/tsconfig.json` extends `../tsconfig.web.json`
purely so IntelliJ walking up from `assets/src/**.tsx` finds the JSX
settings without inspecting the non-default-named root config. The
CLI typecheck uses `../tsconfig.web.json` directly.
