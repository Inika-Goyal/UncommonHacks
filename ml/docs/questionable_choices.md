# Questionable choices — and how to improve them

The user explicitly asked for these to be called out. Each item is
something I'd flag if I were reviewing this PR honestly.

---

## 1. Synthetic data instead of real-world data

**What I did.** `data/synthetic.py` fabricates a 60-country × 8-year ×
4-exploit panel and uses hand-picked coefficients to produce a "truth"
that the models can recover. I tuned the per-exploit intercepts by hand
so the four outcomes are roughly balanced (so the cluster model's
dominant-exploit-per-cluster labels aren't trivially constant).

**Why it's questionable.** Both models look great on this dataset
because the data-generating process matches what they're built to fit:
the geographic model's R² and Spearman-vs-GSI numbers will collapse on
real data where confounders are correlated in messier ways. The cluster
model's silhouette is mediocre even on the synthetic panel (0.22),
which is honest, but the NB accuracy (0.56) is partly inflated because
the dominant-exploit label is itself derived from the simulated linear
form the NB is learning.

**How to improve.**
- Replace the panel with a real pull from WDI + WGI + ACLED + GSI +
  ILOSTAT + UNHCR. Keep `synthetic.py` as a unit-test fixture only.
- Add a `data/real.py` that joins those sources on (ISO3, year) and
  emits the same column schema, so model code does not change.
- Re-tune intercepts only if needed — if the real distribution of
  dominant exploits is also imbalanced, the cluster summary should just
  report that, not paper over it.

---

## 2. The reporting-bias adjuster is the same function as the bias
   itself

**What I did.** `features/reporting_bias.py` divides observed prevalence
by `(0.25 + 0.0075 * press_freedom)` — exactly the inverse of the
multiplier the synthetic generator applies. On synthetic data this
recovers the latent truth almost perfectly, which is why the geographic
R² is high.

**Why it's questionable.** Real reporting bias isn't multiplicative,
isn't perfectly linear in RSF, and varies by exploit type (child
trafficking is under-reported in different ways than forced labor).

**How to improve.**
- Calibrate the multiplier empirically by regressing media-derived
  prevalence on victim-based prevalence (e.g., UNODC GLOTIP victim
  counts, which include closed regimes via asylum-system data) with a
  fixed press-freedom term.
- Fit a per-exploit-type adjuster instead of one shared function.
- Add a sensitivity test that shows the country ranking under different
  bias-adjuster strengths.

---

## 3. Uncertainty bands are a heuristic, not a calibrated interval

**What I did.** `TrainedGeoModel.predict` reports `mean ± 1.28 *
spread`, where `spread = bag_std + 0.5 * |tree_pred - linear_pred|`.
The `1.28` is the normal-distribution 80% interval z-score, which is
borrowed without justification.

**Why it's questionable.** The bag-std estimates *within-family* model
variance; cross-family disagreement estimates *bias from model choice*.
Adding them isn't a real predictive interval. They aren't calibrated to
empirical coverage either — I never checked what fraction of held-out
targets actually fall inside [lower, upper].

**How to improve.**
- Replace the heuristic with `MapieRegressor` (or a hand-rolled
  conformal predictor) on held-out folds, which will produce intervals
  with empirical coverage guarantees.
- Report coverage on the test set alongside MAE and R².

---

## 4. KMeans on standardized features is a weak similarity metric

**What I did.** `models/cluster.py` standardises all features equally
and runs KMeans. The "similar countries" view ranks within-cluster
neighbours by Euclidean distance.

**Why it's questionable.** Euclidean distance on z-scored features
treats every block equally — demographics, economy, governance,
migration, help — even though those blocks have very different
practical importance for "is this country a similar exploitation
risk?". It also smushes categorical-ish features (UNHCR/ILO office
presence) into the same space as continuous ones.

**How to improve.**
- Weight feature blocks. Either let the user supply weights, or learn
  them from the geographic model's permutation importance.
- Try Gower distance, which handles mixed types correctly.
- Try HDBSCAN, which doesn't force every country into a cluster — some
  countries genuinely don't have peers.

---

## 5. Gaussian Naive Bayes on collapsed argmax targets

**What I did.** The NB target is the per-(country, year) argmax over
exploit-type prevalence — i.e. "which of the four exploits is biggest
here". The four classes get a single GaussianNB fit.

**Why it's questionable.**
- The argmax throws away the *margin* between exploits. Calling
  Cambodia "dominantly child labor" when child labor is 1.1 per 1000 and
  forced labor is 1.0 per 1000 is misleading.
- NB assumes feature independence given class. The governance block
  features are heavily correlated (CPI / WGI / WJP all measure similar
  things), so NB will over-count that signal.

**How to improve.**
- Predict the full distribution over exploit types rather than the
  argmax — multinomial regression or a small softmax head.
