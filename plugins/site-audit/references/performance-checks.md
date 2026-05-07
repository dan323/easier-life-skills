# Performance Checks

## Lighthouse metric thresholds

| Metric | Good | Needs work → severity |
|--------|------|----------------------|
| Performance score | ≥ 90 | 75–89 → medium, 50–74 → high, < 50 → critical |
| LCP (Largest Contentful Paint) | < 2.5 s | 2.5–4 s → high, > 4 s → critical |
| FCP (First Contentful Paint) | < 1.8 s | 1.8–3 s → high, > 3 s → critical |
| CLS (Cumulative Layout Shift) | < 0.1 | 0.1–0.25 → medium, > 0.25 → high |
| TBT (Total Blocking Time) | < 200 ms | 200–600 ms → medium, > 600 ms → high |
| Speed Index | < 3.4 s | 3.4–5.8 s → medium, > 5.8 s → high |
| TTI (Time to Interactive) | < 3.8 s | 3.8–7.3 s → medium, > 7.3 s → high |

Extract failing audits: any `score < 0.5` where `scoreDisplayMode` is not
`"notApplicable"` or `"informative"`.

## Manual HTML checks (fallback when Lighthouse unavailable)

### Render-blocking resources
- `<script src="...">` in `<head>` without `defer` or `async` → each blocks rendering
  - 1–2 → low; 3–5 → medium; > 5 → high
- `<link rel="stylesheet">` without a `media` query narrowing its scope
  - > 4 → medium; > 8 → high

### Image issues (layout shift + load time)
- `<img>` without explicit `width` and `height` attributes → CLS risk → medium per 3+, high per 6+
- `<img>` without `loading="lazy"` on images clearly below the first screen of content → medium
- `<img src="*.png">` for photographic content (JPEG or WebP would be much smaller) → low
- Hero/LCP `<img>` without a `<link rel="preload" as="image">` in `<head>` → high

### Resource count
- More than 15 `<script src>` tags total → high (excessive JS)
- More than 8 `<link rel="stylesheet">` tags total → medium

### Inline bloat
- `<style>` block > 5 000 characters → medium (consider extracting to a file for caching)
- `<script>` block > 10 000 characters inline → medium

### Fonts
- Web font `<link>` without `rel="preload"` for the primary typeface → medium
- `@font-face` without `font-display: swap` (causes invisible text during load) → medium

### Viewport
- Missing `<meta name="viewport">` → critical (mobile pages render at desktop scale)

## Severity guide
- **critical** — page is effectively broken or unusable on typical connections
- **high** — significant degradation for most users
- **medium** — noticeable but not blocking
- **low** — minor optimization opportunity
