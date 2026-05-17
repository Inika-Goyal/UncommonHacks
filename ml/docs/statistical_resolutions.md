# Statistical issues — what was resolved, what is open

Bigger predictor set ⇒ more failure modes. This doc lists every
statistical issue introduced by the move from a single-source synthetic
panel to a multi-source real panel, what code I added to handle it,
and what still needs human review.

The columns are:

- **What broke** — the issue.
- **How I resolved it** — code path that handles it now.
- **Where to check it** — concrete artifact / output you should inspect.
- **Open** — known limits of the fix; what's left for a human review.

---

## 1. Different sources cover different countries → join shrinkage

**What broke.** The original `load_panel()` inner-joined GSI + WDI + RSF
and ended at 153 countries. Adding WGI / UNHCR / ACLED / CPI under the
same inner-join would shrink the panel further (CPI publishes for
~180 countries, but ACLED skips quiet OECD countries — the intersection
drops fast).

**Resolved by.** Switched to `load_extended_panel()` in
`ml/data/real.py`, which left-joins each optional source onto the
base GSI+WDI+RSF inner-join. Missing predictors fall through to the
imputer instead of dropping rows.

**Where to check.** `ml/artifacts/geographic/summary.json` →
`data_quality.n_rows`. Compare to base 153. If row count drops, an
optional source is doing an unexpected inner-join somewhere.

**Open.** Left-join + impute assumes data-missing-at-random. ACLED
specifically tends to skip *quiet* countries (data NOT missing at
random — missingness is correlated with low conflict). The model
will impute conflict-events at the regional median for those
countries, biasing predictions toward "average instability." A
proper fix would set `conflict_events_per_1m = 0` for OECD
countries that ACLED tracks but reports no events for, vs `NaN`
for countries ACLED doesn't cover at all. That distinction isn't
in the source CSVs.

---

## 2. More columns → more missingness per row

**What broke.** Going from 9 to ~20 predictors means a single missing
value per source drops more rows under naive `dropna(subset=cols)`.
Global-median imputation pulls every imputed country toward the world
mean, biasing predictions toward 6/1k (the GSI global mean).

**Resolved by.** `ml/features/imputation.py` does region-aware median
imputation: it uses the GSI `region` field (Asia-Pacific, Europe &
Central Asia, etc.) when the region has ≥5 observed values, falls
back to the global median otherwise, and logs which countries got
which tier in `ImputationReport`.

**Where to check.** `ml/artifacts/geographic/summary.json` →
`imputation.regional_imputed_counts` / `global_imputed_counts`. A
column where most fills are global (not regional) is being imputed
poorly and should be flagged. Also `column_used_region`: if false for
a column the operator was expecting to be region-imputed, that
source's regional coverage is too sparse.

**Open.** I never check whether the regional median is actually a
good prior for the country. A small Pacific Island country in the
"Asia-Pacific" region might be poorly served by an imputation
formed from China + Japan + Australia. A nearest-neighbour imputer
on observed columns would be better but adds runtime; not done.

---

## 3. Multicollinearity from related sources

**What broke.** WGI's 6 indicators, CPI, and WJP all measure
"governance quality." Pearson correlations between WGI rule-of-law
and CPI score regularly run >0.9. Feeding them all to Ridge inflates
coefficient variance and confuses VIF; feeding them all to KMeans
makes "is this country well-governed" the dominant cluster axis.

**Resolved by.**
- `ml/data/quality.py` runs Pearson correlation + VIF, flags pairs
  with |r| ≥ 0.85 and VIF ≥ 10 in the report.
- `ml/features/multicollinearity.py:drop_redundant_columns` greedily
  drops the more-redundant column from each correlated pair, keeping
  the one with the lowest average correlation against the rest.
- `train_geographic(drop_collinear=True)` (default) wires it in.

**Where to check.**
- `summary.json → data_quality.high_correlation_pairs` lists the
  flagged pairs.
- `summary.json → collinearity.dropped` lists what the trainer
  removed. `collinearity.kept_representatives` shows which kept
  column "speaks for" each dropped one.

