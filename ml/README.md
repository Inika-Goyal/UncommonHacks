# UnExploited ML

Two trained models that predict and contextualise labor / sexual /
child / illegal-profits exploitation across countries:

| Model | File | Purpose |
| --- | --- | --- |
| Geographic prevalence (per exploit type) | `models/geographic.py` | Tree ensemble (bagged GradientBoosting) + Ridge linear, averaged. Country-level GroupKFold holdout. Year-t features → year-(t+1) target. Uncertainty bands from bag variance + cross-family disagreement. |
| Demographic / economic / migration / help similarity | `models/cluster.py` | KMeans (silhouette-selected k) for "similar countries"; Gaussian Naive Bayes for dominant-exploit-type classification. |

The TypeScript synthesis layer no longer derives severity / credibility /
overall-risk from an LLM — it shells out to `pipelines/predict.py` for
those numbers and only asks the LLM for narrative prose.

## Layout

```
ml/
├── data/
│   ├── synthetic.py          # country×year×exploit panel generator
│   └── sources.py            # catalog of upstream data sources for citations
├── features/
│   └── reporting_bias.py     # press-freedom adjuster (RSF)
├── models/
│   ├── geographic.py         # per-exploit prevalence model
│   └── cluster.py            # KMeans + Naive Bayes
├── eval/
│   └── ranking.py            # Spearman / top-K vs GSI reference
├── pipelines/
│   ├── train_geographic.py   # trains 4 geographic models, writes joblib + summary.json
│   ├── train_cluster.py      # trains cluster + NB, writes joblib + summary.json
│   └── predict.py            # stdin→stdout CLI used by the TS agents
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

# 1. generate the synthetic test panel (also re-runs to refresh)
python -m ml.data.synthetic

# 2. train both models (writes joblib artifacts + summary.json)
python -m ml.pipelines.train_geographic
python -m ml.pipelines.train_cluster

# 3. predict for a (country, year)
echo '{"country":"C012","year":2021}' | python -m ml.pipelines.predict | jq .
```

All three commands must be run from the **repository root**, not from
`ml/`, because the predict CLI uses `python -m ml.pipelines.predict`
package-relative imports.

## Validation summary

The numbers below come from one run on the synthetic panel (60 countries
× 8 years × 4 exploits). Real-data numbers will look different, but the
metric set is the same.

### Geographic model

| Exploit type | CV MAE | CV R² | Spearman vs GSI | Top-10 Jaccard vs GSI |
| --- | ---: | ---: | ---: | ---: |
| forced_labor | 0.24 | 0.74 | 0.94 | 1.00 |
| illegal_profits | 0.25 | 0.63 | 0.92 | 0.67 |
| sexual_exploitation | 0.24 | 0.35 | 0.79 | 0.33 |
| children | 0.23 | 0.56 | 0.91 | 0.54 |

Cross-validation is GroupKFold by country, so the metrics describe how
well the model generalises to **countries it has never seen**.

### Cluster model

- k = 4 selected by silhouette (0.22)
- Gaussian NB holdout accuracy: 0.56 (vs ~0.25 random baseline)
- Validation split: GroupShuffleSplit by country, 25% test

## Report

Self-contained static HTML — no server, no telemetry, no first-run
prompts. The script auto-detects `ml/.venv/bin/python` and re-execs
itself there, so you can launch it under any python:

```bash
# basic report (overview only)
python -m ml.app.build_report

# include a per-country detail section (year is selectable in the report)
python -m ml.app.build_report --country C012

# pick the initial year shown on the sliders
python -m ml.app.build_report --year 2019

# fully offline (embeds plotly.js inline, ~4MB instead of ~115KB)
python -m ml.app.build_report --inline-js

# also serve it on localhost via stdlib http.server
python -m ml.app.build_report --serve
```

Output: `ml/artifacts/report/index.html`. Open it in any browser
(`file://`). The geographic ranking heatmap and the per-country detail
charts each have a **year slider** — drag it to switch which year-t
features drive the prediction; the country sort order and uncertainty
bands recompute per year.

Sections in the report:

- **Model health**: mean CV MAE / R² for the geographic model,
  silhouette + NB holdout accuracy for the cluster model, plus a
  per-exploit validation table with Spearman & top-K vs the GSI proxy.
- **Geographic ranking**: countries × exploits heatmap, sorted by total
  predicted prevalence so the worst row is on top.
- **Cluster panel**: PCA scatter of all country-years coloured by
  cluster (selected country marked with a star when `--country` is set),
  plus dominant-exploit-per-cluster and centroid tables.
- **Country detail** *(optional)*: per-exploit bar with 80% uncertainty
  whiskers, Naive-Bayes class-probability bar, deterministic scores
  (same formula the CLI uses), and a similar-countries table.
- **Sources**: collapsible lists grouped by role (predicted / predictor
  / bias adjuster), sourced from `ml/data/sources.py`.

If you see "missing artifact" on launch, run the training pipelines first.

## Data sources

`data/sources.py` is the single source of truth for citation metadata.
Anything the synthesis layer attaches to a report should pass through
`sources_for([keys...])` so a removed/renamed source breaks loudly
instead of silently dropping citations.
