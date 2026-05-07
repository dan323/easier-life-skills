# UX Review Checklist

Evaluate every fetched page against these heuristics. Focus especially on
"Unexpected behavior" — things that work as designed but would surprise a real user.

## Navigation
- Main navigation visible and consistent across pages
- Active page/section clearly indicated (not just by URL)
- Breadcrumbs or back path present when depth warrants it
- No dead-end pages (pages with no route forward or back)
- Logo/home link present and working

## Forms
- Inputs have visible labels — placeholder-only is not a label (disappears on focus)
- Required fields explicitly marked (asterisk alone is insufficient without a legend)
- Error messages are specific and actionable, not generic ("Something went wrong")
- Feedback shown on submission: loading state while waiting, then success or error
- Password fields show requirements before the first failed attempt, not after
- Forms don't clear all fields when a single field fails validation

## Content clarity
- Main purpose of the page is clear within 5 seconds of arrival
- Primary call to action is visible above the fold on critical pages
- Technical jargon or internal terms are explained or avoided
- No walls of text — content has visual hierarchy (headings, lists, white space)
- Dates, prices, and units are unambiguous

## Consistency
- Buttons, links, colors, spacing, and iconography are consistent across pages
- Similar actions work the same way everywhere (e.g., delete always asks for confirmation)
- Elements that look interactive are interactive; elements that look static are static
- Terminology is consistent (don't call the same thing "account", "profile", and "user" on different pages)

## Mobile hints (infer from HTML — no device available)
- `<meta name="viewport" content="width=device-width">` present
- Links in dense inline text are hard to tap — prefer block-level tap targets for mobile
- Horizontal scroll likely if a fixed-width container exceeds typical viewport (>600px)

## Unexpected behavior — highest priority
Flag anything that technically works but a reasonable user would not expect:

- Destructive actions (delete, cancel order, remove account) without a confirmation step
- Auto-advancing carousels or auto-playing media (user didn't ask for motion)
- Auto-redirect or `<meta http-equiv="refresh">` that interrupts the user
- Back-button navigation that loses form progress without warning
- Pagination or filters that reset scroll position or clear other filters unexpectedly
- Success or error messages that disappear too fast to read (< 3 seconds)
- Links that open modals or overlays when navigation was expected
- Text styled identically to a button (or vice versa)
- Features toggled by hover-only (inaccessible on touch)
- Login wall appearing mid-flow after significant user effort

## Error and empty states
- 404 and 500 pages are helpful: explain what happened and offer a path back
- Empty states (no results, empty cart, no history) provide a next action
- Loading states visible for operations longer than ~300ms

## Severity guide
- **critical** — blocks completion of a core task
- **high** — significant confusion or failure in a common flow
- **medium** — annoying or confusing but workable
- **low** — minor polish issue
