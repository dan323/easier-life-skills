// Substituted at build time by esbuild's --define flag. Empty string when the
// GA_MEASUREMENT_ID env var is unset (local dev, forks, vitest). The typeof
// guard below keeps the module safe in environments where the substitution
// never happens (vitest doesn't run esbuild, so GA_ID stays undefined there).
declare const GA_ID: string;

type GtagArgs =
  | ['event',  string, Record<string, unknown>?]
  | ['config', string, Record<string, unknown>?]
  | ['js',     Date];

interface Gtag { (...args: GtagArgs): void }

declare global {
  interface Window {
    gtag?:      Gtag;
    dataLayer?: unknown[];
  }
}

function measurementId(): string {
  return typeof GA_ID === 'undefined' ? '' : GA_ID;
}

let initialised = false;

/**
 * Inject gtag.js once on app boot. No-op when the measurement id is unset
 * (the typical local-dev / fork case) or doesn't look like a GA4 id, so
 * forks and vitest never make a network request.
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
  gtag('js', new Date());
  gtag('config', id);
}

/**
 * Fire a custom GA4 event. Safe to call when gtag is not loaded — the
 * call is a no-op (so vitest and forks don't accidentally send events).
 */
export function track(event: string, params?: Record<string, unknown>): void {
  window.gtag?.('event', event, params);
}
