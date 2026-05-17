"""Static-HTML model report — REAL DATA edition.

This file replaces the synthetic-era report (now `build_sample.py`).
It reads the real-data artifacts produced by:

    python -m ml.pipelines.train_geographic
    python -m ml.pipelines.train_cluster

and renders a single self-contained HTML file with no server,
telemetry, or first-run prompts. The page reflects what the real
model actually does: one prediction per country (cross-sectional),
ILO-bucket splits as a constant proportion, a country dropdown for
drill-down, and the data-quality + collinearity reports the trainer
emitted.

Run from the repo root (or anywhere — the script auto-relocates):

    python -m ml.app.build_report
    python -m ml.app.build_report --country KHM
    python -m ml.app.build_report --serve         # also http.serve on :8765
    python -m ml.app.build_report --inline-js     # offline ~4MB
    python -m ml.app.build_report --refresh       # re-train both models first

Output: ml/artifacts/report/index.html
"""

from __future__ import annotations

# --- venv self-relocate ----------------------------------------------------
import os, sys
from pathlib import Path as _Path
_REPO_ROOT = _Path(__file__).resolve().parents[2]
_VENV_PY = _REPO_ROOT / "ml" / ".venv" / "bin" / "python"
try:
    import joblib  # noqa: F401
except ModuleNotFoundError:
    _venv_root = _REPO_ROOT / "ml" / ".venv"
    _in_target_venv = _Path(sys.prefix).resolve() == _venv_root.resolve()
    if _VENV_PY.exists() and not _in_target_venv:
        print(f"re-exec under project venv: {_VENV_PY}", file=sys.stderr)
        os.chdir(_REPO_ROOT)
        os.execv(str(_VENV_PY), [str(_VENV_PY), "-m", "ml.app.build_report", *sys.argv[1:]])
    print(
        "Missing dependency 'joblib'. Install the ML requirements first:\n"
        f"  {sys.executable} -m pip install -r {_REPO_ROOT / 'ml' / 'requirements.txt'}",
        file=sys.stderr,
    )
    sys.exit(1)

import argparse
import json
import subprocess
import webbrowser
from html import escape
from pathlib import Path
from typing import Any, Dict, List

import joblib
import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from sklearn.decomposition import PCA

REPO_ROOT = _REPO_ROOT
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ml.data.real import ILO_GLOBAL_PROPORTIONS, load_extended_panel  # noqa: E402
from ml.models.cluster import TrainedClusterModel  # noqa: E402
from ml.models.geographic import TrainedGeoModel  # noqa: E402


GEO_DIR = REPO_ROOT / "ml" / "artifacts" / "geographic"
CLUSTER_DIR = REPO_ROOT / "ml" / "artifacts" / "cluster"
REPORT_DIR = REPO_ROOT / "ml" / "artifacts" / "report"


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------
def _require(path: Path) -> None:
    if not path.exists():
        print(
            f"missing artifact: {path}\n"
            "run training first (from the repo root):\n"
            "  python -m ml.pipelines.train_geographic\n"
            "  python -m ml.pipelines.train_cluster\n"
            "or pass --refresh to do it now.",
            file=sys.stderr,
        )
        sys.exit(1)


def _refresh_models() -> None:
    """Re-train both models in-process via subprocess for clean stderr."""
    for mod in ("ml.pipelines.train_geographic", "ml.pipelines.train_cluster"):
        print(f"==> {mod}", file=sys.stderr)
        result = subprocess.run(
            [sys.executable, "-m", mod],
            cwd=str(REPO_ROOT),
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )
        print(result.stdout, end="", file=sys.stderr)
        if result.returncode != 0:
            print(f"training step {mod} failed (exit {result.returncode})", file=sys.stderr)
            sys.exit(result.returncode)


def load_everything():
    _require(GEO_DIR / "geo_model.joblib")
    _require(CLUSTER_DIR / "cluster_model.joblib")
    _require(CLUSTER_DIR / "panel.csv")
    geo: TrainedGeoModel = joblib.load(GEO_DIR / "geo_model.joblib")
    cluster: TrainedClusterModel = joblib.load(CLUSTER_DIR / "cluster_model.joblib")
    panel = pd.read_csv(CLUSTER_DIR / "panel.csv")
    geo_summary = json.loads((GEO_DIR / "summary.json").read_text())
    clu_summary = json.loads((CLUSTER_DIR / "summary.json").read_text())
    return geo, cluster, panel, geo_summary, clu_summary


# ---------------------------------------------------------------------------
# Chart builders
# ---------------------------------------------------------------------------
def _fig_to_div(fig: go.Figure, include_plotlyjs: str | bool) -> str:
    return fig.to_html(
        include_plotlyjs=include_plotlyjs,
        full_html=False,
        config={"displaylogo": False},
    )


