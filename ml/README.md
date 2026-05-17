# UnExploited ML

Two trained models that score country-level modern-slavery risk for the
TS synthesis layer:

| Model | File | Purpose |
| --- | --- | --- |
| Geographic prevalence (overall) | `models/geographic.py` | Tree ensemble (bagged GradientBoosting) + Ridge linear, averaged. Random 5-fold CV. Split-conformal prediction intervals. Predicts GSI 2023 overall modern-slavery prevalence per 1,000 population. |
| Demographic + economic similarity | `models/cluster.py` | KMeans (silhouette-selected k) for the "similar countries" UI. |

The TS synthesis layer no longer derives severity / credibility /
overall-risk from an LLM — it shells out to `pipelines/predict.py` for
those numbers and only asks the LLM for narrative prose.

## Honest disclaimer (read before quoting metrics)

- Trained on **real public data only**: GSI 2023 (Walk Free) for the
  target, WDI 2021 (World Bank) and RSF 2021 (Reporters Without
  Borders) for the predictors. ~153 countries after the inner-join.
- The model is **single-output**: it predicts one number per country
  (overall modern-slavery prevalence per 1,000 population). The four
  exploit-type buckets in the output JSON (`forced_labor`,
  `sexual_exploitation`, `children`, `illegal_profits`) are obtained
  by multiplying that single prediction by **global proportions from
  the ILO Global Estimates of Modern Slavery 2022** — they are NOT
  per-country learned. Each per-exploit entry in the output JSON
  carries a `global_proportion_source` string saying so.
- The cluster model groups countries by **demographic + economic**
  similarity. The governance / migration / help blocks named in
  `data/real.py` are empty in this data tier (would need WGI, UNHCR,
  etc. to populate).
- The reporting-bias adjuster is **disabled**. Its previous formula
  was the closed-form inverse of the synthetic generator's bias and
  was tautological. See `docs/questionable_choices.md` item #2.
- The model is **cross-sectional** (one year per country). The "year-t
  → year-(t+1) forecast" claim from the synthetic era was dropped
  because GSI editions are not directly comparable across years.

## Layout

```
ml/
├── data/
│   ├── real.py               # GSI + WDI + RSF panel loader
│   ├── sources.py            # citation catalog
│   └── raw/                  # bundled public CSVs (committed)
│       ├── gsi_2023.csv
│       ├── wdi.csv
│       ├── rsf_2021.csv
│       └── README.md
├── features/
│   └── reporting_bias.py     # DISABLED stub; raises NotImplementedError
├── models/
│   ├── geographic.py         # single-output prevalence model
│   └── cluster.py            # KMeans (NB removed)
├── eval/
│   └── ranking.py            # unused on real data; kept as utility
├── pipelines/
│   ├── train_geographic.py   # → artifacts/geographic/{geo_model.joblib, summary.json}
│   ├── train_cluster.py      # → artifacts/cluster/{cluster_model.joblib, panel.csv, summary.json}
│   └── predict.py            # stdin → stdout CLI used by the TS bridge
├── docs/
│   └── questionable_choices.md
├── artifacts/                # outputs (gitignored)
└── requirements.txt
```

## Quickstart

```bash
cd ml
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd ..

# 1. inspect the real panel
python -m ml.data.real --check

# 2. train both models (writes joblib artifacts + summary.json)
python -m ml.pipelines.train_geographic
python -m ml.pipelines.train_cluster

# 3. predict for a country (ISO3)
echo '{"country":"KHM"}' | python -m ml.pipelines.predict | jq .
```

All three commands must be run from the **repository root**, not from
`ml/`, because the predict CLI uses `python -m ml.pipelines.predict`
package-relative imports.

## Validation summary (one real-data run)

Numbers from a single training run with `seed=0`. They will vary
slightly with re-seeded splits; what matters is that the order of
magnitude is honest (no inflated R² from synthetic-data leakage).

### Geographic model

| Metric | Value | Note |
| --- | ---: | --- |
| Training rows | 153 | inner-join of GSI 2023 + WDI 2021 + RSF 2021 |
| CV MAE | ~2.2 / 1k | over 5-fold random KFold |
| CV R² | ~0.27 | real-world prediction is genuinely hard; R² >> 0.9 would indicate a leak |
| Conformal half-width | ~3.0 / 1k | nominal 80% marginal coverage |
| Empirical 80% coverage | ~0.66 | measured on KFold test folds with within-fold calibration |

The gap between nominal (0.80) and empirical (~0.66) coverage is a
known small-sample effect of split-conformal: the per-fold calibration
set is only ~25 rows. The CLI returns both numbers so the consumer can
judge — we don't smooth this over. With more training data (multi-year
panel, or adding WGI/UNHCR), coverage would tighten toward 0.80.

### Cluster model

- k = 3 selected by silhouette over k ∈ {3..8}
- silhouette = 0.282
- 153 countries
- Feature blocks: demographic + economic (6 features total)

## Bridge to the TS side

The TS synthesis layer (`src/agents/nodes/synthesize.ts`) calls
`predictWithMl()` (`src/agents/ml/predict-bridge.ts`) which shells out
to this CLI. On failure (no `.venv`, unknown ISO3, missing artifacts)
the TS layer logs a warning to stderr and falls back to a deterministic
`localScoring()` heuristic.

Set `ML_PYTHON_BIN` to point at the Python that has `ml/requirements.txt`
installed (defaults to `ml/.venv/bin/python`).

## Data sources

`data/sources.py` is the citation catalog. The predict CLI emits a
`sources` block referencing only the keys actually used (`gsi` as the
predicted source, `wdi` + `rsf` as the predictors). The catalog
contains other keys (UNODC, ILOSTAT, ACLED, etc.) that are NOT yet
integrated — those remain a future-work reference and the CLI does not
fabricate citations for them.
