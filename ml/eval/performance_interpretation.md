# How to read the perf and sanity reports

This doc explains two things together:

1. **Why we engineer the features we engineer**, and what each one
   buys us.
2. **Why per-region accuracy is the more honest read** than a single
   global R², and how to interpret the conclusion lines the eval
   scripts now print.

If you skip the doc and quote one number, quote the per-region MAE for
the regions you care about — not the global R².

---

## 1. Engineered features

`ml/data/real.py:_engineer_features()` adds three derived columns to
the panel at load time so both the trainer and the cluster panel see
them. They're added to `PREDICTOR_COLS`, which means
`load_extended_panel()` automatically exposes them to the geographic
trainer.

### 1a. `gdp_x_govt_response` — interaction term

Raw form: `gdp_per_capita_log * govt_response_total`.

**Why.** Two countries with the same GDP and the same Walk Free
government-response score can have very different exploitation
profiles. A rich-but-weak-response country (GCC pre-reform, some
Eastern European states) is structurally different from a
poor-but-strong-response country (Rwanda post-2000). The interaction
gives the linear (Ridge) head of the ensemble a way to learn that
"good response only matters at higher GDP", which a plain additive
linear model cannot. Trees pick this up trivially without the
interaction, but the Ridge averaging benefits.

**Observation:** the collinearity reducer often drops this column on
the small base panel because `gdp_per_capita_log` and
`govt_response_total` are each fairly strongly correlated with the
product. That's fine — it just means the trees are doing the
heavy lifting and Ridge is using the raw versions.

### 1b. `gdp_rank_pct_in_region` — within-region rank

Form: `panel.groupby('region')['gdp_per_capita_log'].rank(pct=True)`.
Each country gets a 0..1 percentile of its log-GDP within its region.

**Why.** Absolute wealth and relative wealth are different signals.
Being a $30k/cap country in Europe (median Eastern Europe) is a
different exploitation profile from being a $30k/cap country in
Sub-Saharan Africa (top-2 wealthiest). The rank captures "rich
relative to peers" — useful for trafficking source/destination
analysis.

### 1c. Region one-hots — `region_Africa`, `region_Americas`,
`region_Arab_States`, `region_Asia_and_the_Pacific`,
`region_Europe_and_Central_Asia`

Standard regional fixed-effects encoding. All five GSI regions are
hardcoded so train and test always have the same column set, even if
a particular split happens to miss a region.

**Why.** Without these the model has no way to encode "this is a
Middle Eastern country" beyond what the observable features
(GDP / press freedom / governance) carry. Regional dummies let the
model learn region-level residuals — e.g. that prevalence in Africa
runs systematically higher than the predictors alone would predict.
Cheap, additive, well-understood.

**Effect.** Adding these moved CV R² from ~0.15 to ~0.47 on the base
panel. Most of the lift comes from the region dummies — the
interaction and the rank are smaller contributors.

---

## 2. Training-set exclusion of GCC kafala states

`ml/data/real.py:KAFALA_STATES_TRAINING_EXCLUDE` lists six ISO3 codes
that `train_geographic` removes from the training panel **before**
fitting:

```
BHR Bahrain  · KWT Kuwait  · OMN Oman
QAT Qatar    · SAU Saudi Arabia · ARE United Arab Emirates
```

### What and why

These are the Gulf Cooperation Council states whose observed slavery
prevalence (GSI 2023 lists Kuwait at 13.0 /1k, UAE at 13.4 /1k) is
driven almost entirely by the **kafala** migrant-sponsorship system.
That system isn't visible to any of the features we train on:

- GDP, urbanisation, gini, unemployment all look "rich, modern, OECD-ish"
- WGI / CPI / WJP governance scores all look "moderately good"
- Press freedom is genuinely poor (RSF is a useful signal here), but
  not poor enough to explain 13/1k.

So on the observable features, these countries should predict like
Western Europe (≤3/1k). The model couldn't be right about them with
the features we have — including them in training corrupts the
coefficients the model learns for *every other rich country*.

### What this does NOT mean

- They are still served at inference time. `python -m ml.pipelines.predict`
  with `{"country":"KWT"}` returns a prediction (the model's best
  guess from observable features — which will badly under-predict).
- They are still in the cluster model. KMeans treats them as their own
  cluster or pulls them toward the "rich, urban" cluster — fine for
  the "similar countries" UI.
