"""Geographic exploitation-prevalence model.

Design choices (per project plan):

  - Two predictors trained side by side: a GradientBoosting tree
    ensemble (captures non-linear interactions) and a Ridge linear
    model (interpretable, stable baseline). Their predictions are
    averaged into the point estimate; their spread feeds the
    uncertainty band.
  - Whole-country holdout via GroupKFold on the country column.
    Random row holdouts would leak because the same country shows up
    in multiple years and the country fixed-effect makes within-
    country predictions trivial.
  - Year t -> year t+1 supervision: features come from year t, target
    is observed prevalence in year t+1. This forces the model to
    forecast change, not just memorise current state.
  - Reporting-bias adjustment: target is *bias-adjusted* prevalence,
    not raw observed prevalence. Without this, low-press-freedom
    countries get unfairly low predicted risk.
  - Uncertainty bands: per-prediction interval = mean +/- k * spread,
    where spread combines (a) bootstrap std across resampled trees and
    (b) abs disagreement between tree and linear estimates.
  - Ranking sanity check: Spearman vs raw GSI prevalence is reported as
    an external check, not used for training.

One model is trained per exploit type so the four outcomes can have
genuinely different feature weights.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import GroupKFold
from sklearn.preprocessing import StandardScaler

from ..data.synthetic import EXPLOIT_TYPES, PREDICTOR_COLS
from ..features.reporting_bias import add_bias_adjusted_target
from ..eval.ranking import spearman_vs_reference, top_k_overlap


# ---------------------------------------------------------------------------
# Data shaping helpers
# ---------------------------------------------------------------------------
def build_supervised_table(
    panel: pd.DataFrame,
    exploit: str,
) -> pd.DataFrame:
    """Reshape long panel to a (country, year_t) row with year_{t+1} target.

    The model sees year-t features, year-t observed prevalence (as one
    of the features so it can lean on momentum), and year-(t+1) adjusted
    prevalence as the supervised target.
    """
    sub = panel[panel["exploit_type"] == exploit].copy()
    sub = add_bias_adjusted_target(sub)

    # Sort + shift within country to align t -> t+1.
    sub = sub.sort_values(["country", "year"]).reset_index(drop=True)
    sub["target_next_year"] = (
        sub.groupby("country")["adjusted_prevalence_per_1k"].shift(-1)
    )
    # year-t prevalence is a legitimate feature (autoregression).
    sub["lag_observed"] = sub["observed_prevalence_per_1k"]

    sub = sub.dropna(subset=["target_next_year"]).reset_index(drop=True)
    return sub


def feature_matrix(df: pd.DataFrame) -> Tuple[pd.DataFrame, List[str]]:
    """Pick the feature columns and return them + their names."""
    cols = PREDICTOR_COLS + ["lag_observed"]
    return df[cols].copy(), cols


# ---------------------------------------------------------------------------
# Model container
# ---------------------------------------------------------------------------
@dataclass
class TrainedGeoModel:
    """One trained per exploit type. Holds both component models + meta."""

    exploit: str
    tree_models: List[GradientBoostingRegressor]   # bagged for uncertainty
    linear_model: Ridge
    scaler: StandardScaler
    feature_cols: List[str]
    cv_mae: float
    cv_r2: float
    spearman_vs_gsi: float
    top10_jaccard_vs_gsi: float

    def predict(self, X: pd.DataFrame) -> Dict[str, np.ndarray]:
        """Return dict with mean, lower (10th pct), upper (90th pct)."""
        Xs = self.scaler.transform(X[self.feature_cols])
        tree_preds = np.stack([m.predict(X[self.feature_cols].values)
                               for m in self.tree_models], axis=0)  # (B, N)
        tree_mean = tree_preds.mean(axis=0)
        tree_std = tree_preds.std(axis=0)

        lin_pred = self.linear_model.predict(Xs)

        # Point estimate = average of the two model families.
        mean = 0.5 * tree_mean + 0.5 * lin_pred

        # Spread combines bagging variability with cross-family disagreement.
        spread = tree_std + 0.5 * np.abs(tree_mean - lin_pred)
        lower = np.clip(mean - 1.28 * spread, 0, None)   # ~10th percentile
        upper = mean + 1.28 * spread                     # ~90th percentile
        return {"mean": mean, "lower": lower, "upper": upper, "spread": spread}


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------
def _bagged_trees(
    X: np.ndarray,
    y: np.ndarray,
    n_bags: int = 8,
    seed: int = 0,
) -> List[GradientBoostingRegressor]:
    """Train a small ensemble of gradient-boosted trees on bootstrap samples."""
    rng = np.random.default_rng(seed)
    n = len(y)
    models: List[GradientBoostingRegressor] = []
    for b in range(n_bags):
        idx = rng.integers(0, n, size=n)  # bootstrap
        m = GradientBoostingRegressor(
            n_estimators=120, max_depth=3, learning_rate=0.06,
            subsample=0.85, random_state=seed + b,
        )
        m.fit(X[idx], y[idx])
        models.append(m)
    return models


def train_for_exploit(
    panel: pd.DataFrame,
    exploit: str,
    gsi_reference: pd.Series | None = None,
    n_bags: int = 8,
    seed: int = 0,
) -> TrainedGeoModel:
    """Train both models on the panel, evaluate with country-level CV."""
    table = build_supervised_table(panel, exploit)
    X_df, cols = feature_matrix(table)
    y = table["target_next_year"].values
    groups = table["country"].values

    # GroupKFold: every fold withholds a disjoint set of countries.
    n_splits = min(5, table["country"].nunique())
    gkf = GroupKFold(n_splits=n_splits)
    fold_maes: List[float] = []
    fold_r2s: List[float] = []

    for fold, (tr_idx, te_idx) in enumerate(gkf.split(X_df, y, groups)):
        scaler = StandardScaler().fit(X_df.iloc[tr_idx])
        X_tr = scaler.transform(X_df.iloc[tr_idx])
        X_te = scaler.transform(X_df.iloc[te_idx])

        # Fit fold-local trees and ridge for CV metrics.
        trees = _bagged_trees(X_df.iloc[tr_idx].values, y[tr_idx], n_bags=4, seed=seed + fold)
        ridge = Ridge(alpha=1.0).fit(X_tr, y[tr_idx])

        tree_pred = np.mean([m.predict(X_df.iloc[te_idx].values) for m in trees], axis=0)
        ridge_pred = ridge.predict(X_te)
        ens_pred = 0.5 * tree_pred + 0.5 * ridge_pred

        fold_maes.append(mean_absolute_error(y[te_idx], ens_pred))
        fold_r2s.append(r2_score(y[te_idx], ens_pred))

    # Refit on all data for the production model.
    scaler = StandardScaler().fit(X_df)
    X_full = scaler.transform(X_df)
    trees_full = _bagged_trees(X_df.values, y, n_bags=n_bags, seed=seed)
    ridge_full = Ridge(alpha=1.0).fit(X_full, y)

    cv_mae = float(np.mean(fold_maes))
    cv_r2 = float(np.mean(fold_r2s))

    # External sanity check vs GSI ranking (most recent year only).
    spearman = float("nan")
    jaccard = float("nan")
    if gsi_reference is not None:
        latest_year = table["year"].max()
        latest = table[table["year"] == latest_year].set_index("country")
        Xs_latest = scaler.transform(latest[cols])
        tree_mean = np.mean([m.predict(latest[cols].values) for m in trees_full], axis=0)
        lin_mean = ridge_full.predict(Xs_latest)
        latest_pred = pd.Series(0.5 * tree_mean + 0.5 * lin_mean, index=latest.index)
        spearman = spearman_vs_reference(latest_pred, gsi_reference)["spearman"]
        jaccard = top_k_overlap(latest_pred, gsi_reference, k=10)["jaccard"]

    return TrainedGeoModel(
        exploit=exploit,
        tree_models=trees_full,
        linear_model=ridge_full,
        scaler=scaler,
        feature_cols=cols,
        cv_mae=cv_mae,
        cv_r2=cv_r2,
        spearman_vs_gsi=spearman,
        top10_jaccard_vs_gsi=jaccard,
    )


def train_all_exploits(
    panel: pd.DataFrame,
    gsi_reference_per_exploit: Dict[str, pd.Series] | None = None,
    seed: int = 0,
) -> Dict[str, TrainedGeoModel]:
    """Convenience: train one TrainedGeoModel per exploit type."""
    out: Dict[str, TrainedGeoModel] = {}
    for exploit in EXPLOIT_TYPES:
        ref = (gsi_reference_per_exploit or {}).get(exploit)
        out[exploit] = train_for_exploit(panel, exploit, gsi_reference=ref, seed=seed)
    return out
