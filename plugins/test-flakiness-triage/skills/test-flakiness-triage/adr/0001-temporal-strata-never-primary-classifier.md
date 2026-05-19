# ADR 0001 — Temporal strata (`hour`, `dow`) are never the primary classification

- **Status**: Accepted
- **Date**: 2026-05-19
- **Skill**: [`test-flakiness-triage`](../SKILL.md)

> This ADR is **not** referenced from `SKILL.md` and is **not** loaded
> by the skill at runtime — `SKILL.md` is fed to the agent on every
> invocation, so design rationale belongs here. The build pipeline
> reads `SKILL.md` only; sibling folders like `adr/` cost zero runtime
> tokens.

## Context

The skill stratifies test runs by seven coordinates:
`os`, `runner`, `arch`, `seed`, `fuzz_input`, `hour`, `dow`. Cylinder
restrictions along any of these can produce a gap large enough to clear
`stratum_threshold`. The natural-feeling design is "if any stratum has
a gap ≥ threshold, classify the test as `stratum-sensitive`."

The smoke test against the bundled 20-run fixture (six tests, one of
each pattern) exposed why that doesn't work:

- `pkg.SuiteB::test_drifting` — passes runs 0..11, fails runs 12..19.
  The fixture spaces runs three hours apart, so the drift coincides
  with the boundary between two days of the week. Run 0–11 are
  Friday/Saturday, runs 12–19 are Sunday. A naive classifier flags
  this as `stratum-sensitive` on `dow=Sun` instead of as `drifting`,
  losing the diagnostic that lets the user bisect for a regression.

- `pkg.SuiteA::test_flaky` — 70% pass-rate against
  `random.Random(FLAKY_SEED_BASE + i)`. With only 20 runs and 3
  distinct day-of-week values, one of those cells is *expected* to
  drift from the mean by more than `stratum_threshold` purely by
  chance. The naive classifier reports a periodic pattern that does
  not exist.

Both failures arise because `hour` and `dow` are *functions of the
chronological run index*. Drift along the run-order subsequence
induces hour/dow correlations for free, and on small `n` a
deterministic-seed flaky test correlates with `dow` by accident.

## Decision

Temporal strata (`hour` and `dow`) are excluded from the set of
coordinates that can drive a `stratum-sensitive` classification. A
temporal stratum gap is surfaced as a *soft hint* inside the `flaky`
diagnosis — never as the primary label.

Concretely:

```
Priority order (classify.py):
  1. insufficient-data
  2. stable-pass    (no non-temporal cylinder gap, no drift)
  3. stable-fail    (no non-temporal cylinder gap, no drift)
  4. stratum-sensitive  ← only on os / runner / arch / seed / fuzz_input
  5. drifting       ← detected via change-point test on the run-order series
  6. flaky          ← optional temporal hint appended to diagnosis
```

The temporal hint takes the form *"Possible periodic pattern: passes
{p_hi:.0%} on {s}={v_hi}, {p_lo:.0%} on {s}={v_lo} (too few runs to
confirm)."* — wording that's deliberately tentative.

## Consequences

- The user gets the right diagnostic for genuine drift (a change-point
  with a run number to bisect from) instead of a misleading
  day-of-week label.
- Periodic failures that *are* real (e.g., a test that fails at
  03:00 UTC because of a nightly job) are not classified as
  `stratum-sensitive`. They appear under `flaky` with a hint pointing
  at the temporal pattern. This is the conservative choice: a proper
  significance test (Fisher's exact / Lomb–Scargle periodogram) would
  be needed to call a periodic pattern statistically real, and that's
  out of scope for v0.1.0.
- Branch / commit follow the same logic for the same reason — drift
  along the chronological subsequence already captures "broken since
  commit X". They are not stratum coordinates at all.
- Future work: if real periodic failures become a frequent miss, add
  a proper periodicity detector (e.g., autocorrelation at lag 24/168
  for hour/dow) and promote a positive result back to a primary
  classification, behind a new label like `periodic` so the
  distinction from `flaky` stays visible.

## Notes

The cylinder + drift decomposition is mathematically natural under
the ultrafilter framing in [`../../references/math-primer.md`](../../references/math-primer.md):
cylinder filters along *orthogonal* metadata coordinates and density
filters along the *chronological* index are two genuinely different
ways of approaching U-largeness, and conflating them — which is what
including hour/dow as primary strata does — corresponds to no
well-defined statement about T.