def _predict_all(geo: TrainedGeoModel, panel: pd.DataFrame) -> np.ndarray:
    """Overall predicted prevalence (per 1k) for every country in panel."""
    X = panel[geo.feature_cols].copy().fillna(panel[geo.feature_cols].median(numeric_only=True))
    return geo.predict(X)["mean"]


def country_ranking_chart(
    panel: pd.DataFrame, preds: np.ndarray, include_plotlyjs: str | bool,
) -> str:
    """Horizontal bar of all countries sorted by predicted prevalence."""
    df = panel[["country", "country_name", "region"]].copy()
    df["predicted"] = preds
    df = df.sort_values("predicted", ascending=True)

    fig = go.Figure(go.Bar(
        x=df["predicted"], y=df["country_name"],
        orientation="h",
        marker=dict(color=df["predicted"], colorscale="Reds",
                    cmin=float(df["predicted"].min()),
                    cmax=float(df["predicted"].max()),
                    colorbar=dict(title="pred /1k")),
        customdata=np.stack([df["country"], df["region"]], axis=1),
        hovertemplate=("<b>%{y}</b><br>"
                       "ISO3: %{customdata[0]}<br>"
                       "Region: %{customdata[1]}<br>"
                       "Predicted: %{x:.2f} /1k<extra></extra>"),
    ))
    # Cap chart height — 153 bars × 14px = 2142px otherwise dwarfs every
    # other section. Scroll-within-chart via fixed yaxis height works
    # better than a 2k-px page section.
    n = len(df)
    chart_height = min(900, max(420, 14 * n))
    fig.update_layout(
        height=chart_height,
        margin=dict(l=10, r=10, t=30, b=10),
        title=f"Predicted overall modern-slavery prevalence per 1,000 ({n} countries)",
        xaxis_title="prevalence per 1,000 population",
        yaxis=dict(automargin=True),
    )
    return _fig_to_div(fig, include_plotlyjs)


def cluster_pca_scatter(
    cluster: TrainedClusterModel, panel: pd.DataFrame,
    include_plotlyjs: str | bool,
    highlight: str | None = None,
) -> str:
    """2-D PCA of all countries colored by cluster (same per-block weights as training)."""
    Xs = cluster.transform(panel)
    labels = cluster.kmeans.predict(Xs)
    pc = PCA(n_components=2, random_state=0).fit_transform(Xs)
    df = pd.DataFrame({
        "PC1": pc[:, 0], "PC2": pc[:, 1],
        "cluster": labels.astype(str),
        "country": panel["country"], "country_name": panel.get("country_name", panel["country"]),
        "region": panel["region"] if "region" in panel.columns else "",
    })
    fig = px.scatter(
        df, x="PC1", y="PC2", color="cluster",
        hover_data={"country_name": True, "country": True, "region": True,
                    "PC1": ":.2f", "PC2": ":.2f", "cluster": True},
        height=440,
        title=(f"Country clusters (k={cluster.k}, silhouette={cluster.silhouette:.3f}). "
               "Per-block-weighted features, 2-D PCA projection."),
    )
    if highlight:
        sel = df[df["country"] == highlight]
        if not sel.empty:
            fig.add_trace(go.Scatter(
                x=sel["PC1"], y=sel["PC2"], mode="markers",
                marker=dict(symbol="star", size=22, color="#000",
                            line=dict(color="#fff", width=1)),
                name=f"selected ({highlight})", hoverinfo="skip",
            ))
    fig.update_layout(margin=dict(l=10, r=10, t=40, b=10))
    return _fig_to_div(fig, include_plotlyjs)


def feature_importance_chart(
    geo: TrainedGeoModel, include_plotlyjs: str | bool,
) -> str:
    """Mean GradientBoosting feature_importances_ across bagged trees."""
    importances = np.mean([m.feature_importances_ for m in geo.tree_models], axis=0)
    df = pd.DataFrame({"feature": geo.feature_cols, "importance": importances})
    df = df.sort_values("importance", ascending=True)
    fig = go.Figure(go.Bar(
        x=df["importance"], y=df["feature"], orientation="h",
        marker=dict(color=df["importance"], colorscale="Blues"),
        hovertemplate="%{y}: %{x:.3f}<extra></extra>",
    ))
    fig.update_layout(
        height=max(220, 26 * len(df)),
        margin=dict(l=10, r=10, t=30, b=10),
        title="Mean GradientBoosting feature importance (bagged)",
        xaxis_title="importance (normalised)",
    )
    return _fig_to_div(fig, include_plotlyjs)


