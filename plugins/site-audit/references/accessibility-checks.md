# Accessibility Manual Checks (WCAG 2.1)

When CLI tools are unavailable, check these manually from fetched HTML.

## 1.1.1 Non-text content
- `<img>` missing `alt` attribute → critical
- `<img>` with `alt=""` on an image that conveys information → high
- `<input type="image">` missing `alt` → high
- `<svg>` used as meaningful content without `aria-label` or inner `<title>` → high
- `<canvas>` without fallback text or `aria-label` → medium

## 1.3.1 Info and relationships
- `<input>` without a linked `<label>` (matched by `for`/`id`) and no `aria-label` or `aria-labelledby` → critical
- `<select>` or `<textarea>` without a label → high
- `<table>` without `<th>` header cells → high
- Visual structure implied only by CSS (e.g., bold `<span>` used as a section heading) → medium
- `<fieldset>` without `<legend>` when grouping radio/checkbox inputs → medium

## 1.3.5 Identify input purpose (WCAG 2.1 AA)
- Common inputs (name, email, phone, address, username, password, credit card) missing `autocomplete` → low

## 1.4.3 Contrast (heuristic — no color tool)
- Inline `style="color:#aaa"` or `color:#bbb` on white/near-white backgrounds → high
- Gray text on gray background (`color:#999; background:#eee` or similar) → high
- Very light link color in body text → medium

## 2.1.1 Keyboard
- `tabindex="-1"` on a button, link, or input that has no alternative keyboard path → critical
- `onclick` handler on a `<div>` or `<span>` without `role="button"` and `tabindex="0"` → high
- `outline: none` or `outline: 0` in inline styles without a visible replacement focus style → high

## 2.4.1 Bypass blocks
- No "Skip to content" or "Skip navigation" link as the first focusable element in `<body>` → high

## 2.4.2 Page titled
- Missing `<title>` or empty `<title>` → high
- `<title>` that is identical across all pages (e.g., just the site name) → medium

## 3.1.1 Language of page
- `<html>` without a `lang` attribute → high
- `lang` present but clearly wrong (e.g., `lang="en"` on a page with non-English content) → medium

## 4.1.1 Parsing
- Multiple elements sharing the same `id` value (check for `id="..."` repeated) → medium

## 4.1.2 Name, role, value
- `aria-hidden="true"` on a focusable element (`<a>`, `<button>`, `<input>`) → critical
- `<a>` with no visible text and no `aria-label` or `title` (icon-only links) → high
- `<button>` with no visible text and no `aria-label` → high
- Missing `role` on custom interactive widgets (dropdown menus built with `<div>`) → medium

## Media (1.2.x)
- `<video>` without `<track kind="captions">` and no `controls` attribute → high
- `<audio>` with `autoplay` and no `muted` → medium (also a bug — blocked by browsers)

## Severity mapping from CLI tools
axe-cli: critical → critical, serious → high, moderate → medium, minor → low
pa11y: error → high, warning → medium, notice → low
