"""Static-HTML model report — all logic in this single .py file.

No server, no telemetry, no first-run prompts. The script auto-detects
the project venv (`ml/.venv/bin/python`) and re-execs itself there if
the user invoked it under a python that's missing the ML deps, so the
following invocation just works from anywhere:

    python -m ml.app.build_report
    # → wrote ml/artifacts/report/index.html

Optional flags:
    --country C012     # adds a per-country detail block (year still selectable)
    --year 2019        # initial year selected on the sliders (default: latest)
    --serve            # also serves the report on :8765 via stdlib http.server
    --inline-js        # embed plotly.js (~4MB) instead of loading from CDN

The page bundles:
  1. Model-health summary metrics + per-exploit validation table.
  2. Year-sliderable country × exploit ranking heatmap (drag the slider
     under the heatmap to switch which year-t features drive the
     prediction; the country sort order recomputes per year).
  3. Cluster panel: PCA scatter coloured by cluster + centroid table +
     dominant-exploit-per-cluster table.
  4. Optional per-country detail: year-sliderable prevalence bars with
     80% uncertainty whiskers, year-sliderable NB class probabilities,
     deterministic scores per year, similar-countries per year.
  5. Source catalog grouped by role.
"""

from __future__ import annotations

# Self-relocate to the project venv if the user invoked us under a python
# that doesn't have the ML deps. This means `python -m ml.app.build_report`
# works from any python interpreter as long as ml/.venv exists.
import os, sys
from pathlib import Path as _Path
_REPO_ROOT = _Path(__file__).resolve().parents[2]
_VENV_PY = _REPO_ROOT / "ml" / ".venv" / "bin" / "python"
try:
    import joblib  # noqa: F401
except ModuleNotFoundError:
    # `sys.prefix` differs from `sys.base_prefix` only when running inside
    # a venv — that's the reliable "are we already in the venv" check
    # (resolving the python symlink doesn't work; the venv python is
    # usually a symlink straight back to the system interpreter).
    _venv_root = _REPO_ROOT / "ml" / ".venv"
    _in_target_venv = _Path(sys.prefix).resolve() == _venv_root.resolve()
    if _VENV_PY.exists() and not _in_target_venv:
        print(f"re-exec under project venv: {_VENV_PY}", file=sys.stderr)
        os.execv(str(_VENV_PY), [str(_VENV_PY), "-m", "ml.app.build_report", *sys.argv[1:]])
    print(
        "Missing dependency 'joblib'. Install the ML requirements first:\n"
        f"  {sys.executable} -m pip install -r {_REPO_ROOT / 'ml' / 'requirements.txt'}",
        file=sys.stderr,
    )
    sys.exit(1)

import argparse
import json
import webbrowser
from html import escape
from pathlib import Path
from typing import Dict, List, Tuple

import joblib
import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from sklearn.decomposition import PCA

# Make `from ml.* import ...` work no matter where this is launched from.
REPO_ROOT = _REPO_ROOT
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ml.data.real import EXPLOIT_TYPES, PREDICTOR_COLS  # noqa: E402
from ml.models.cluster import TrainedClusterModel  # noqa: E402
from ml.models.geographic import TrainedGeoModel  # noqa: E402


GEO_DIR = REPO_ROOT / "ml" / "artifacts" / "geographic"
CLUSTER_DIR = REPO_ROOT / "ml" / "artifacts" / "cluster"
PANEL_PATH = REPO_ROOT / "ml" / "artifacts" / "synthetic" / "panel.csv"
REPORT_DIR = REPO_ROOT / "ml" / "artifacts" / "report"


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------
def _require(path: Path) -> None:
    if not path.exists():
        print(
            f"missing artifact: {path}\n"
            "run training first:\n"
            "  python -m ml.data.synthetic\n"
            "  python -m ml.pipelines.train_geographic\n"
            "  python -m ml.pipelines.train_cluster",
            file=sys.stderr,
        )
        sys.exit(1)


