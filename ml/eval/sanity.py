"""Sanity test — distribution of model output across the panel.

Run from the repo root:

    python -m ml.eval.sanity
    python -m ml.eval.sanity --out sanity.txt --bins 0.5

For every country in the panel, asks the trained geographic model for
a predicted overall prevalence. Then categorically reports mean /
median / mode / max / min / std of those predictions:

  - overall (one row),
  - by region (one row per region),
  - by ILO exploit bucket (one row per bucket — the bucket is just the
    overall × a fixed ILO global proportion, so the SHAPE of the
    distribution is identical; the magnitudes differ).
  - plus the min-country and max-country named for each grouping so an
    operator can immediately spot a suspect outlier.

Mode of a continuous prediction is fragile, so we report the centre of
the most-populated bin (`--bins` width, default 0.5/1k) instead of
asking for an exact mode.

Output: pretty terminal tables and, optionally, a .txt file.
"""

from __future__ import annotations

from ._runtime import ensure_venv
ensure_venv("ml.eval.sanity")

import argparse
import os
import sys
from pathlib import Path
from typing import List, Sequence, Tuple

import joblib
import numpy as np
import pandas as pd

from ..data.real import ILO_GLOBAL_PROPORTIONS, extended_predictor_cols, load_extended_panel
from ..models.geographic import TrainedGeoModel
from ._runtime import render_table, section, subsection


GEO_DIR = Path(__file__).resolve().parents[1] / "artifacts" / "geographic"


def _binned_mode(values: np.ndarray, bin_width: float) -> Tuple[float, int]:
    """Mode = midpoint of the bin with the most observations."""
    if len(values) == 0:
        return float("nan"), 0
    lo = float(np.floor(values.min() / bin_width) * bin_width)
    hi = float(np.ceil(values.max() / bin_width) * bin_width)
    edges = np.arange(lo, hi + bin_width, bin_width)
    if len(edges) < 2:
        return float(values.mean()), int(len(values))
    counts, edges = np.histogram(values, bins=edges)
    if counts.max() == 0:
        return float("nan"), 0
    idx = int(np.argmax(counts))
    centre = float(edges[idx] + bin_width / 2)
    return centre, int(counts[idx])


def _summary_row(
    label: str,
    values: np.ndarray,
    bin_width: float,
    country_min: str | None = None,
    country_max: str | None = None,
) -> Sequence[object]:
    if len(values) == 0:
        return (label, 0, None, None, None, None, None, None, "", "")
    mode_val, mode_n = _binned_mode(values, bin_width)
    return (
        label,
        int(len(values)),
        float(values.mean()),
        float(np.median(values)),
        f"{mode_val:.2f} (n={mode_n})",
        float(values.std(ddof=0)),
        float(values.min()),
        float(values.max()),
        country_min or "",
        country_max or "",
    )


def _predict_all(model: TrainedGeoModel, panel: pd.DataFrame) -> np.ndarray:
    """Predict overall prevalence for every panel row. Missing predictor
    values are median-filled per-column so the sanity test doesn't
    silently drop rows."""
    X = panel[model.feature_cols].copy()
    X = X.fillna(X.median(numeric_only=True))
    return model.predict(X)["mean"]


def _ascii_histogram(values: np.ndarray, width: int = 50, bins: int = 12) -> str:
    """Tiny ASCII histogram — quick eyeball check of distribution shape."""
    if len(values) == 0:
        return "(no data)"
    counts, edges = np.histogram(values, bins=bins)
    if counts.max() == 0:
        return "(degenerate)"
    rows = []
    for i, c in enumerate(counts):
        bar = "#" * int(round(width * c / counts.max()))
        rows.append(f"  {edges[i]:6.2f} – {edges[i+1]:6.2f}  |{bar}  ({c})")
    return "\n".join(rows)


HEADERS = (
    ["group", "n", "mean", "median", "mode (binned)", "std",
     "min", "max", "min country", "max country"],
    ["l", "r", "r", "r", "r", "r", "r", "r", "l", "l"],
)


