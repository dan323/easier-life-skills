/**
 * Return `value` when it is an absolute http(s) URL, otherwise null.
 *
 * Plugin metadata (e.g. `homepage`) comes from third-party marketplace.json files and is rendered
 * as an `href`; schemes such as `javascript:` or `data:` must never reach the page.
 */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  try {
    const u = new URL(trimmed);
    return u.protocol === 'https:' || u.protocol === 'http:' ? trimmed : null;
  } catch {
    return null;
  }
}