- The held-out perf script does NOT exclude them from the test set.
  We deliberately want to see how badly we miss when they land in the
  test split, so the `In-scope vs excluded structural outliers` table
  shows the lift.

### What the conclusion lines show

If your perf run had KWT/ARE in the test set, you'll see something
like:

```
In-scope test (excludes kafala states)  1.67   +0.37
All test rows (includes them)           2.23   -0.05
```

That gap (R² −0.05 vs +0.37) is what the conclusion paragraph means
when it says *"their residuals dominate the global R²"*. The model is
genuinely useful — but only on countries whose labor structures
resemble the training distribution.

---

## 3. Why per-region accuracy beats a single global R²

### The arithmetic problem

Global R² is `1 − SS_res / SS_tot`. With n=31 test rows, one Kuwait
miss (residual ≈ −10) contributes ≈100 to SS_res. The total SS_res
across all 31 rows is around 320. So two Gulf states alone account
for ~60% of total squared error. The remaining 29 countries' residuals
together carry less weight than two outliers do.

This is why you see a global R² near zero **with** kafala in the test
set, but R² ≈ +0.37 when you remove them. The model is the same. The
data set is doing the storytelling.

### The visibility problem

A single number can't tell you *where* the model works. The perf
script's per-region table:

```
region                    n    MAE    bias      R²
Americas                  5  0.93  -0.01   +0.72
Europe and Central Asia   9  1.45  +0.46   +0.78
Asia and the Pacific      5  1.77  +0.51   −1.92
Africa                   10  2.18  +1.31   −0.95
Arab States               2  10.4  −10.4      —
```

reads top to bottom as a story:

- **Americas** and **Europe & Central Asia**: model works well —
  MAE under 1.5/1k, R² above 0.7.
- **Africa**: MAE OK at 2.2 (within the conformal half-width), but
  R² is negative because the within-region variance is high and the
  model's predictions don't track it. Translation: "we predict
  African countries near the African mean, which gives low MAE but
  doesn't explain the spread."
- **Asia/Pacific**: small sample (n=5); negative R² is mostly
  noise. Don't quote it.
- **Arab States**: model breaks for the reasons above.

That's information you simply cannot get from "R² = 0.18 overall".

### Rules for quoting these numbers

| Audience | Number to quote |
| --- | --- |
| Demo audience asking "how accurate?" | Per-region MAE for the regions you care about; or "MAE 1.5–2/1k across regions where the model has training coverage". |
| Academic / methods-aware audience | The CV R² (production: ~0.47) PLUS the in-scope vs all-test split. Both. |
| Frontend headline metric | The in-scope CV MAE / R² (production model, kafala excluded by construction). It's the number the model is genuinely accurate at. |
| When ranking countries | Use Spearman against GSI rank, not R². The model's *ranking* of countries holds up much better than its absolute predictions. |

### What the auto-conclusion in `performance.txt` says

The script emits 4–5 bullets:

1. Headline overall MAE + R² — on **all** test rows including any
   kafala that happened to land there. This is the conservative read.
2. Per-region MAE range (best/worst). Signals heterogeneity.
3. If kafala countries landed in the test set, the lift you get by
   removing them. Explains where any negative R² comes from.
4. Conformal coverage vs nominal. Tells you whether the uncertainty
   bands are honest.
5. The "read by region" reminder.

### What the auto-conclusion in `sanity.txt` says

Sanity bullets are different — they check the distribution shape,
not the accuracy:

1. Min/max predicted country (named).
2. Highest- and lowest-mean region.
3. Distribution skew + interpretation.
4. Top-5 and bottom-5 named for an eyeball check against real-world
   expectations. If Norway shows up at the top, the model is broken.
5. Reminder that the four ILO bucket splits are constant proportions
   — same country ranks identically in all four.

---

## 4. Summary

- The engineered features (region one-hots in particular) raise CV
  R² from ~0.15 to ~0.47 honestly.
- Excluding kafala states from training is the single biggest
  intellectual honesty decision in the model. The numbers shown to
  the demo should reflect what the model actually predicts well.
- A single global R² on n=31 test rows is a lousy summary statistic.
  Per-region MAE plus the in-scope vs all-test R² split is the
  honest two-number summary.
- Both eval scripts now end with an auto-conclusion section that
  bundles these signals into ~5 bullets.

If a future contributor wonders whether to drop the engineering or
the exclusion: read this doc, then read
`docs/statistical_resolutions.md` for the older context. Both stay
in place because both reflect what the model honestly does on real
data.
