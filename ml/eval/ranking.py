"""Ranking-based sanity checks for the geographic model.

We can't validate prevalence point estimates against ground truth because
ground truth is exactly what we're trying to estimate. What we *can* do
is check that our country ranking correlates with externally-trusted
country rankings (GSI prevalence per 1000; TIP tier).
"""

from __future__ import annotations

from typing import Iterable

import numpy as np
import pandas as pd
from scipy.stats import spearmanr, kendalltau


def spearman_vs_reference(
    predicted: pd.Series,
    reference: pd.Series,
) -> dict:
    """Spearman + Kendall agreement between two country-keyed series.

    Both series should be indexed by country code. Missing entries are
    dropped pairwise.
    """
    df = pd.concat([predicted.rename("pred"), reference.rename("ref")], axis=1).dropna()
    if len(df) < 5:
        return {"n": int(len(df)), "spearman": float("nan"), "kendall": float("nan")}
    rho, _ = spearmanr(df["pred"], df["ref"])
    tau, _ = kendalltau(df["pred"], df["ref"])
    return {"n": int(len(df)), "spearman": float(rho), "kendall": float(tau)}


def top_k_overlap(
    predicted: pd.Series,
    reference: pd.Series,
    k: int = 10,
) -> dict:
    """Jaccard overlap between top-K worst countries in pred vs reference."""
    pred_top = set(predicted.sort_values(ascending=False).head(k).index)
    ref_top = set(reference.sort_values(ascending=False).head(k).index)
    if not pred_top or not ref_top:
        return {"k": k, "jaccard": 0.0, "overlap": 0}
    inter = pred_top & ref_top
    union = pred_top | ref_top
    return {"k": k, "jaccard": len(inter) / len(union), "overlap": len(inter)}