def region_breakdown_chart(
    panel: pd.DataFrame, preds: np.ndarray, include_plotlyjs: str | bool,
) -> str:
    """Box plot of predicted prevalence grouped by GSI region."""
    df = panel[["country", "country_name", "region"]].copy()
    df["predicted"] = preds
    order = (
        df.groupby("region")["predicted"].median().sort_values(ascending=False).index.tolist()
    )
    fig = px.box(
        df, x="region", y="predicted", points="all",
        category_orders={"region": order},
        hover_data={"country_name": True, "country": True, "predicted": ":.2f"},
        height=380,
        title="Predicted prevalence per 1,000 by region (median-sorted)",
    )
    fig.update_layout(margin=dict(l=10, r=10, t=40, b=10),
                      xaxis_tickangle=-25)
    return _fig_to_div(fig, include_plotlyjs)


# ---------------------------------------------------------------------------
# Findings helpers — these drive the new findings-first layout.
# ---------------------------------------------------------------------------
RISK_TIERS = [
    # (label, lower, upper, css_class, hex)
    ("Severe",  10.0, float("inf"), "tier-severe",  "#7a1f1f"),
    ("High",     5.0, 10.0,         "tier-high",    "#b04a3a"),
    ("Medium",   2.0,  5.0,         "tier-medium",  "#c98e3b"),
    ("Low",      0.0,  2.0,         "tier-low",     "#1f5a2b"),
]


def _classify_tier(value: float) -> tuple[str, str, str]:
    """Return (label, css_class, hex) for a predicted prevalence."""
    for label, lo, hi, cls, color in RISK_TIERS:
        if lo <= value < hi:
            return label, cls, color
    return RISK_TIERS[-1][0], RISK_TIERS[-1][3], RISK_TIERS[-1][4]


def findings_table(panel: pd.DataFrame, preds: np.ndarray, top_n: int = 10) -> str:
    """Top-N highest-risk countries with predicted vs GSI observed + delta + tier."""
    df = panel[["country", "country_name", "region"]].copy()
    df["predicted"] = preds
    if "observed_prevalence_per_1k" in panel.columns:
        df["observed"] = panel["observed_prevalence_per_1k"].values
        df["delta"] = df["predicted"] - df["observed"]
    else:
        df["observed"] = float("nan")
        df["delta"] = float("nan")

    top = df.sort_values("predicted", ascending=False).head(top_n)
    rows_html: list[str] = []
    for _, r in top.iterrows():
        label, cls, color = _classify_tier(float(r["predicted"]))
        observed_str = f"{r['observed']:.2f}" if pd.notna(r["observed"]) else "—"
        delta_str = (
            f"<span style='color:{'#7a1f1f' if r['delta'] > 0 else '#1f5a2b'}'>"
            f"{r['delta']:+.2f}</span>"
            if pd.notna(r["delta"]) else "—"
        )
        rows_html.append(
            "<tr>"
            f"<td>{escape(r['country'])}</td>"
            f"<td>{escape(r['country_name'])}</td>"
            f"<td>{escape(r['region'])}</td>"
            f"<td style='text-align:right;font-weight:600'>{r['predicted']:.2f}</td>"
            f"<td style='text-align:right'>{observed_str}</td>"
            f"<td style='text-align:right'>{delta_str}</td>"
            f"<td><span class='tier-pill {cls}'>{label}</span></td>"
            "</tr>"
        )
    return (
        "<table class='data-table'>"
        "<thead><tr><th>ISO3</th><th>Country</th><th>Region</th>"
        "<th style='text-align:right'>Predicted /1k</th>"
        "<th style='text-align:right'>GSI observed</th>"
        "<th style='text-align:right'>Δ (pred − obs)</th>"
        "<th>Tier</th></tr></thead>"
        f"<tbody>{''.join(rows_html)}</tbody></table>"
    )


def risk_tier_breakdown(panel: pd.DataFrame, preds: np.ndarray) -> str:
    """Per-tier count + per-region cross-tab. Useful 'shape of the world' read."""
    df = panel[["country", "region"]].copy()
    df["predicted"] = preds
    df["tier"] = df["predicted"].apply(lambda v: _classify_tier(v)[0])
    tier_counts = df["tier"].value_counts().reindex(
        [t[0] for t in RISK_TIERS], fill_value=0,
    )
    rows = []
    for _label, _lo, _hi, cls, _color in RISK_TIERS:
        n = int(tier_counts.get(_label, 0))
        range_str = (
            f"≥ {_lo:.0f} /1k" if _hi == float("inf")
            else f"{_lo:.0f}–{_hi:.0f} /1k"
        )
        rows.append(
            "<tr>"
            f"<td><span class='tier-pill {cls}'>{_label}</span></td>"
            f"<td>{range_str}</td>"
            f"<td style='text-align:right;font-weight:600'>{n}</td>"
            "</tr>"
        )
    return (
        "<table class='data-table'>"
        "<thead><tr><th>Tier</th><th>Predicted range</th>"
        "<th style='text-align:right'>Countries</th></tr></thead>"
        f"<tbody>{''.join(rows)}</tbody></table>"
    )