- Drop one of the governance proxies or PCA the block down to one
  component before passing it to NB.
- Report the top-2 probability gap; if it's small, the "dominant
  exploit" label is unreliable and the UI should say so.

---

## 6. The geographic model trains one estimator per exploit type
   instead of one joint multi-output model

**What I did.** Four independent `TrainedGeoModel` instances, one per
exploit.

**Why it's questionable.** The four exploits are correlated — countries
that are bad on forced labor are usually bad on child labor too. A
multi-output model with a shared backbone (e.g., XGBoost multi-output
or a small MLP) would pool that signal.

**How to improve.** Switch to `MultiOutputRegressor` for a quick win,
or to a chained learner if you want forced_labor predictions to inform
the children prediction.

---

## 7. The cluster model uses ALL features including governance

**What I did.** `DEFAULT_BLOCKS` includes governance. The plan text was
clear that the cluster model is for demographic / economic / migration
/ help — not governance.

**Why it's questionable.** Including governance lets the clusters
collapse into "well governed vs not well governed", which is exactly
the kind of mono-axis split that hides interesting heterogeneity.

**How to improve.** Drop `GOVERNANCE_COLS` from the default block set
and keep them as a *secondary* labeller (compute mean governance per
cluster as a description, not an input). I left the block in for now so
the NB has more signal to learn from on the small synthetic panel — on
real data this should be revisited.

---

## 8. The predict CLI assumes the country code is already in the panel

**What I did.** `pipelines/predict.py` looks up `(country, year)` in
the saved panel CSV. If the TS layer passes a country we never trained
on, the CLI errors out and the TS layer falls back to deterministic
scoring.

**Why it's questionable.** In production we'd want the CLI to accept a
*feature vector* directly so the TS side could fetch live WDI / GSI
data and the CLI wouldn't need a panel artifact at all.

**How to improve.** Make `features` (already in the input schema but
unused) authoritative; only fall back to the panel lookup if the caller
omits them. Then drop `panel.csv` from the runtime dependency list.

---

## 9. No held-out year for true forecasting evaluation

**What I did.** The geographic model uses year-t features to predict
year-(t+1) targets, but cross-validation splits by *country*, not by
*year*. So a fold can have training rows from year 2022 and test rows
from year 2018 for a different country.

**Why it's questionable.** That's still a valid measure of cross-
country generalisation, but it doesn't directly test forecasting
capability. To make the "predict next year" claim cleanly, the holdout
should be both country-disjoint *and* time-forward.

**How to improve.** Replace `GroupKFold` with a nested split:
group-shuffle the countries into train/test, then within each group
hold out the final two years for time-forward evaluation.

---

# 2026-05 — Resolution notes (real-data rewrite)

The repo has since been moved from synthetic to real GSI 2023 + WDI 2021
+ RSF 2021 data, and several items above are now addressed:

- **Item #1** (synthetic data): **resolved**. `data/synthetic.py` is
  gone. `data/real.py` joins the three real CSVs into the panel. The
  geographic model is now single-output (overall GSI prevalence per
  1,000) because per-country per-exploit-type ground truth is not
  publicly available.
- **Item #2** (tautological bias adjuster): **resolved**.
  `features/reporting_bias.py` is now a stub that raises
  `NotImplementedError` on any call. The geographic training pipeline
  trains on raw observed GSI prevalence — we accept whatever bias is
  baked into GSI rather than pretending to undo it with a fabricated
  formula.
- **Item #3** (uncalibrated uncertainty bands): **resolved with
  split-conformal**. `geographic.py` holds out a calibration set,
  computes the (1 - alpha)-quantile of ensemble absolute residuals as
  a fixed half-width, and reports empirical coverage on the KFold
  test folds alongside nominal coverage. Both numbers ship in the
  predict CLI output.
- **Items #5 and #7** (target-leaking NB; cluster includes governance):
  **resolved by removing the NB entirely** and reducing the cluster
  feature blocks to demographic + economic. Without per-country
  per-exploit ground truth there's nothing for the NB to classify, and
  the GSI+WDI+RSF tier doesn't include governance features anyway.
  Predict CLI now derives "exploit-type breakdown" from fixed ILO
  global proportions (clearly labelled as such).
- **Item #9** (no time-forward CV): **moot for now**. The real panel
  is cross-sectional (one year per country). CV is random 5-fold,
  reflecting honest cross-country generalisation. Re-introducing a
  longitudinal target requires reconciling GSI 2014/2018/2023
  methodology differences, which is deferred.

Still open as follow-ups:
- **Item #4** (KMeans similarity weakness): partial — feature blocks
  are smaller now, but Gower/HDBSCAN swap is not done.
- **Item #6** (multi-output regression): moot for now (single output).
- **Item #8** (CLI accepting raw feature vectors): still uses the
  panel lookup; would be useful when a TS query resolves to an ISO3
  not in our panel.
