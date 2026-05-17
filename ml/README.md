# LaborLens ML

Two trained models that score country-level modern-slavery risk for the
TS synthesis layer:

| Model | File | Purpose |
| --- | --- | --- |
| Geographic prevalence (overall) | `models/geographic.py` | Bagged GradientBoosting + Ridge linear, averaged. K-fold CV, split-conformal prediction intervals. Predicts GSI 2023 overall modern-slavery prevalence per 1,000 population. |
| Demographic + economic similarity | `models/cluster.py` | KMeans (silhouette-selected k) with per-block-weighted features, for the "similar countries" UI. |

The TS synthesis layer no longer derives severity / credibility /
overall-risk from an LLM — it shells out to `pipelines/predict.py` for
those numbers and only asks the LLM for narrative prose.

## Honest disclaimer (read before quoting metrics)

- Trained on **real public data only**: GSI 2023 (Walk Free) for the
  target, WDI 2021 (World Bank) and RSF 2021 (Reporters Without
  Borders) for the predictors. ~153 countries after the inner-join.
  Optional additional sources (WGI / CPI / WJP / UNHCR / ACLED / ILO
  offices / NGOAidMap) are loaded only when their CSV is present
  under `data/raw/` — see [Optional data sources](#optional-data-sources).
- The geographic model is **single-output**: it predicts one number
  per country (overall modern-slavery prevalence per 1,000
  population). The four exploit-type buckets in the output JSON
  (`forced_labor`, `sexual_exploitation`, `children`,
  `illegal_profits`) are obtained by multiplying that single
  prediction by **global proportions from the ILO Global Estimates of
  Modern Slavery 2022** — they are NOT per-country learned. Each
  per-exploit entry in the output JSON carries a
  `global_proportion_source` string saying so.
- The cluster model groups countries by demographic + economic
  similarity by default. Governance / migration / help blocks are
  picked up automatically when their optional CSVs are loaded; per-
  block 1/√(block-size) weighting prevents a large block from
  dominating Euclidean distance.
- The reporting-bias adjuster is **disabled**. Its previous formula
  was the closed-form inverse of the synthetic generator's bias and
  was tautological. See `docs/questionable_choices.md` item #2 and
  `docs/statistical_resolutions.md` item #9.
- The model is **cross-sectional** (one year per country). The
  "year-t → year-(t+1) forecast" claim from the synthetic era was
  dropped because GSI editions are not directly comparable across
  years.

## Layout

```
ml/
├── data/
│   ├── real.py               # base GSI+WDI+RSF + optional source loaders
│   ├── quality.py            # data-quality report (schema, missingness, VIF, skew)
│   ├── sources.py            # citation catalog
│   ├── synthetic_sample.py   # DEPRECATED synthetic generator (sample data only)
│   └── raw/                  # bundled public CSVs (committed)
│       ├── gsi_2023.csv
│       ├── wdi.csv
│       ├── rsf_2021.csv
│       └── README.md         # optional-source CSV conventions
├── features/
│   ├── imputation.py         # region-aware median impute
│   ├── multicollinearity.py  # greedy correlation/VIF drop + PCA collapse
│   └── reporting_bias.py     # DISABLED stub
├── models/
│   ├── geographic.py         # single-output prevalence model
│   └── cluster.py            # KMeans (per-block weighted)
├── eval/
│   ├── performance.py        # train/test split + held-out metrics CLI
│   ├── sanity.py             # categorical distribution of model output
│   ├── ranking.py            # Spearman / top-K vs external reference
│   └── _runtime.py           # shared venv-bootstrap + ASCII table helper
├── pipelines/
│   ├── train_geographic.py   # → artifacts/geographic/{geo_model.joblib, summary.json}
│   ├── train_cluster.py      # → artifacts/cluster/{cluster_model.joblib, panel.csv, summary.json}
│   └── predict.py            # stdin → stdout CLI used by the TS bridge
├── app/
│   ├── build_report.py       # static HTML model report (REAL data)
│   └── build_sample.py       # DEPRECATED synthetic-era report (sample data only)
├── docs/
│   ├── questionable_choices.md
│   └── statistical_resolutions.md
├── Makefile                  # `make models` + `make performance`
├── artifacts/                # outputs (gitignored)
└── requirements.txt
```

## Quickstart

```bash
cd ml
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd ..   # back to the repo root — every -m command runs from here

# 1. inspect the real panel
python -m ml.data.real --check

# 2. train both models (writes joblib artifacts + summary.json)
python -m ml.pipelines.train_geographic
python -m ml.pipelines.train_cluster

# 3. predict for a country (ISO3)
echo '{"country":"KHM"}' | python -m ml.pipelines.predict | jq .

# 4. held-out test performance + categorical sanity test
python -m ml.eval.performance --out perf.txt
python -m ml.eval.sanity      --out sanity.txt

# 5. interactive HTML model report (real data)
python -m ml.app.build_report --country KHM
python -m ml.app.build_report --refresh           # also re-trains both models
# → ml/artifacts/report/index.html
```

Or use the Makefile:

```bash
cd ml
make            # show commands
make models     # train both models + build the HTML report
make performance# held-out perf + categorical sanity, → artifacts/eval/*.txt
```

**All commands must be run from the repository root**, not from `ml/`,
because `python -m foo.bar` requires `foo`'s parent directory on
`sys.path`. The CLIs auto-re-exec under `ml/.venv/bin/python` when
launched from a Python that's missing deps, but they cannot fix a
wrong cwd.

## Data sources

### Always loaded
| Key | Source | Role | File |
| --- | --- | --- | --- |
| `gsi`  | Walk Free, Global Slavery Index 2023 | predicted target (`observed_prevalence_per_1k`) | `data/raw/gsi_2023.csv` |
| `wdi`  | World Bank, World Development Indicators 2021 | predictors (GDP, urbanization, gini, etc.) | `data/raw/wdi.csv` |
| `rsf`  | Reporters Without Borders, Press Freedom 2021 | predictor + bias proxy | `data/raw/rsf_2021.csv` |

### Optional data sources
`data/real.py:load_extended_panel()` left-joins these onto the base
panel **only if** their CSV is present under `data/raw/`. Missing
files do not break anything — the loader is a no-op and the affected
columns are absent from the trained model. CSV conventions:

| File | Required columns | Becomes |
| --- | --- | --- |
| `wgi_2021.csv`      | `iso3, wgi_rule_of_law, wgi_government_effectiveness` | governance block |
| `cpi_2021.csv`      | `iso3, cpi_score`                                      | governance block |
| `wjp_2021.csv`      | `iso3, wjp_civil_justice`                              | governance block |
| `unhcr_2021.csv`    | `iso3, refugee_stock, idp_stock`                       | migration block (normalised to per-1k pop) |
| `acled_2021.csv`    | `iso3, conflict_events`                                | migration block (normalised to per-1m pop) |
| `ilo_offices.csv`   | `iso3, has_office`                                     | help block |
| `ngoaidmap.csv`     | `iso3, project_count`                                  | help block (normalised to per-1m pop) |

`data/sources.py` is the citation catalog. The predict CLI emits a
`sources` block referencing only the keys actually used. Other keys
in the catalog (UNODC, ILOSTAT, etc.) remain future-work references —
the CLI does not fabricate citations for them.

## Methods

### Geographic model — `models/geographic.py`

End-to-end training pipeline inside `train_geographic()`:

1. **Quality scan** (`data/quality.py`) — schema check, per-column NaN
   fraction, |z|>3 outlier counts, Pearson |r|≥0.85 pairs, VIF≥10
   columns, Shapiro-Wilk on `log1p(target)` to decide whether the
   target is log-normal-ish.
2. **Drop high-missingness columns** (>40% NaN by default).
3. **Region-aware median imputation** (`features/imputation.py`) —
   fills NaNs with the GSI-region median when the region has ≥5
   observed values, falls back to the global median otherwise, logs
   which tier was used.
4. **Greedy collinearity reduction**
   (`features/multicollinearity.py`) — for each |r|≥0.85 pair,
   drops the column with higher average correlation against the rest.
5. **Optional log target** — switches to `log1p(y)` when the Shapiro
   test on `log1p(target)` is non-significant (i.e. log-normal-ish).
   `predict()` correctly `expm1`s both the point estimate and the
   conformal interval endpoints.
6. **Auto-scaled Ridge alpha** — `α = min(10, 1 + 0.5·(n_features-5))`
   so wider predictor sets get more shrinkage.
7. **Bagged trees + Ridge fit, averaged** — 8 bootstrap-sampled
   `GradientBoostingRegressor`s plus one Ridge; their predictions are
   averaged. Bag spread fed into the credibility heuristic.

### Cluster model — `models/cluster.py`

KMeans on standardized features. Selects `k ∈ {3..8}` by highest
silhouette score. Per-block weighting (default on): each column is
multiplied by `1/√(block_size)` after StandardScaler, so a 4-column
governance block contributes the same expected variance as a 3-column
demographic block. Same weights re-applied at inference inside
`TrainedClusterModel._transform`. Missing values filled by region-
aware imputation before fitting.

## Validation

### Built into training (`pipelines/train_*.py`)

- **5-fold random KFold** for geographic CV MAE / R² / per-fold
  empirical coverage.
- **Split-conformal prediction intervals** (Vovk et al.) — a 20%
  calibration hold-out gives the (1-α)-quantile of |residual| as a
  fixed half-width. Default α=0.20 (80% nominal coverage).
- **Empirical coverage** measured on KFold test folds with
  within-fold calibration; reported next to the nominal number so the
  consumer can judge if the bands are honestly calibrated.
- **Spearman + top-K Jaccard vs external ranking** (`eval/ranking.py`)
  — utility, not wired into training because we don't have a separate
  reference ranking on the real data (the predicted target *is* the
  GSI ranking).

### Held-out test set — `eval/performance.py`

```bash
python -m ml.eval.performance               # default 80/20, seed=0
python -m ml.eval.performance --test-size 0.25 --seed 42 --out perf.txt
```

Stratifies by GSI region, re-trains via the same `train_geographic()`,
predicts on the held-out rows. Reports:

- MAE, RMSE, R², MAPE (with near-zero guard), mean residual (bias),
  median / max |residual|.
- Nominal vs empirical conformal coverage + mean/median band width;
  auto-warns when empirical coverage falls >8 percentage points under
  nominal.
- Per-region MAE breakdown, sorted descending.
- Top-5 worst residuals named (ISO3 + country + observed + predicted
  + signed residual).
- Cluster fit on the held-out rows (silhouette on training + mean /
  median / max distance to nearest centroid on test).

Numbers jitter materially with `--seed` because n_test ≈ 31. Try
several seeds before drawing conclusions — seed=0 gives MAE 2.13 /
R² 0.31; seed=42 gives MAE 3.09 / R² 0.13.

### Categorical sanity test — `eval/sanity.py`

```bash
python -m ml.eval.sanity                    # stdout
python -m ml.eval.sanity --bins 1.0 --out sanity.txt
```

For every country in the panel, predicts overall prevalence then
reports **n / mean / median / mode / std / min / max** with the named
min-country and max-country, broken down three ways:

1. Overall (one row).
2. By GSI region (one row per region, sorted by mean descending).
3. By ILO exploit bucket (overall × fixed ILO proportion).

Mode is the centre of the most-populated bin (default 0.5/1k width)
because continuous predictions almost never have an exact mode. Also
prints Top 5 / Bottom 5 named countries and a small ASCII histogram
of the prediction distribution.

## Output

### Trained model artifacts

**`artifacts/geographic/`**
- `geo_model.joblib` — pickled `TrainedGeoModel` (sklearn estimators
  + scaler + conformal half-width + quality / imputation /
  collinearity reports + `log_target` flag).
- `summary.json` — JSON-serialised version of the same, plus the
  list of cited sources and the optional blocks actually loaded.

**`artifacts/cluster/`**
- `cluster_model.joblib` — pickled `TrainedClusterModel` (KMeans +
  scaler + per-block weights + centroids + imputation report).
- `panel.csv` — the panel slice the model was fit on; used by the
  predict CLI for `similar_countries` lookups.
- `summary.json` — k, silhouette, block assignments, block weights,
  centroids on the original scale.

**`artifacts/report/index.html`** — static HTML model report built by
`app/build_report.py` (real-data edition). Self-contained, no server
required. Includes:

- model-health metric tiles + quality-flag pills (collinearity drops,
  VIF flags, target transform, coverage),
- country-ranking bar chart (all panel countries sorted by predicted
  prevalence /1k),
- regional box plot,
- mean-bagged GradientBoosting feature importance,
- cluster PCA scatter (with optional star highlight for `--country`),
- per-country detail block (ILO-bucket bars with 80% uncertainty
  whiskers + similar countries table + observed-vs-predicted note),
- data-quality table (per-predictor NaN% + outlier count + whether
  the column survived collinearity reduction),
- source catalog grouped by role.

CDN-loaded plotly.js by default (~65 KB); pass `--inline-js` for a
fully-offline ~4 MB file. `--refresh` re-trains both models before
rendering. `--serve` also serves on `:8765` via stdlib `http.server`.

The previous synthetic-era builder lives at `app/build_sample.py`
(it reads per-exploit `geo_<exploit>.joblib` files and a multi-year
panel — neither of which the real-data pipeline produces). It is
kept for reference and not part of `make models`.

### Predict CLI output schema

```bash
echo '{"country":"KHM"}'                            | python -m ml.pipelines.predict
echo '{"countries":["CHN","VNM","KHM"]}'            | python -m ml.pipelines.predict
echo '{"countries":["CHN","VNM"],"weights":{"CHN":0.7,"VNM":0.3}}' | python -m ml.pipelines.predict
```

Returns one JSON object containing:
- Primary-country top-level fields (back-compat with the existing
  dashboard): `country`, `geographic` (per-exploit prediction +
  uncertainty + per-bucket validation), `geographic_overall` (single
  number + uncertainty), `cluster` (id, k, similar countries), `scores`
  (severity 1-5, credibility 1-5, overall_risk 0-100, rationale),
  `top_drivers` (per-feature contribution scores for the "why"),
  `observed_prevalence_per_1k`, `predicted_vs_observed_delta`.
- `byCountry` — per-country payloads when multiple countries were
  requested.
- `supplyChain` — worst-link severity, weighted prevalence, min
  credibility across the basket.
- `sources` — list of source records referenced by the prediction.

## Bridge to the TS side

The TS synthesis layer (`src/agents/nodes/synthesize.ts`) calls
`predictWithMl()` (`src/agents/ml/predict-bridge.ts`) which shells out
to this CLI. On failure (no `.venv`, unknown ISO3, missing artifacts)
the TS layer raises an `MlBridgeError` with a structured reason code
(`ML_NO_COUNTRY`, `ML_COUNTRY_NOT_IN_PANEL`, `ML_ARTIFACTS_MISSING`,
`ML_CLI_UNREACHABLE`, `ML_CLI_ERROR`) and falls back to a deterministic
`localScoring()` heuristic.

Set `ML_PYTHON_BIN` to point at the Python that has
`ml/requirements.txt` installed (defaults to `ml/.venv/bin/python`).

## Docs

- `docs/questionable_choices.md` — design choices I'd flag in PR
  review, with why and how to improve.
- `docs/statistical_resolutions.md` — what statistical issues the
  expanded predictor set introduced, what code resolves them, what
  remains open for human review.