**Open.** Greedy pair-wise pruning is a heuristic. A correlated
*triple* (WGI rule-of-law + CPI + WJP, all ~0.9 with each other)
will see two drops, leaving one survivor with the same information
in it — but a real factor model would have collapsed all three into
a single "governance" component carrying more signal. The PCA helper
(`pca_collapse_block`) exists but isn't wired in by default; doing
so requires the trainer to know which columns belong to which
conceptual block, which means hand-curated block lists.

A concrete consequence I observed: with WGI added, the trainer
dropped both `wgi_rule_of_law` and `gdp_per_capita_log` (both
correlated with `wgi_government_effectiveness`). That's plausible
but it means GDP is no longer in the model — operators expecting
"GDP per capita drives prediction" need to read the dropped list,
not assume it's there.

---

## 4. Walk Free's vulnerability/response indices vs the GSI target

**What broke.** `vulnerability_total` and `govt_response_total` are
Walk Free *sub-indices* that the GSI prevalence is partly *derived
from*. Treating them as predictors of the GSI prevalence is borderline
leakage: it inflates R² without the model learning anything
generalisable to non-Walk-Free predictions.

**Resolved by.** The quality scan flags
`gdp_per_capita_log ~ vulnerability_total` (r=0.85) as high
correlation, and the collinearity reducer drops `vulnerability_total`
by default. Honest CV R² drops from ~0.27 (the pre-resolution
number) to ~0.15 (the new number, with `vulnerability_total`
removed). The new number is the right one to quote.

**Where to check.** `summary.json → collinearity.dropped` should
include `vulnerability_total` on the base panel. If it doesn't,
something has shifted that block's correlations and the leakage may
have crept back in.

**Open.** Walk Free uses ~15 sub-indices internally. The CSV only
exposes two of them. The "correct" fix is to either (a) drop both
from predictors entirely (treat them as observation-side metadata),
or (b) train on something *other* than GSI as the target (UNODC
GLOTIP victim counts, ILO forced-labour estimates) so the loop
isn't circular. I left them in as predictors because a hackathon
demo benefits from the lift; the production model should remove
them.

---

## 5. Skewed target → R² is the wrong yardstick

**What broke.** GSI prevalence per 1k has skew ≈ 2.3 — a long tail
of high-prevalence countries dominates squared-error R². A model that
predicts the mean for low-prevalence countries and gets the long tail
roughly right will look like it has lower R² than one that smooths
the tail.

