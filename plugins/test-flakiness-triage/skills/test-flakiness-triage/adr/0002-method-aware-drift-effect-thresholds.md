# ADR 0002 — Method-aware drift effect-size thresholds

- **Status**: Accepted
- **Date**: 2026-05-19
- **Skill**: [`test-flakiness-triage`](../SKILL.md)

> See ADR-0001's note about why this lives in `adr/` and not in
> `SKILL.md`.

## Context

`scripts/density.py` detects drift along the run-order subsequence
with a three-tier fallback chain:

1. **Pettitt's non-parametric change-point test** (requires `scipy`)
   — Applied Statistics 28(2), 1979. Computes the rank-based statistic
   `U_t,n = Σ_{i=1..t} Σ_{j=t+1..n} sgn(x_i − x_j)` and rejects the
   null `H₀: no change point` at α = 0.05. Well-calibrated against
   the null for `{0,1}`-valued sequences.
2. **CUSUM on the running mean** (requires `numpy`) — accepts a split
   point if cumulative deviation from the global mean is maximal there
   and the resulting between-half difference exceeds 3 standard errors.
   Decent in practice, can over-fit on small `n`.
3. **Quartile-split** (pure stdlib) — splits at `n//4`, `n//2`, and
   `3n//4`, takes the split with the largest `|p₁ − p₂|`, accepts if
   that gap is ≥ 0.3. Coarsest of the three; survives only because
   the skill must run when `numpy` / `scipy` are unavailable.

The smoke test exposed that a fixed effect-size threshold (originally
0.3) caused the quartile-split fallback to false-positive on a
genuinely-flaky test with `n = 20`: a 70%-pass deterministic-seed
sequence happened to split into a 40%-pass first half and an 80%-pass
second half, which cleared 0.3 and was wrongly classified as
`drifting`.

## Decision

`classify.py` applies a different effect-size threshold per detector
method, encoded in `METHOD_EFFECT_THRESHOLDS`:

| Method           | Effect threshold | Rationale                                            |
|------------------|------------------|------------------------------------------------------|
| `pettitt`        | 0.30             | Test is well-calibrated; the 0.05 α-cut already controls false positives. |
| `cusum`          | 0.40             | Over-fits on small `n`; require a larger between-half gap to compensate.  |
| `quartile-split` | 0.60             | Pure heuristic; only accept splits that look unambiguous.                 |
| `unavailable`    | 1.1              | Never fires.                                          |

A drift detection fires only when the detector reports a change point
**and** `|before_density − after_density|` ≥ that method's threshold.

The 0.30 / 0.40 / 0.60 values were calibrated against the bundled
fixture so that:
- A truly monotone drift (gap ≈ 1.0) fires under all three methods.
- A 70%-pass deterministic-seed flaky test (`n = 20`) does **not** fire
  under quartile-split.

## Consequences

- The skill behaves consistently regardless of which Python libraries
  the user has installed — a missing `scipy` or `numpy` degrades
  precision but does not flip a flaky test into a misleading drift.
- The Markdown report appends "(detector: <method>; treat as
  suggestive.)" when the method is anything other than Pettitt, so the
  user knows the confidence level.
- `with_math=true` surfaces the change-point method and p-value (or
  approximate p-value) directly so a curious user can sanity-check.
- The thresholds are coarse and corpus-shape-dependent. If a user
  reports false negatives on real drift with a CUSUM detector, the
  fix is to install `scipy` (which switches to Pettitt and the
  tighter 0.30 threshold) — not to tune CUSUM's threshold down.

## Notes

A more principled alternative would be to convert every detector's
output into a single normalized statistic (e.g., always report a
two-sided p-value, and accept at α = 0.05 regardless of method). That
requires implementing a stdlib-only p-value approximation for both
CUSUM and quartile-split, which is more code than is justified at
v0.1.0 — the thresholds-by-method approach is mathematically less
elegant but the calibration is local and reviewable here.