def hero_findings(panel: pd.DataFrame, preds: np.ndarray, geo_summary: dict) -> dict:
    """Compute the headline numbers shown above the fold."""
    df = panel[["country", "country_name"]].copy()
    df["predicted"] = preds
    severe_n = int((df["predicted"] >= 10).sum())
    high_or_severe_n = int((df["predicted"] >= 5).sum())
    top = df.sort_values("predicted", ascending=False).iloc[0]
    bottom = df.sort_values("predicted", ascending=True).iloc[0]

    # Spearman rank correlation against GSI observed (where present).
    rank_corr = None
    if "observed_prevalence_per_1k" in panel.columns:
        obs = panel["observed_prevalence_per_1k"].values
        mask = ~pd.isna(obs)
        if mask.sum() >= 5:
            from scipy.stats import spearmanr
            rho, _ = spearmanr(preds[mask], obs[mask])
            rank_corr = float(rho)

    return {
        "severe_n": severe_n,
        "high_or_severe_n": high_or_severe_n,
        "n_countries": len(df),
        "top_country": f"{top['country_name']} ({top['country']})",
        "top_value": float(top["predicted"]),
        "bottom_country": f"{bottom['country_name']} ({bottom['country']})",
        "bottom_value": float(bottom["predicted"]),
        "rank_corr": rank_corr,
        "cv_r2": float(geo_summary.get("cv_r2", 0.0)),
    }


def choropleth_map(
    panel: pd.DataFrame, preds: np.ndarray, include_plotlyjs: str | bool,
) -> str:
    """World choropleth coloured by predicted prevalence (ISO3 join)."""
    df = panel[["country", "country_name"]].copy()
    df["predicted"] = preds
    fig = px.choropleth(
        df,
        locations="country",
        color="predicted",
        hover_name="country_name",
        color_continuous_scale="Reds",
        labels={"predicted": "Predicted /1k"},
        range_color=[float(df["predicted"].min()), float(df["predicted"].max())],
    )
    fig.update_geos(
        showcountries=True, countrycolor="#888",
        showcoastlines=True, coastlinecolor="#666",
        showland=True, landcolor="#f0f0f0",
        showocean=True, oceancolor="#e8eef3",
        projection_type="natural earth",
    )
    fig.update_layout(
        height=520,
        margin=dict(l=0, r=0, t=20, b=0),
        coloraxis_colorbar=dict(title="Predicted<br>/1k pop"),
    )
    return _fig_to_div(fig, include_plotlyjs)


def predicted_vs_observed_scatter(
    panel: pd.DataFrame, preds: np.ndarray, include_plotlyjs: str | bool,
) -> tuple[str, float | None]:
    """Predicted vs GSI observed scatter with a y=x reference line.

    Returns (html, spearman_rho) so the caption can quote the agreement.
    """
    if "observed_prevalence_per_1k" not in panel.columns:
        return "<p><em>No GSI observed values in the panel — scatter unavailable.</em></p>", None

    obs = panel["observed_prevalence_per_1k"].values
    mask = ~pd.isna(obs)
    if mask.sum() < 5:
        return "<p><em>Too few GSI observations for a scatter.</em></p>", None

    df = panel[["country", "country_name", "region"]].copy()
    df["predicted"] = preds
    df["observed"] = obs
    df = df[mask].reset_index(drop=True)

    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=df["observed"], y=df["predicted"],
        mode="markers",
        marker=dict(size=7, color=df["predicted"], colorscale="Reds",
                    line=dict(color="#333", width=0.5),
                    showscale=False),
        customdata=np.stack([df["country"], df["country_name"], df["region"]], axis=1),
        hovertemplate=("<b>%{customdata[1]}</b> (%{customdata[0]})<br>"
                       "Region: %{customdata[2]}<br>"
                       "GSI observed: %{x:.2f} /1k<br>"
                       "Model predicted: %{y:.2f} /1k<extra></extra>"),
        name="country",
    ))
    lo = min(df["observed"].min(), df["predicted"].min())
    hi = max(df["observed"].max(), df["predicted"].max())
    fig.add_trace(go.Scatter(
        x=[lo, hi], y=[lo, hi],
        mode="lines",
        line=dict(color="#888", dash="dash", width=1),
        hoverinfo="skip", name="perfect prediction",
    ))
    fig.update_layout(
        height=420, margin=dict(l=10, r=10, t=30, b=10),
        xaxis_title="GSI observed prevalence (/1k)",
        yaxis_title="Model predicted prevalence (/1k)",
        showlegend=False,
    )

    from scipy.stats import spearmanr
    rho, _ = spearmanr(df["predicted"], df["observed"])
    return _fig_to_div(fig, include_plotlyjs), float(rho)