def load_everything():
    _require(PANEL_PATH)
    _require(CLUSTER_DIR / "cluster_model.joblib")
    geo: Dict[str, TrainedGeoModel] = {}
    for e in EXPLOIT_TYPES:
        path = GEO_DIR / f"geo_{e}.joblib"
        _require(path)
        geo[e] = joblib.load(path)
    cluster: TrainedClusterModel = joblib.load(CLUSTER_DIR / "cluster_model.joblib")
    panel = pd.read_csv(PANEL_PATH)
    wide = pd.read_csv(CLUSTER_DIR / "country_year_wide.csv")
    geo_summary = json.loads((GEO_DIR / "summary.json").read_text())
    clu_summary = json.loads((CLUSTER_DIR / "summary.json").read_text())
    return geo, cluster, panel, wide, geo_summary, clu_summary


# ---------------------------------------------------------------------------
# Chart builders — each returns the plotly figure as an HTML fragment.
# ---------------------------------------------------------------------------
def _fig_to_div(fig: go.Figure, include_plotlyjs: str | bool) -> str:
    return fig.to_html(
        include_plotlyjs=include_plotlyjs,
        full_html=False,
        config={"displaylogo": False},
    )


def _predictions_for_year(
    geo: Dict[str, TrainedGeoModel],
    panel: pd.DataFrame,
    year: int,
) -> pd.DataFrame:
    """Country × exploit predicted-prevalence table for a single year-t."""
    year_rows = panel[panel["year"] == year].copy()
    year_rows["lag_observed"] = year_rows["observed_prevalence_per_1k"].values

    rows: Dict[str, Dict[str, float]] = {}
    for exploit in EXPLOIT_TYPES:
        sub = year_rows[year_rows["exploit_type"] == exploit]
        preds = geo[exploit].predict(sub[PREDICTOR_COLS + ["lag_observed"]])["mean"]
        for c, v in zip(sub["country"].values, preds):
            rows.setdefault(c, {})[exploit] = float(v)
    return pd.DataFrame.from_dict(rows, orient="index")[EXPLOIT_TYPES]


def ranking_heatmap(
    geo: Dict[str, TrainedGeoModel],
    panel: pd.DataFrame,
    years: List[int],
    include_plotlyjs: str | bool,
    initial_year: int | None = None,
) -> str:
    """One heatmap trace per year; a slider toggles which year is shown.

    Country rows are sorted by total predicted prevalence within each
    year independently — so the "worst row first" ordering re-sorts as
    you move the slider.
    """
    if initial_year is None:
        initial_year = years[0]

    fig = go.Figure()
    sorted_indexes: List[List[str]] = []
    for i, year in enumerate(years):
        df = _predictions_for_year(geo, panel, year)
        df = df.loc[df.sum(axis=1).sort_values(ascending=False).index]
        sorted_indexes.append(df.index.tolist())
        fig.add_trace(go.Heatmap(
            z=df.values,
            x=EXPLOIT_TYPES,
            y=df.index.tolist(),
            colorscale="Reds",
            visible=(year == initial_year),
            name=str(year),
            colorbar=dict(title="pred /1k"),
            hovertemplate=("country: %{y}<br>exploit: %{x}<br>"
                           "predicted /1k: %{z:.3f}<extra></extra>"),
        ))

    # Slider — args swaps trace visibility + retitles the figure.
    steps = []
    for i, year in enumerate(years):
        steps.append(dict(
            method="update",
            args=[
                {"visible": [j == i for j in range(len(years))]},
                {"title": f"Predicted prevalence per 1,000 "
                          f"(year-t features = {year}, target = {year + 1})"},
            ],
            label=str(year),
        ))
    initial_idx = years.index(initial_year)
    sliders = [dict(
        active=initial_idx,
        currentvalue={"prefix": "year-t features: "},
        pad={"t": 40},
        steps=steps,
    )]

    # Use the maximum row count across years to keep height stable.
    max_rows = max(len(idx) for idx in sorted_indexes)
    fig.update_layout(
        title=f"Predicted prevalence per 1,000 "
              f"(year-t features = {initial_year}, target = {initial_year + 1})",
        height=max(460, 14 * max_rows),
        margin=dict(l=10, r=10, t=50, b=80),
        sliders=sliders,
    )
    return _fig_to_div(fig, include_plotlyjs)


