# `test-flakiness-triage` — math primer (agent-internal)

This document explains the mathematical framing that justifies the engine's
design choices. **It is for the agent's understanding, not for the user**.
The user-facing report never references ultrafilters, hyperreals, cylinder
sets, or standard parts — unless `with_math=true` is passed, in which case
`scripts/report.py` appends a sanitised appendix derived from this document.

## 1. Setup

A test corpus is a family of `{0, 1}`-valued sequences indexed by run order.
Concretely, for each test `T` we have

    pass_T : I → {0, 1}

where `I = {0, 1, 2, …, n−1}` is the index set of runs in chronological order,
`pass_T(i) = 1` iff `T` passed on run `i`, and `pass_T(i) = 0` iff it failed.
Skipped / errored runs are dropped from `I` before this is constructed — they
carry no pass/fail signal and would corrupt the analysis below.

Each run `i` also carries metadata coordinates

    strat(i) = (os, runner, arch, seed, fuzz_input, hour, dow)

so that we can restrict attention to sub-corpora cut out by fixing one or
more coordinates.

## 2. Cylinder restrictions

A *cylinder set* in the product space `I × Strata` is determined by fixing
one stratum coordinate. For coordinate `s` and value `v`:

    C(s, v) = { i ∈ I : strat(i).s = v }

The **cylinder-restricted density** of test `T` is

    d(T | s = v) = (1 / |C(s,v)|) · Σ_{i ∈ C(s,v)} pass_T(i)

i.e., the pass rate conditional on the cylinder. This is what catches the
case where `d(T) = 0.95` globally but `d(T | os = macos) = 0.0` — naive
averaging hides this entirely; cylinder restriction surfaces it.

A stratum coordinate `s` *explains* the test's behaviour when

    max_v d(T | s = v) − min_v d(T | s = v) ≥ stratum_threshold

with both extreme cells having ≥ `min_runs / 2` observations (so the
extremes are statistically real, not corner artefacts).

## 3. Ultrafilters and standard part

Let `U` be a non-principal ultrafilter on `I`. By Łoś's theorem, the ultrapower
`∏ {0,1} / U` is isomorphic to `{0, 1}` — every test's pass-sequence collapses
to a single bit reflecting "whether `T` passes on a `U`-large set." A test is
**morally stable** iff that bit is well-defined for *every* non-principal `U`
of interest, which is equivalent (after a small lemma) to asymptotic pass-rate
in `{0, 1}`.

In practice we never construct `U`. Instead, we approximate `U`-largeness by
*asymptotic density* on the run-order index set:

    d_n(T) = (1 / w) · Σ_{i = n − w + 1}^{n} pass_T(i),   w = max(20, n // 10)

(the rolling window's mean). The standard part of the failure-rate
hyperreal `1 − d_n(T)` — informally, "what `1 − d_n` converges to as we look
arbitrarily far out" — is then approximated by the right-tail mean of the
window series. If `st(1 − d_n) = 0` (failure rate vanishes), the test is
stable-pass; if `st(1 − d_n) = 1`, stable-fail; if it doesn't converge — i.e.,
`liminf d_n ≠ limsup d_n` — the test is **drifting**.

This is what justifies treating brief CI hiccups as ignorable: they affect a
density-zero set of runs, and the failure rate's standard part is unchanged.
It also justifies *not* treating a one-off failure on macOS as flakiness if
macOS represents a non-trivial cylinder where the failure is **U-large** for
the ultrafilter restricted to the cylinder — that's a stratum-sensitive bug,
not a flake.

## 4. Drift detection

Drift is the failure of `d_n` to converge in the standard part. We localize
the break with Pettitt's change-point test (non-parametric, robust to
non-Gaussian behaviour and well-suited to {0,1}-valued sequences). The test
statistic is

    U_{t, n} = Σ_{i=1}^{t} Σ_{j=t+1}^{n} sgn(pass_T(i) − pass_T(j))

and the change point is `argmax_t |U_{t,n}|`. Significance is evaluated at
α = 0.05. If `scipy.stats` is unavailable, the script falls back to a CUSUM
on the running mean (numpy only), and then to a coarse quartile-split if
even `numpy` is missing. The fallback chain reflects a real-world tooling
spectrum, not mathematical preference — Pettitt is the right test.

## 5. Why cylinder + drift together

A naive flake detector reports raw pass-rate per test. That conflates four
distinct failure modes:

1. **Truly random** — `d_n` converges to some `p ∈ (0, 1)`, no cylinder explains.
2. **Stratum-explained** — `d_n` converges to `p ∈ (0, 1)` globally but
   `d(T | s = v)` is in `{0, 1}` for some `(s, v)`.
3. **Drift** — `d_n` does not converge; there's a change point.
4. **Sparse** — `n` is too small to distinguish (1)/(2)/(3).

Cylinder restriction + change-point detection together let us discriminate
all four. The ultrafilter framing is what *unifies* them: each case is
distinguished by what kind of `U`-large statement holds about `T`. We never
need to instantiate `U` to make the distinction operationally, but we do
need to know `U`-largeness can be approached from two orthogonal directions
(cylinder filters along coordinates; density filters along the run order)
to know that the cylinder + drift decomposition is mathematically honest
rather than a heuristic stack.

## 6. What we deliberately don't do

- We don't compute joint cylinder restrictions `d(T | os=macos, seed=42)`.
  These cells are too sparse in realistic CI corpora to be statistically
  meaningful, and the marginal cylinder restrictions already explain almost
  all stratum-sensitive cases.
- We don't classify against branch / commit cylinders. Drift along the
  run-order subsequence already catches "broken since commit X" because the
  index set is chronological — making `commit` a separate stratum would
  cause every code change to look stratum-sensitive, which is the opposite
  of useful.
- We don't fit a probabilistic model (logistic regression on strata, say).
  The classification is supposed to be diagnostic, not predictive: we want
  to say "this stratum explains the failure" with a clear definition of
  *explains*, not "this stratum is 0.7 weight in a model."

## 7. References

- Łoś, J. *Quelques remarques, théorèmes et problèmes sur les classes
  définissables d'algèbres.* (Original ultrapower / transfer theorem.)
- Pettitt, A. N. *A Non-Parametric Approach to the Change-Point Problem.*
  Applied Statistics 28(2), 1979.
- IsarMathLib `Ultrafilters_ZF` and `HyperNatural_ZF` (formalisation of the
  non-standard part in Isabelle/HOL — the conceptual source of this
  framing).
