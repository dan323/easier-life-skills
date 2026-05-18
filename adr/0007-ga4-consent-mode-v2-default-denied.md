# ADR 0007 — GA4 with Consent Mode v2, default-denied

- **Status**: Accepted
- **Date**: 2026-05-13
- **Anchor commit**: `de594a6` (v1.17.1)
- **Scope**: `assets/src/analytics.ts`, `assets/src/components/ConsentBanner.tsx`, `assets/src/components/Footer.tsx`

## Context

The marketplace browser uses GA4 for usage analytics. The original
integration (v1.17.0, `a2a1e24`) wired `gtag.js` with default
consent settings — meaning Google's *default* behaviour applies.

The default behaviour for visitors from the EEA, when Consent Mode
isn't configured, is to set `analytics_storage` to **denied** at the
client level. `gtag` then queues events into `dataLayer` but never
dispatches them to GA. Result: every EEA page view produced zero
GA4 events. The dashboard looked broken for our entire EU audience.

Three ways to fix it:

1. **Default-allow with a cookie banner.** Set `analytics_storage:
   granted` upfront, show a banner that revokes consent if the user
   declines. This collects data first, asks permission second — not
   compliant with GDPR / CNIL guidance that requires consent
   *before* tracking.
2. **Block GA entirely until user opts in.** Don't load `gtag.js`
   at all unless the user clicks Accept. Simplest model, but loses
   the official "consent denied" signal — GA4 won't even count the
   visit, so we can't measure consent rates or reach.
3. **Consent Mode v2, default-denied.** Load `gtag.js`, configure
   Consent Mode v2 with all categories defaulting to `denied`, then
   call `gtag('consent', 'update', …)` if/when the user clicks
   Accept. GA4 receives consent signals but no event data until
   consent is granted. Compliant with EEA rules; gives Google the
   "denied" signal so its modelling can still produce aggregate
   estimates.

## Decision

**Adopt Consent Mode v2 with all categories defaulting to denied.**

- `analytics.ts` installs `gtag` and calls
  `gtag('consent', 'default', { analytics_storage: 'denied', ... })`
  before any events fire.
- Ad-related categories (`ad_storage`, `ad_user_data`,
  `ad_personalization`) are **never granted** under any circumstance
  — the site has no ads, so there's no legitimate use case.
- `ConsentBanner.tsx` appears on first visit. Accept and Decline
  buttons are equally prominent (CNIL guidance — "Decline" must not
  be visually deprioritised). The choice persists in `localStorage`
  under a stable key.
- A "Manage analytics consent" button in `Footer.tsx` revokes or
  re-asks consent on demand.
- On Accept, `analytics.ts` explicitly fires a `page_view` because
  GA4's auto-pageview was suppressed by the default-denied consent
  — without this, the first granted page view never reaches GA.

The whole analytics layer is gated on the `GA_MEASUREMENT_ID` build-time
define (`G-XXXXXXXXXX`). If the deploy doesn't set it,
`analytics.ts` is a no-op: no script loaded, no banner shown, no
events queued. Forks of this repo without GA configured get a
zero-analytics site by default.

## Consequences

- EEA page views now register as events on the GA4 side, with
  consent denied — so reach/modelled estimates work and the
  dashboard reflects actual traffic.
- The consent banner is the first thing EEA visitors see. We accept
  the UX cost as the price of CNIL-compliant defaults.
- Users who decline get zero tracking — `gtag` is loaded but every
  event is queued and never dispatched, exactly the same as an
  uninstalled tracker. We don't fall back to "anonymous" tracking
  or any cookie-less variant.
- The "Manage analytics consent" footer button is the legally
  required revocation path. Removing or hiding it would break
  compliance.
- Tests for the analytics layer need a working `localStorage` —
  happy-dom v20 silently no-ops `setItem` without a configured
  `--localstorage-file`. The test harness ships an in-memory shim
  for this; ADR-0003's tests depend on it indirectly.

## Notes

This ADR documents the *user-facing* consent model. The implementation
detail of explicitly firing `page_view` on Accept (because GA4's
auto-pageview was suppressed at default-denied time) is load-bearing —
removing that call regresses the entire first-session conversion
funnel.

Forks that deploy under a different brand should set their own
`GA_MEASUREMENT_ID` if they want analytics, or leave it unset for
a zero-tracking deploy. The consent banner is gated on the same
build-time define — no GA, no banner.