def cluster_pca_scatter(
    cluster: TrainedClusterModel,
    wide: pd.DataFrame,
    include_plotlyjs: str | bool,
    highlight: tuple[str, int] | None = None,
) -> str:
    """2-D PCA of all country-years, coloured by cluster."""
    Xs = cluster.scaler.transform(wide[cluster.feature_cols])
    labels = cluster.kmeans.predict(Xs)
    pc = PCA(n_components=2).fit_transform(Xs)
    df = pd.DataFrame({
        "PC1": pc[:, 0], "PC2": pc[:, 1],
        "cluster": labels.astype(str),
        "country": wide["country"], "year": wide["year"],
    })

    fig = px.scatter(
        df, x="PC1", y="PC2", color="cluster",
        hover_data={"country": True, "year": True,
                    "PC1": ":.2f", "PC2": ":.2f"},
        height=460,
        title="Country-years projected to 2 components, coloured by cluster",
    )
    if highlight is not None:
        hc, hy = highlight
        sel = df[(df["country"] == hc) & (df["year"] == hy)]
        if not sel.empty:
            fig.add_trace(go.Scatter(
                x=sel["PC1"], y=sel["PC2"],
                mode="markers",
                marker=dict(symbol="star", size=20, color="#000",
                            line=dict(color="#fff", width=1)),
                name=f"selected ({hc}, {hy})",
                hoverinfo="skip",
            ))
    fig.update_layout(margin=dict(l=10, r=10, t=40, b=10))
    return _fig_to_div(fig, include_plotlyjs)


def country_detail_chart(
    geo: Dict[str, TrainedGeoModel],
    cluster: TrainedClusterModel,
    panel: pd.DataFrame,
    wide: pd.DataFrame,
    country: str,
    years: List[int],
    include_plotlyjs: str | bool,
    initial_year: int | None = None,
) -> Tuple[str, str, str]:
    """Per-country detail: one bar trace per year (slider-toggled),
    NB-prob bar that also re-slides per year, and the most-recent
    similar-countries / scores tables.

    Returns (prevalence-bar-html, nb-prob-html, similar+scores-html).
    """
    if initial_year is None:
        initial_year = years[-1]

    # ----- Prevalence bar (one trace per year, year slider) -----
    fig_bar = go.Figure()
    score_rows = []
    for year in years:
        row = panel[(panel["country"] == country) & (panel["year"] == year)]
        if row.empty:
            # Add an empty placeholder so trace indices stay aligned with years.
            fig_bar.add_trace(go.Bar(x=EXPLOIT_TYPES, y=[0] * len(EXPLOIT_TYPES),
                                     visible=(year == initial_year), name=str(year)))
            score_rows.append({"year": year, "severity": None, "credibility": None,
                               "overall_risk": None})
            continue
        one = row.iloc[[0]].copy()
        one["lag_observed"] = one["observed_prevalence_per_1k"].values
        means, lows, ups = [], [], []
        for e in EXPLOIT_TYPES:
            out = geo[e].predict(one[PREDICTOR_COLS + ["lag_observed"]])
            means.append(float(out["mean"][0]))
            lows.append(float(out["lower"][0]))
            ups.append(float(out["upper"][0]))
        fig_bar.add_trace(go.Bar(
            x=EXPLOIT_TYPES, y=means, marker_color="#b04a3a",
            error_y=dict(type="data", symmetric=False,
                         array=np.array(ups) - np.array(means),
                         arrayminus=np.array(means) - np.array(lows),
                         color="#333"),
            visible=(year == initial_year), name=str(year),
        ))
        # Scores per year for the table below.
        max_pred = max(means)
        mean_spread = float(np.mean(np.array(ups) - np.array(lows))) / 2
        sev = int(min(5, max(1, round(1 + max_pred * 4))))
        cred = int(min(5, max(1, round(5 - mean_spread * 4))))
        ovr = int(min(100, max(0, round(sev * 12 + sum(means) * 15 + cred * 4))))
        score_rows.append({"year": year, "severity": sev,
                           "credibility": cred, "overall_risk": ovr})

    bar_steps = []
    for i, year in enumerate(years):
        bar_steps.append(dict(
            method="update",
            args=[
                {"visible": [j == i for j in range(len(years))]},
                {"title": f"Predicted prevalence with 80% uncertainty — "
                          f"{country} (year-t={year}, target={year + 1})"},
            ],
            label=str(year),
        ))
    fig_bar.update_layout(
        height=340, margin=dict(l=10, r=10, t=50, b=80),
        yaxis_title="prevalence /1k",
        title=f"Predicted prevalence with 80% uncertainty — "
              f"{country} (year-t={initial_year}, target={initial_year + 1})",
        sliders=[dict(active=years.index(initial_year),
                      currentvalue={"prefix": "year-t features: "},
                      pad={"t": 40}, steps=bar_steps)],
    )

    # ----- NB class probabilities (one trace per year, year slider) -----
    fig_nb = go.Figure()
    for year in years:
        target_row = wide[(wide["country"] == country) & (wide["year"] == year)]
        if target_row.empty:
            fig_nb.add_trace(go.Bar(x=[0], y=["—"], orientation="h",
                                    visible=(year == initial_year), name=str(year)))
            continue
        nb_out = cluster.predict_exploit(target_row[cluster.feature_cols])
        proba_df = pd.DataFrame({
            "exploit": list(nb_out["classes"]),
            "probability": nb_out["proba"][0],
        }).sort_values("probability", ascending=True)
        fig_nb.add_trace(go.Bar(
            x=proba_df["probability"], y=proba_df["exploit"], orientation="h",
            marker=dict(color=proba_df["probability"], colorscale="Reds",
                        cmin=0, cmax=1),
            visible=(year == initial_year), name=str(year),
        ))
    nb_steps = []
    for i, year in enumerate(years):
        nb_steps.append(dict(
            method="update",
            args=[
                {"visible": [j == i for j in range(len(years))]},
                {"title": f"Naive-Bayes dominant-exploit probability — "
                          f"{country} (year {year})"},
            ],
            label=str(year),
        ))
    fig_nb.update_layout(
        height=280, margin=dict(l=10, r=10, t=50, b=80),
        title=f"Naive-Bayes dominant-exploit probability — "
              f"{country} (year {initial_year})",
        xaxis_range=[0, 1],
        sliders=[dict(active=years.index(initial_year),
                      currentvalue={"prefix": "year: "},
                      pad={"t": 40}, steps=nb_steps)],
    )

    # ----- Tables: scores per year + similar countries (latest available year) -----
    scores_df = pd.DataFrame(score_rows)
    scores_html = (
        "<h3>Deterministic scores (CLI formula, by year)</h3>"
        + scores_df.to_html(index=False, classes="data-table", border=0,
                            na_rep="—")
    )

    similar_html_parts = []
    for year in years:
        if not ((wide["country"] == country) & (wide["year"] == year)).any():
            continue
        sim = cluster.similar_countries(wide, country, year, top_n=8)
        if sim.empty:
            continue
        cols = ["country", "distance_to_target"] + cluster.feature_cols[:4]
        sim_table = sim[cols].round(3).to_html(index=False, classes="data-table", border=0)
        similar_html_parts.append(
            f"<details {'open' if year == initial_year else ''}>"
            f"<summary>Similar countries — year {year}</summary>{sim_table}</details>"
        )
    similar_html = "\n".join(similar_html_parts) or "<p><em>No similar countries available.</em></p>"

    return (
        _fig_to_div(fig_bar, include_plotlyjs),
        _fig_to_div(fig_nb, False),
        scores_html + "<h3>Similar countries (per year)</h3>" + similar_html,
    )


