// Substituted at build time by esbuild's --define flag. Empty string when the
// GA_MEASUREMENT_ID env var is unset (local dev, forks, vitest). The typeof
// guard below keeps the module safe in environments where the substitution
// never happens (vitest doesn't run esbuild, so GA_ID stays undefined there).
declare const GA_ID: string;

export type ConsentState = 'granted' | 'denied' | null;

type ConsentValue = 'granted' | 'denied';

type GtagArgs =
  | ['event',   string, Record<string, unknown>?]
  | ['config',  string, Record<string, unknown>?]
  | ['js',      Date]
  | ['consent', 'default' | 'update', Record<string, ConsentValue>];

interface Gtag { (...args: GtagArgs): void }

declare global {
  interface Window {
    gtag?:      Gtag;
    dataLayer?: unknown[];
  }
}

const CONSENT_KEY = 'analytics_consent';

function measurementId(): string {
  return typeof GA_ID === 'undefined' ? '' : GA_ID;
}

export function getStoredConsent(): ConsentState {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Persist the user's analytics choice and push it to gtag.js if loaded.
 * Pass `null` to clear the choice (so the banner re-asks on next render).
 */
export function setStoredConsent(state: ConsentState): void {
  try {
    if (state === null) localStorage.removeItem(CONSENT_KEY);
    else localStorage.setItem(CONSENT_KEY, state);
  } catch { /* private mode / disabled storage */ }

  if (window.gtag && state !== null) {
    window.gtag('consent', 'update', {
      analytics_storage: state,
    });
    if (state === 'granted') {
      // gtag's auto page_view fired at config time was suppressed by the
      // default-denied consent. Re-fire it now that consent is granted so
      // the visit is counted.
      window.gtag('event', 'page_view');
    }
  }
}

let initialised = false;

/**
 * Inject gtag.js once on app boot. No-op when the measurement id is unset
 * (the typical local-dev / fork case) or doesn't look like a GA4 id, so
 * forks and vitest never make a network request.
 *
 * Consent Mode v2 defaults to all categories denied — gtag.js will load
 * but no beacons fire until the user accepts via the consent banner.
 * A previously-stored 'granted' choice from a prior visit is respected.
 */
export function initAnalytics(): void {
  if (initialised) return;
  initialised = true;

  const id = measurementId();
  if (!id || !id.startsWith('G-')) return;

  const script = document.createElement('script');
  script.async = true;
  script.src   = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  const gtag: Gtag = function (...args: GtagArgs) {
    window.dataLayer!.push(args);
  };
  window.gtag = gtag;

  const stored = getStoredConsent();
  gtag('consent', 'default', {
    analytics_storage:  stored === 'granted' ? 'granted' : 'denied',
    ad_storage:         'denied',
    ad_user_data:       'denied',
    ad_personalization: 'denied',
  });
  gtag('js', new Date());
  gtag('config', id);
}

/**
 * Fire a custom GA4 event. Safe to call when gtag is not loaded — the
 * call is a no-op (so vitest and forks don't accidentally send events).
 * Events are also dropped by gtag.js when analytics_storage consent is
 * denied, which is the default until the user accepts the banner.
 */
export function track(event: string, params?: Record<string, unknown>): void {
  window.gtag?.('event', event, params);
}