def country_detail_block(
    geo: TrainedGeoModel, cluster: TrainedClusterModel,
    panel: pd.DataFrame, country: str, include_plotlyjs: str | bool,
) -> tuple[str, str, str]:
    """Per-country bar of ILO-bucket prevalence + similar-country table + observed-vs-predicted note."""
    row = panel[panel["country"] == country]
    if row.empty:
        msg = f"<p><em>{escape(country)} is not in the trained panel.</em></p>"
        return msg, "", ""

    row = row.iloc[[0]].copy()
    pred = geo.predict(row[geo.feature_cols])
    overall = float(pred["mean"][0])
    lower = float(pred["lower"][0])
    upper = float(pred["upper"][0])

    # Per-ILO-bucket bars with uncertainty whiskers scaled by the same proportion.
    buckets = list(ILO_GLOBAL_PROPORTIONS.keys())
    means = [overall * ILO_GLOBAL_PROPORTIONS[b] for b in buckets]
    err_lo = [(overall - lower) * ILO_GLOBAL_PROPORTIONS[b] for b in buckets]
    err_hi = [(upper - overall) * ILO_GLOBAL_PROPORTIONS[b] for b in buckets]

    fig_bar = go.Figure(go.Bar(
        x=buckets, y=means, marker_color="#b04a3a",
        error_y=dict(type="data", symmetric=False,
                     array=err_hi, arrayminus=err_lo, color="#333"),
    ))
    fig_bar.update_layout(
        height=320, margin=dict(l=10, r=10, t=40, b=10),
        yaxis_title="predicted prevalence per 1,000",
        title=(f"{country} — per-bucket prevalence (overall {overall:.2f} /1k, "
               f"80% band {lower:.2f}–{upper:.2f})"),
    )
    bar_html = _fig_to_div(fig_bar, include_plotlyjs)

    # Similar-countries table.
    similar = cluster.similar_countries(panel, country, top_n=8)
    if similar.empty:
        sim_html = "<p><em>No other countries in this cluster.</em></p>"
    else:
        cols = ["country", "country_name", "region", "distance_to_target"]
        cols = [c for c in cols if c in similar.columns]
        sim_html = similar[cols].round(3).to_html(
            index=False, classes="data-table", border=0,
        )

    # Observed vs predicted note.
    note_parts: list[str] = []
    if "observed_prevalence_per_1k" in row.columns and not pd.isna(row["observed_prevalence_per_1k"].iloc[0]):
        observed = float(row["observed_prevalence_per_1k"].iloc[0])
        delta = overall - observed
        note_parts.append(
            f"GSI observed: <b>{observed:.2f} /1k</b>. "
            f"Model predicted: <b>{overall:.2f} /1k</b>. "
            f"Delta: {delta:+.2f}."
        )
    cluster_id = int(cluster.assign_cluster(row[cluster.feature_cols])[0])
    note_parts.append(f"Cluster id: <b>{cluster_id}</b>.")
    note_html = "<p>" + " &nbsp;·&nbsp; ".join(note_parts) + "</p>"

    return bar_html, sim_html, note_html


# ---------------------------------------------------------------------------
# HTML assembly
# ---------------------------------------------------------------------------
CSS = """
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
       margin: 0; padding: 32px 48px; max-width: 1280px; color: #1a1a1a; background: #fafafa; }
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
.metric .sub   { font-size: 11px; color: #777; margin-top: 2px; }
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
.pill { display: inline-block; padding: 2px 8px; border-radius: 999px;
        font-size: 11px; background: #eee; color: #333; margin-right: 4px; }
.pill.warn { background: #f9e4b6; color: #6b4a00; }
.pill.bad  { background: #f6cccc; color: #7a1f1f; }
.pill.ok   { background: #d8eedb; color: #1f5a2b; }
.tier-pill { display: inline-block; padding: 3px 10px; border-radius: 999px;
             font-size: 11px; font-weight: 600; letter-spacing: 0.02em; color: #fff; }
.tier-severe { background: #7a1f1f; }
.tier-high   { background: #b04a3a; }
.tier-medium { background: #c98e3b; }
.tier-low    { background: #1f5a2b; }
.hero-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 12px; }
.hero-card { padding: 18px; background: #fff; border-radius: 8px;
             border: 1px solid #e5e5e5; }
.hero-card .label { font-size: 11px; color: #888; text-transform: uppercase;
                    letter-spacing: 0.08em; }
.hero-card .value { font-size: 26px; font-weight: 700; margin-top: 6px; color: #1a1a1a; }
.hero-card .sub   { font-size: 12px; color: #666; margin-top: 4px; }
.hero-card.bad .value  { color: #7a1f1f; }
.hero-card.good .value { color: #1f5a2b; }
.callout { background: #fff8f0; border-left: 3px solid #c98e3b;
           padding: 10px 14px; font-size: 13px; margin: 8px 0 0 0; color: #333; }
.callout strong { color: #7a1f1f; }
.takeaway { font-size: 14px; color: #444; margin-top: 8px; line-height: 1.5; }
.takeaway strong { color: #1a1a1a; }
"""