# ---------------------------------------------------------------------------
# HTML assembly
# ---------------------------------------------------------------------------
CSS = """
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
       margin: 0; padding: 32px 48px; max-width: 1280px; color: #1a1a1a;
       background: #fafafa; }
h1 { font-size: 28px; margin-bottom: 4px; }
h2 { font-size: 20px; margin-top: 40px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
h3 { font-size: 16px; margin-top: 24px; }
p.subtitle { color: #555; margin-top: 0; }
section { background: #fff; padding: 16px 20px; margin-top: 12px;
          border: 1px solid #e5e5e5; border-radius: 6px; }
.metric-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.metric { padding: 12px 16px; background: #f5f5f5; border-radius: 4px; }
.metric .label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.05em; }
.metric .value { font-size: 22px; font-weight: 600; margin-top: 4px; }
table.data-table { border-collapse: collapse; width: 100%; font-size: 13px; }
table.data-table th, table.data-table td { border-bottom: 1px solid #eee; padding: 6px 8px;
                                            text-align: left; }
table.data-table th { background: #f5f5f5; font-weight: 600; }
.two-col { display: grid; grid-template-columns: 2fr 3fr; gap: 16px; }
details summary { cursor: pointer; font-weight: 600; padding: 4px 0; }
details { margin-top: 8px; }
.caption { color: #666; font-size: 12px; margin-top: 6px; }
ul.source-list { padding-left: 20px; }
ul.source-list li { margin-bottom: 6px; font-size: 13px; }
ul.source-list a { color: #b04a3a; }
"""


