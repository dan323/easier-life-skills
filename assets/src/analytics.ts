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
const DEBUG_KEY   = 'ga_debug';

function measurementId(): string {
  return typeof GA_ID === 'undefined' ? '' : GA_ID;
}

/**
 * Diagnostic logging for the analytics pipeline. Off unless the visitor
 * opts in by setting `localStorage.ga_debug = '1'` or appending
 * `?ga_debug=1` to the URL (which we persist into localStorage so it
 * survives reloads until the visitor clears it).
 *
 * Intended for one-shot troubleshooting on the deployed site when no
 * requests appear in the Network tab — see CHANGELOG entry for the
 * usage recipe.
 */
function debugEnabled(): boolean {
  try {
    if (typeof window !== 'undefined' && window.location?.search.includes('ga_debug=1')) {
      localStorage.setItem(DEBUG_KEY, '1');
      return true;
    }
    return localStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

function debug(...args: unknown[]): void {
  if (debugEnabled()) console.info('[ga-debug]', ...args);
}

// google-analytics.com covers /g/collect beacons (`region1.…` and `www.…`);
// googletagmanager.com covers the gtag.js loader. We deliberately omit
// `stats.g.doubleclick.net` because we never grant ad-storage consent and
// gtag.js shouldn't be hitting it anyway.
const GA_HOSTS = /(?:google-analytics\.com|analytics\.google\.com|googletagmanager\.com)/;

let interceptorsInstalled = false;

/**
 * Wrap `navigator.sendBeacon`, `window.fetch`, and `XMLHttpRequest.send`
 * so that any request to a GA-related host is logged with its outcome.
 *
 * Installed once at boot, only when `debugEnabled()` is true — so prod
 * pays nothing. Mid-session enabling requires a reload (matches the
 * existing pattern: the URL-param flag persists to localStorage on the
 * first matching page load).
 *
 * This is what proves whether gtag.js actually puts beacons on the wire.
 * The script-tag `load`/`error` events only tell us whether the loader
 * itself downloaded; the loader can succeed and still produce zero
 * collect beacons (e.g. consent state misread, or an in-page network
 * shim from an extension swallowing the request after gtag's API call).
 */
function installNetworkInterceptors(): void {
  if (interceptorsInstalled || typeof window === 'undefined') return;
  interceptorsInstalled = true;

  // sendBeacon — GA4's primary transport. Returns boolean (true = queued).
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const orig = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => {
      const u = url.toString();
      const isGa = GA_HOSTS.test(u);
      if (isGa) debug('sendBeacon →', { url: u, data });
      const queued = orig(url, data);
      if (isGa) debug('sendBeacon result', { url: u, queued });
      return queued;
    };
  }

  // fetch — used by gtag.js when sendBeacon is unavailable or returns false.
  if (typeof window.fetch === 'function') {
    const orig = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const u = input instanceof Request ? input.url : input.toString();
      const isGa = GA_HOSTS.test(u);
      if (isGa) debug('fetch →', { url: u, method: init?.method ?? 'GET' });
      const p = orig(input, init);
      if (isGa) {
        p.then((r) => debug('fetch result', { url: u, status: r.status, ok: r.ok }))
         .catch((e: unknown) => debug('fetch failed', { url: u, error: String(e) }));
      }
      return p;
    };
  }

  // XMLHttpRequest — legacy fallback transport. We tag the instance on
  // `open` so `send` knows whether to log this particular request.
  type TaggedXhr = XMLHttpRequest & { __gaDebugUrl?: string };
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (
    this: TaggedXhr,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ): void {
    const u = url.toString();
    if (GA_HOSTS.test(u)) {
      this.__gaDebugUrl = u;
      debug('xhr.open →', { method, url: u });
    }
    return origOpen.apply(this, [method, url, ...rest] as Parameters<typeof origOpen>);
  };
  XMLHttpRequest.prototype.send = function (
    this: TaggedXhr,
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const url = this.__gaDebugUrl;
    if (url) {
      debug('xhr.send →', { url, hasBody: body != null });
      this.addEventListener('load',  () => debug('xhr result', { url, status: this.status }));
      this.addEventListener('error', () => debug('xhr error',  { url }));
    }
    return origSend.call(this, body ?? null);
  };

  debug('network interceptors installed — gtag beacons will be logged');
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

  debug('setStoredConsent', { state, gtagPresent: !!window.gtag });
  if (window.gtag && state !== null) {
    window.gtag('consent', 'update', {
      analytics_storage: state,
    });
    if (state === 'granted') {
      // gtag's auto page_view fired at config time was suppressed by the
      // default-denied consent. Re-fire it now that consent is granted so
      // the visit is counted.
      window.gtag('event', 'page_view');
      debug('fired page_view after consent grant');
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
  if (initialised) { debug('initAnalytics skipped: already initialised'); return; }
  initialised = true;

  // Must install BEFORE the gtag.js script tag is appended, so gtag's
  // very first beacons (the consent ping fired during `config`) are
  // observable. No-op when ga_debug isn't set.
  if (debugEnabled()) installNetworkInterceptors();

  const id = measurementId();
  debug('initAnalytics start', { id, idType: typeof GA_ID });
  if (!id || !id.startsWith('G-')) {
    debug('initAnalytics aborted: measurement id missing or malformed', { id });
    return;
  }

  const script = document.createElement('script');
  script.async = true;
  script.src   = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  script.addEventListener('load',  () => debug('gtag.js script load'));
  script.addEventListener('error', (e) => debug('gtag.js script error — likely blocked by extension/CSP', e));
  document.head.appendChild(script);
  debug('gtag.js script tag appended', { src: script.src });

  window.dataLayer = window.dataLayer || [];
  const gtag: Gtag = function (...args: GtagArgs) {
    window.dataLayer!.push(args);
    debug('dataLayer.push', args);
  };
  window.gtag = gtag;

  const stored = getStoredConsent();
  debug('stored consent at init', stored);
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
  debug('track', { event, params, gtagPresent: !!window.gtag });
  window.gtag?.('event', event, params);
}