def _coverage_pill(empirical: float, nominal: float = 0.80) -> str:
    if empirical >= nominal - 0.02:
        return f"<span class='pill ok'>coverage {empirical * 100:.0f}% / nominal {nominal * 100:.0f}%</span>"
    if empirical >= nominal - 0.08:
        return f"<span class='pill warn'>coverage {empirical * 100:.0f}% / nominal {nominal * 100:.0f}%</span>"
    return f"<span class='pill bad'>coverage {empirical * 100:.0f}% / nominal {nominal * 100:.0f}%</span>"


def _quality_pills(geo_summary: Dict[str, Any]) -> str:
    dq = geo_summary.get("data_quality") or {}
    parts: list[str] = []
    dropped = (geo_summary.get("collinearity") or {}).get("dropped") or []
    if dropped:
        parts.append(f"<span class='pill warn'>collinearity drops: {', '.join(dropped)}</span>")
    vif = dq.get("high_vif_columns") or []
    if vif:
        parts.append(f"<span class='pill warn'>{len(vif)} high-VIF predictor(s)</span>")
    high_corr = dq.get("high_correlation_pairs") or []
    if high_corr:
        parts.append(f"<span class='pill warn'>{len(high_corr)} correlated pair(s)</span>")
    if geo_summary.get("target_transform") == "log1p":
        parts.append("<span class='pill ok'>target transform: log1p</span>")
    cols_dropped_high_na = (dq.get("columns_to_drop") or [])
    if cols_dropped_high_na:
        parts.append(f"<span class='pill warn'>dropped (high NaN): {', '.join(cols_dropped_high_na)}</span>")
    return " ".join(parts) or "<span class='pill ok'>no quality flags</span>"