def render_html(
    geo: Dict[str, TrainedGeoModel],
    cluster: TrainedClusterModel,
    panel: pd.DataFrame,
    wide: pd.DataFrame,
    geo_summary: dict,
    clu_summary: dict,
    include_plotlyjs: str | bool,
    country: str | None = None,
    year: int | None = None,
) -> str:
    # Only years that have a year-(t+1) target available are useful for
    # the geographic model. Drop the last year of the panel.
    all_years = sorted(panel["year"].unique().tolist())
    trainable_years = all_years[:-1]
    initial_year = year if year in trainable_years else trainable_years[-1]

    # Headline metrics.
    geo_exp = geo_summary["exploit_types"]
    metric_html = (
        "<div class='metric-row'>"
        f"<div class='metric'><div class='label'>Geographic CV MAE (mean)</div>"
        f"<div class='value'>{np.mean([v['cv_mae'] for v in geo_exp.values()]):.3f}</div></div>"
        f"<div class='metric'><div class='label'>Geographic CV R² (mean)</div>"
        f"<div class='value'>{np.mean([v['cv_r2'] for v in geo_exp.values()]):+.3f}</div></div>"
        f"<div class='metric'><div class='label'>Cluster silhouette</div>"
        f"<div class='value'>{clu_summary['silhouette']:.3f}</div></div>"
        f"<div class='metric'><div class='label'>NB holdout accuracy</div>"
        f"<div class='value'>{clu_summary['nb_holdout_accuracy']:.3f}</div></div>"
        "</div>"
    )

    # Per-exploit validation table.
    validation_df = pd.DataFrame([
        {"exploit": e, **v} for e, v in geo_exp.items()
    ])[["exploit", "cv_mae", "cv_r2", "spearman_vs_gsi", "top10_jaccard_vs_gsi"]]
    validation_html = validation_df.to_html(index=False, classes="data-table", border=0)

    # Cluster centroids + dominant-exploit table.
    centroids_df = pd.DataFrame(clu_summary["centroids"])
    centroids_html = centroids_df.to_html(index=False, classes="data-table", border=0,
                                          float_format=lambda x: f"{x:.2f}")
    dominant_df = pd.DataFrame([
        {"cluster": k, "dominant_exploit": v}
        for k, v in clu_summary["cluster_dominant_exploit"].items()
    ])
    dominant_html = dominant_df.to_html(index=False, classes="data-table", border=0)

    # Ranking heatmap — all years pre-rendered, year slider switches view.
    heatmap_html = ranking_heatmap(
        geo, panel, trainable_years, include_plotlyjs, initial_year=initial_year,
    )

    # Cluster PCA scatter — pull in plotly.js only once (already loaded above).
    scatter_html = cluster_pca_scatter(
        cluster, wide, False,
        highlight=(country, initial_year) if country else None,
    )

    # Optional per-country detail section (also year-sliderable).
    country_section = ""
    if country:
        bar_html, nb_html, tables_html = country_detail_chart(
            geo, cluster, panel, wide, country,
            trainable_years, include_plotlyjs=False,
            initial_year=initial_year,
        )
        country_section = f"""
<h2>Country detail — {escape(country)}</h2>
<section>
  <div class='two-col'>
    <div>{bar_html}</div>
    <div>{nb_html}</div>
  </div>
  {tables_html}
</section>
"""

    # Sources panel.
    src_html_parts = []
    for label, key in [
        ("Predicted variables", "predicted"),
        ("Predictors", "predictors"),
        ("Bias adjuster", "bias_adjuster"),
    ]:
        items = geo_summary["sources"][key]
        lis = "".join(
            f"<li><strong>{escape(s['name'])}</strong> — {escape(s['publisher'])} "
            f"<br><a href='{escape(s['url'])}'>{escape(s['url'])}</a></li>"
            for s in items
        )
        src_html_parts.append(
            f"<details><summary>{label} ({len(items)})</summary>"
            f"<ul class='source-list'>{lis}</ul></details>"
        )
    sources_html = "\n".join(src_html_parts)

    head_country = (
        f" (showing detail for <strong>{escape(country)}</strong>)"
        if country else ""
    )

    return f"""<!DOCTYPE html>
<html lang='en'>
<head>
  <meta charset='utf-8'>
  <title>LaborLens ML — model report</title>
  <style>{CSS}</style>
</head>
<body>
  <h1>LaborLens ML — model report</h1>
  <p class='subtitle'>
    Generated from <code>ml/artifacts/</code>. Geographic targets are year-(t+1) prevalence.
    Use the year slider on the heatmap below to switch which year's
    features drive the prediction.{head_country}
  </p>

  <h2>Model health</h2>
  <section>
    {metric_html}
    <p class='caption'>
      Validation: GroupKFold by country (year-t features → year-(t+1) target).
      Spearman / Jaccard compare model ranking to the synthetic GSI-proxy ranking —
      external sanity check, not a training signal.
    </p>
    <h3>Per-exploit validation</h3>
    {validation_html}
  </section>

  <h2>Geographic ranking</h2>
  <section>
    <p class='caption'>
      Rows are countries (worst total first), columns are exploit types,
      colour intensity is predicted prevalence per 1,000.
    </p>
    {heatmap_html}
  </section>

  <h2>Cluster panel</h2>
  <section>
    {scatter_html}
    <div class='two-col' style='margin-top:16px;'>
      <div>
        <h3>Dominant exploit per cluster</h3>
        {dominant_html}
      </div>
      <div>
        <h3>Cluster centroids</h3>
        {centroids_html}
      </div>
    </div>
    <p class='caption'>
      k chosen by silhouette over k=3..8. Centroids reported on the
      original (unscaled) feature scale. Dominant exploit is the modal
      argmax label inside the cluster.
    </p>
  </section>

  {country_section}

  <h2>Sources</h2>
  <section>{sources_html}</section>

  <p class='caption' style='margin-top:40px;'>
    Single self-contained HTML — no server, no telemetry. Re-run
    <code>python -m ml.app.build_report</code> after retraining to refresh.
  </p>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# Serve helper — purely optional, stdlib only.
# ---------------------------------------------------------------------------
def serve(directory: Path, port: int = 8765) -> None:
    import functools, http.server, socketserver

    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(directory))
    with socketserver.TCPServer(("127.0.0.1", port), handler) as httpd:
        url = f"http://127.0.0.1:{port}/index.html"
        print(f"serving {directory} at {url}  (Ctrl-C to stop)")
        try:
            webbrowser.open(url)
        except Exception:
            pass
        httpd.serve_forever()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main():
    # The HTML report generator was written for the synthetic
    # per-exploit-per-year panel. The real-data tier (GSI 2023 + WDI
    # 2021 + RSF 2021) is cross-sectional and single-output, so this
    # generator no longer matches the artifact layout. Until it is
    # rewritten, fail loudly rather than producing a misleading report.
    print(
        "ml.app.build_report has not been updated for the real-data, "
        "single-output cross-sectional pipeline. See ml/README.md.",
        file=sys.stderr,
    )
    sys.exit(2)
    p = argparse.ArgumentParser(description="Generate a static HTML model report.")
    p.add_argument("--country", help="Optional country code to show detail for.")
    p.add_argument("--year", type=int,
                   help="Initial year selected on the year sliders. Default: latest trainable year.")
    p.add_argument("--inline-js", action="store_true",
                   help="Embed plotly.js inline (~4MB) instead of loading from CDN.")
    p.add_argument("--serve", action="store_true",
                   help="Also serve the report on http://127.0.0.1:8765/.")
    p.add_argument("--out", default=str(REPORT_DIR),
                   help="Output directory (default: ml/artifacts/report).")
    args = p.parse_args()

    geo, cluster, panel, wide, geo_summary, clu_summary = load_everything()

    include_js = True if args.inline_js else "cdn"
    html = render_html(
        geo, cluster, panel, wide, geo_summary, clu_summary,
        include_plotlyjs=include_js,
        country=args.country, year=args.year,
    )

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "index.html"
    out_path.write_text(html, encoding="utf-8")
    print(f"wrote {out_path}  ({out_path.stat().st_size / 1024:.1f} KB)")
    print(f"open: file://{out_path.resolve()}")

    if args.serve:
        serve(out_dir)


if __name__ == "__main__":
    main()