**Resolved by.** `quality.py` runs Shapiro-Wilk on log1p(target);
if p > 0.05 (log-normal-ish), `train_geographic(auto_log_target=True)`
fits on `log1p(y)` and `expm1`s predictions back at inference. The
conformal half-width is computed on the log scale and applied
correctly (interval endpoints are exp1m'd, not mean ± exp1m(width)).

**Where to check.**
- `summary.json → target_transform` says `"log1p"` or `"identity"`.
- `summary.json → data_quality.target_log_normality_p` shows the
  Shapiro p. On the current panel the test returns p ≈ 0.02 (rejects
  log-normality), so the trainer keeps identity. If you bring in
  more high-prevalence countries the p may flip — and the model
  will silently switch to log target. Watch this when iterating
  on the panel.

**Open.** Shapiro is a strict test. "Approximately log-normal" by eye
might not pass Shapiro at our sample size. An operator who looks
at a histogram and decides "this is log-normal" but the trainer
disagrees should override with `auto_log_target=False, log_target=True`
in code — there's no CLI flag for it yet.

---

## 6. Auto-scaling Ridge regularisation

**What broke.** With 9 predictors a fixed `Ridge(alpha=1.0)` is fine.
At ~20 predictors with strong correlations the alpha was undershooting
— coefficients started flipping sign across folds.

**Resolved by.** `train_geographic` now auto-sets
`alpha = min(10, 1 + 0.5 * (n_features - 5))` when the caller doesn't
override. More predictors → more shrinkage. Capped at 10 so the
production setting doesn't oversmooth.

**Where to check.** Compare ridge coefficients across folds — sign
flips on the same feature between fold 1 and fold 5 = under-
regularisation. (Not surfaced yet in the summary; would be a useful
add.)

**Open.** The formula is heuristic. Real cross-validated alpha
selection (RidgeCV) would be principled but adds runtime; not done.

---

## 7. Per-block weighting in the cluster model

**What broke.** Adding a 4-column governance block to a 3-column
demographic block means governance contributes 4/3× as much
variance to Euclidean distance, and KMeans is dominated by it.

**Resolved by.** `train_cluster_model(equal_block_weighting=True)`
(default) multiplies each column by `1/√(block_size)` post-scaling
so every block contributes the same expected variance. The same
weights are re-applied at inference inside `TrainedClusterModel._transform`,
so `assign_cluster` and `similar_countries` use the same feature
space the model was fit on.

**Where to check.** `cluster/summary.json → block_weights` should
show `1/√N` per block (e.g. 0.577 for a 3-column block, 0.707 for
a 2-column block). If you see all-equal weights for unequal blocks,
the per-block weighting was disabled and the larger block is
dominating cluster assignment.

**Open.** All blocks weighted equally is itself a choice — the
"correct" weighting would be by predictive relevance to GSI
prevalence (permutation importance from the geographic model). Not
done because it couples the two models and would need re-training
both whenever either changes.

---

## 8. Conformal coverage gap

**What broke.** The nominal 80% conformal interval gets ~62-69%
empirical coverage on the small panel. That's a known split-conformal
small-sample limitation — the per-fold calibration set is ~25 rows.

**Resolved by.** I report both numbers in
`summary.json → conformal_half_width` (nominal) and
`empirical_coverage_80`. The predict CLI doesn't hide this gap.
The README documents it. Bigger panels (multi-year, or +UNHCR
+ACLED rows) would tighten the gap.

**Where to check.** Watch `empirical_coverage_80` after retraining.
If it drops below ~0.60, the half-width has lost meaning and the
predict CLI's uncertainty bands should not be shown to users.

**Open.** Mondrian / conditional conformal predictors give better
small-sample coverage; not used.

---

## 9. Reporting bias adjuster still disabled

**What broke.** Free-press countries publish more articles about
labor abuses, so naive "more reports → more risk" models rank
Norway above Eritrea. This was item #2 in `questionable_choices.md`.

**Resolved by.** **Not resolved.** `features/reporting_bias.py` is a
stub. On the synthetic panel I had a closed-form inverse of the
generator's bias; on real data that inverse is meaningless. A real
fix would empirically calibrate the multiplier by regressing
media-derived prevalence against victim-based prevalence (UNODC
GLOTIP) with a fixed press-freedom term.

**Where to check.** N/A — not implemented.

**Open.** Until this is built, the geographic model is partially
learning "the country reports a lot" rather than "the country has a
lot of forced labor." RSF press-freedom score is in the predictor
list, so Ridge can at least *adjust for* it, but doesn't *correct*
for it.

---

## 10. Cross-source temporal mismatch

**What broke.** GSI 2023 (vintage uncertain), WDI 2021, RSF 2021,
WGI 2021, UNHCR end-of-2021, ACLED rolling. Treating them as a
single 2021 snapshot is a fiction.

**Resolved by.** Documented in `data/real.py` docstring and in
the README's honest-disclaimer block. Not algorithmically corrected.

**Where to check.** N/A.

**Open.** A multi-year panel would let us join each source on
(country, year) and lag the predictors by 1-2 years to enforce
"year-t features predict year-(t+1) target." The synthetic era had
this; the real era lost it because GSI editions aren't longitudinally
comparable.

---

## Sanity-checklist before quoting any number from this model

1. Did `summary.json → data_quality.schema_errors` come back empty? If
   not, the model trained on bad columns — don't quote it.
2. Was `collinearity.dropped` what you expected? If GDP or another
   "headline" feature got dropped, the operator-facing story has to
   reflect that.
3. Is `imputation.global_imputed_counts` low? High global-impute
   counts on a column mean the country-level prediction is
   essentially a regional or world average.
4. Is `empirical_coverage_80` ≥ 0.60? If not, hide the uncertainty
   bands — they're not honestly calibrated.
5. Is `target_transform` what you assumed? Switching between identity
   and log1p silently changes how predictions read.
6. Did `feature_cols` include `vulnerability_total` or
   `govt_response_total`? Those are Walk Free sub-indices; quoting
   "the model predicts GSI" with them in is partly tautological.