def render_html(
    geo: TrainedGeoModel,
    cluster: TrainedClusterModel,
    panel: pd.DataFrame,
    geo_summary: dict,
    clu_summary: dict,
    include_plotlyjs: str | bool,
    country: str | None = None,
) -> str:
    preds = _predict_all(geo, panel)

    # ---- hero findings (above-the-fold cards) -------------------------
    hero = hero_findings(panel, preds, geo_summary)
    rank_corr_str = (
        f"{hero['rank_corr']:.2f}" if hero["rank_corr"] is not None else "—"
    )
    rank_corr_sub = (
        f"Spearman vs GSI on {int((~pd.isna(panel['observed_prevalence_per_1k'])).sum())} countries"
        if hero["rank_corr"] is not None else "GSI observed not available"
    )
    hero_html = (
        "<div class='hero-row'>"
        f"<div class='hero-card bad'><div class='label'>Highest predicted risk</div>"
        f"<div class='value'>{hero['top_value']:.1f} /1k</div>"
        f"<div class='sub'>{escape(hero['top_country'])}</div></div>"

        f"<div class='hero-card'><div class='label'>Countries flagged High+Severe</div>"
        f"<div class='value'>{hero['high_or_severe_n']}</div>"
        f"<div class='sub'>of {hero['n_countries']} scored "
        f"(≥ 5 / 1,000 predicted prevalence)</div></div>"

        f"<div class='hero-card'><div class='label'>Model–GSI ranking agreement</div>"
        f"<div class='value'>{rank_corr_str}</div>"
        f"<div class='sub'>{rank_corr_sub}</div></div>"

        f"<div class='hero-card good'><div class='label'>Lowest predicted risk</div>"
        f"<div class='value'>{hero['bottom_value']:.1f} /1k</div>"
        f"<div class='sub'>{escape(hero['bottom_country'])}</div></div>"
        "</div>"
    )

    callout = (
        "<p class='callout'>"
        f"<strong>{hero['severe_n']} countries</strong> sit in the "
        "<strong>Severe tier</strong> (predicted prevalence ≥ 10 per 1,000). "
        "These are the priority targets for due-diligence work."
        "</p>"
    ) if hero["severe_n"] > 0 else ""

    # ---- main findings sections ---------------------------------------
    top10_table = findings_table(panel, preds, top_n=10)
    tier_table = risk_tier_breakdown(panel, preds)
    map_html = choropleth_map(panel, preds, include_plotlyjs)
    pred_obs_html, pred_obs_rho = predicted_vs_observed_scatter(panel, preds, False)

    pred_obs_caption = (
        f"Each dot is one country. The dashed line is perfect agreement (predicted = observed). "
        f"<strong>Spearman ρ = {pred_obs_rho:.2f}</strong> — the model's country ranking "
        "closely tracks GSI's, which is the strongest claim we can honestly make on n≈153."
        if pred_obs_rho is not None else
        "GSI observed values not available — scatter omitted."
    )

    region_html = region_breakdown_chart(panel, preds, False)
    feat_html = feature_importance_chart(geo, False)

    # ---- per-country block (only if --country given) ------------------
    country_section = ""
    if country:
        bar_html, sim_html, note_html = country_detail_block(
            geo, cluster, panel, country, False,
        )
        country_section = f"""
<h2>Country deep-dive — {escape(country)}</h2>
<section>
  {note_html}
  {bar_html}
  <h3>Similar countries (same cluster, nearest in feature space)</h3>
  {sim_html}
</section>
"""

    # ---- methodology + diagnostics (DEMOTED below the findings) ------
    cluster_html = cluster_pca_scatter(cluster, panel, False, highlight=country)
    ranking_html = country_ranking_chart(panel, preds, False)

    metric_html = (
        "<div class='metric-row'>"
        f"<div class='metric'><div class='label'>Cross-val MAE</div>"
        f"<div class='value'>{geo_summary['cv_mae']:.2f}</div>"
        f"<div class='sub'>per 1,000 — typical miss</div></div>"
        f"<div class='metric'><div class='label'>Cross-val R²</div>"
        f"<div class='value'>{geo_summary['cv_r2']:+.2f}</div>"
        f"<div class='sub'>variance explained</div></div>"
        f"<div class='metric'><div class='label'>80% interval width</div>"
        f"<div class='value'>±{geo_summary['conformal_half_width']:.1f}</div>"
        f"<div class='sub'>conformal — {geo_summary['empirical_coverage_80'] * 100:.0f}% empirical coverage</div></div>"
        f"<div class='metric'><div class='label'>Cluster silhouette</div>"
        f"<div class='value'>{clu_summary['silhouette']:.2f}</div>"
        f"<div class='sub'>k={clu_summary['k']} clusters of {clu_summary['n_countries']}</div></div>"
        "</div>"
    )

    dq = geo_summary.get("data_quality") or {}
    dq_rows = []
    for col, frac in (dq.get("missingness") or {}).items():
        dq_rows.append({
            "predictor": col,
            "missing %": f"{frac * 100:.1f}%",
            "outliers (|z|>3)": (dq.get("outliers") or {}).get(col, 0),
            "in final model": "yes" if col in geo.feature_cols else "no",
        })
    dq_table = pd.DataFrame(dq_rows).to_html(index=False, classes="data-table", border=0) \
        if dq_rows else "<p><em>no per-column quality details available.</em></p>"

    coll = geo_summary.get("collinearity") or {}
    coll_dropped = coll.get("dropped") or []
    coll_table = ""
    if coll_dropped:
        reps = coll.get("kept_representatives") or {}
        kept_for = {drop: kept for kept, drops in reps.items() for drop in drops}
        coll_table = pd.DataFrame([
            {"dropped": d, "kept representative": kept_for.get(d, "—")}
            for d in coll_dropped
        ]).to_html(index=False, classes="data-table", border=0)

    # ---- sources ------------------------------------------------------
    src = geo_summary.get("sources") or {}
    src_html_parts = []
    for label, key in [("Predicted (target)", "predicted"),
                       ("Predictors", "predictors")]:
        items = src.get(key) or []
        lis = "".join(
            f"<li><strong>{escape(s.get('name', ''))}</strong> — {escape(s.get('publisher', ''))}<br>"
            f"<a href='{escape(s.get('url', ''))}'>{escape(s.get('url', ''))}</a></li>"
            for s in items
        )
        if items:
            src_html_parts.append(
                f"<details><summary>{label} ({len(items)})</summary>"
                f"<ul class='source-list'>{lis}</ul></details>"
            )
    sources_html = "\n".join(src_html_parts)

    head_country = (
        f" — deep-dive: <strong>{escape(country)}</strong>"
        if country else ""
    )

    return f"""<!DOCTYPE html>
<html lang='en'>
<head>
  <meta charset='utf-8'>
  <title>LaborLens — country exploitation-risk findings</title>
  <style>{CSS}</style>
</head>
<body>
  <h1>Country exploitation-risk findings</h1>
  <p class='subtitle'>
    {hero['n_countries']} countries scored from real public data
    (Walk Free GSI 2023 · World Bank WDI 2021 · RSF 2021){head_country}.
  </p>
  {hero_html}
  {callout}

  <h2>Highest-risk countries (Top 10)</h2>
  <section>
    {top10_table}
    <p class='takeaway'>
      <strong>Δ (pred − obs)</strong> = the model's bias for that country.
      Red Δ means we over-predict relative to GSI; green means we under-predict.
      Small Δ on a high prediction is the strongest "we agree with the data and
      this country is bad" signal.
    </p>
  </section>

  <h2>World risk map</h2>
  <section>
    {map_html}
    <p class='takeaway'>
      Darker red = higher predicted exploitation prevalence per 1,000 people.
      Hover any country for its predicted value.
    </p>
  </section>

  <h2>Risk tier distribution</h2>
  <section>
    <div class='two-col'>
      <div>{tier_table}</div>
      <div>{region_html}</div>
    </div>
    <p class='takeaway'>
      The left table counts how many countries fall into each tier. The right
      box plot shows the spread <em>within</em> each region — wide boxes mean
      the model finds large within-region heterogeneity (e.g., Europe spans
      Norway to Belarus).
    </p>
  </section>

  <h2>Does the model agree with the data?</h2>
  <section>
    {pred_obs_html}
    <p class='takeaway'>{pred_obs_caption}</p>
  </section>

  <h2>What drives the predictions</h2>
  <section>
    {feat_html}
    <p class='takeaway'>
      Top of the bar = strongest predictor. Press freedom, governance, and
      GDP-rank-within-region carry the most weight; population scale and
      youth-dependency add the rest. This is the model's own answer to "why
      did you flag this country?"
    </p>
  </section>

  {country_section}

  <h2>Methodology &amp; diagnostics</h2>
  <section>
    <p>{_quality_pills(geo_summary)} {_coverage_pill(geo_summary['empirical_coverage_80'])}</p>
    {metric_html}
    <p class='caption'>
      Geographic model: bagged GradientBoosting + Ridge averaged, with
      split-conformal prediction intervals. Cluster model: KMeans with
      per-block-weighted features (powers the "similar countries" lookups).
      Six GCC kafala-system countries excluded from training (observable
      features can't represent their migrant-labor structures); they are
      still served at inference.
    </p>

    <details>
      <summary>All {hero['n_countries']} countries — full ranking</summary>
      {ranking_html}
    </details>

    <details>
      <summary>Country clusters (PCA projection)</summary>
      {cluster_html}
    </details>

    <details>
      <summary>Per-predictor data quality</summary>
      {dq_table}
      {('<h3>Collinearity drops</h3>' + coll_table) if coll_table else ''}
      <p class='caption'>
        Columns with NaN fraction above 40% are dropped automatically.
        Collinearity reduction is greedy on |r| ≥ 0.85 pairs.
      </p>
    </details>
  </section>

  <h2>Sources</h2>
  <section>{sources_html or '<em>no sources recorded.</em>'}</section>

  <p class='caption' style='margin-top:40px;'>
    Single self-contained HTML — no server, no telemetry.
    Re-run <code>python -m ml.app.build_report --refresh</code> to
    retrain the models and regenerate the page.
  </p>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# Optional serve helper
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
def main() -> None:
    p = argparse.ArgumentParser(description="Real-data model report.")
    p.add_argument("--country", help="ISO3 code to add a per-country detail block.")
    p.add_argument("--refresh", action="store_true",
                   help="Re-train both models before building the report.")
    p.add_argument("--inline-js", action="store_true",
                   help="Embed plotly.js inline (~4MB) instead of CDN.")
    p.add_argument("--serve", action="store_true",
                   help="Also serve the report on http://127.0.0.1:8765/.")
    p.add_argument("--out", default=str(REPORT_DIR),
                   help="Output directory (default: ml/artifacts/report).")
    args = p.parse_args()

    if args.refresh:
        _refresh_models()

    geo, cluster, panel, geo_summary, clu_summary = load_everything()

    include_js = True if args.inline_js else "cdn"
    html = render_html(
        geo, cluster, panel, geo_summary, clu_summary,
        include_plotlyjs=include_js, country=args.country,
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