def _build_report(model: TrainedGeoModel, panel: pd.DataFrame, bin_width: float) -> str:
    preds = _predict_all(model, panel)
    df = panel[["country", "country_name", "region"]].copy()
    df["predicted"] = preds

    parts: List[str] = [section("Sanity test — geographic prediction distributions")]
    parts.append(
        f"  Panel:          {len(df)} countries\n"
        f"  Predictor cols: {len(model.feature_cols)}\n"
        f"  Bin width:      {bin_width} /1k (mode is the centre of the most-populated bin)"
    )

    # ---- Overall ---------------------------------------------------------
    min_country = df.loc[df["predicted"].idxmin(), "country"]
    max_country = df.loc[df["predicted"].idxmax(), "country"]
    overall_row = _summary_row(
        "ALL countries", df["predicted"].values, bin_width,
        country_min=min_country, country_max=max_country,
    )
    parts.append(subsection("Overall distribution"))
    parts.append(render_table(HEADERS[0], [overall_row], align=HEADERS[1]))

    # ---- By region -------------------------------------------------------
    region_rows = []
    for region, sub in df.groupby("region"):
        vals = sub["predicted"].values
        if not len(vals):
            continue
        rmin = sub.loc[sub["predicted"].idxmin(), "country"]
        rmax = sub.loc[sub["predicted"].idxmax(), "country"]
        region_rows.append(
            _summary_row(region, vals, bin_width, country_min=rmin, country_max=rmax)
        )
    region_rows.sort(key=lambda r: -float(r[2]) if r[2] is not None else 0)  # mean desc
    parts.append(subsection("By region"))
    parts.append(render_table(HEADERS[0], region_rows, align=HEADERS[1]))

    # ---- By ILO exploit bucket -----------------------------------------
    # Each bucket = overall * a fixed proportion, so all stats scale.
    bucket_rows = []
    for bucket, prop in ILO_GLOBAL_PROPORTIONS.items():
        scaled = preds * prop
        bidx_min = int(np.argmin(scaled))
        bidx_max = int(np.argmax(scaled))
        bucket_rows.append(_summary_row(
            f"{bucket} (×{prop})", scaled, bin_width,
            country_min=df.iloc[bidx_min]["country"],
            country_max=df.iloc[bidx_max]["country"],
        ))
    parts.append(subsection("By ILO exploit bucket  (overall × global proportion)"))
    parts.append(
        "  NOTE: each bucket is `overall × constant ILO proportion`, so the "
        "shape\n        of the distribution and the min/max country are "
        "identical across\n        buckets by construction. Only the "
        "magnitudes differ."
    )
    parts.append(render_table(HEADERS[0], bucket_rows, align=HEADERS[1]))

    # ---- Per-country detail (top 5 highest predicted) -------------------
    top5 = df.sort_values("predicted", ascending=False).head(5)
    bottom5 = df.sort_values("predicted", ascending=True).head(5)
    parts.append(subsection("Top 5 highest predicted"))
    parts.append(render_table(
        ["iso3", "country", "region", "predicted /1k"],
        [(r["country"], r.get("country_name", ""), r["region"], float(r["predicted"]))
         for _, r in top5.iterrows()],
        align=["l", "l", "l", "r"],
    ))
    parts.append(subsection("Bottom 5 lowest predicted"))
    parts.append(render_table(
        ["iso3", "country", "region", "predicted /1k"],
        [(r["country"], r.get("country_name", ""), r["region"], float(r["predicted"]))
         for _, r in bottom5.iterrows()],
        align=["l", "l", "l", "r"],
    ))

    parts.append(subsection("Histogram of all predictions"))
    parts.append(_ascii_histogram(preds))

    parts.append("")
    return "\n".join(parts)


def main() -> None:
    ap = argparse.ArgumentParser(description="Sanity test for the geographic model.")
    ap.add_argument("--bins", type=float, default=0.5,
                    help="Bin width (in /1k) used to compute a binned mode (default 0.5).")
    ap.add_argument("--out", type=str, default=None,
                    help="Also write the report to this .txt file.")
    args = ap.parse_args()

    if not (GEO_DIR / "geo_model.joblib").exists():
        print(
            "geo_model.joblib not found. Train first:\n"
            "  python -m ml.pipelines.train_geographic",
            file=sys.stderr,
        )
        sys.exit(1)

    model: TrainedGeoModel = joblib.load(GEO_DIR / "geo_model.joblib")
    panel, _blocks = load_extended_panel()

    text = _build_report(model, panel, bin_width=args.bins)
    print(text)
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
        print(f"\nwrote {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
