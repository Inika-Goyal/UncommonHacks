"""Geographic exploitation-prevalence model — single output, real data.

Design (post-real-data rewrite):

  - One model, one target: overall modern-slavery prevalence per 1,000
    population (GSI 2023). The per-exploit dimension that the old
    synthetic version exposed is now applied at INFERENCE time by
    `pipelines/predict.py` using fixed ILO global proportions; it is
    not part of the model.

  - Two predictors trained side by side: a GradientBoosting tree
    ensemble (captures non-linear interactions) and a Ridge linear
    model (interpretable, stable). Their predictions are averaged.

  - Cross-validation: random 5-fold KFold. Each row is one country, so
    there is no country-grouping or time-forward dimension to enforce.

  - Uncertainty bands: split-conformal prediction (Vovk et al.). A
    calibration block is held out from training, ensemble residuals
    are computed there, and the (1 - alpha)-quantile of |residual|
    becomes a fixed half-width that applies to every future
    prediction. Default alpha = 0.20, so the marginal-coverage target
    is 80%.

  - Empirical coverage is also measured on the KFold test folds and
    reported alongside CV MAE / R² so the reader can sanity-check
    that the marginal guarantee holds in practice.

  - The reporting-bias adjuster (`features/reporting_bias.py`) is NOT
    used. On synthetic data it was the literal inverse of the bias
    formula in the generator (tautological). On real data the bias
    structure is unknown and exploit-type-specific, so we train on raw
    observed prevalence and accept whatever bias is baked into GSI.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import KFold, train_test_split
from sklearn.preprocessing import StandardScaler

from ..data.real import PREDICTOR_COLS


TARGET_COL = "observed_prevalence_per_1k"


def build_supervised_table(panel: pd.DataFrame) -> pd.DataFrame:
    sub = panel.dropna(subset=[TARGET_COL] + list(PREDICTOR_COLS)).reset_index(drop=True)
    return sub


def feature_matrix(df: pd.DataFrame) -> Tuple[pd.DataFrame, List[str]]:
    return df[PREDICTOR_COLS].copy(), list(PREDICTOR_COLS)


@dataclass
class TrainedGeoModel:
    target_name: str
    tree_models: List[GradientBoostingRegressor]
    linear_model: Ridge
    scaler: StandardScaler
    feature_cols: List[str]
    cv_mae: float
    cv_r2: float
    conformal_half_width: float
    empirical_coverage_80: float
    n_training_rows: int

    def predict(self, X: pd.DataFrame) -> Dict[str, np.ndarray]:
        Xs = self.scaler.transform(X[self.feature_cols])
        tree_preds = np.stack(
            [m.predict(X[self.feature_cols].values) for m in self.tree_models],
            axis=0,
        )
        tree_mean = tree_preds.mean(axis=0)
        tree_std = tree_preds.std(axis=0)
        lin_pred = self.linear_model.predict(Xs)

        mean = 0.5 * tree_mean + 0.5 * lin_pred
        # Spread kept only for the downstream credibility heuristic; it
        # no longer defines the prediction band.
        spread = tree_std + 0.5 * np.abs(tree_mean - lin_pred)

        lower = np.clip(mean - self.conformal_half_width, 0, None)
        upper = mean + self.conformal_half_width
        return {"mean": mean, "lower": lower, "upper": upper, "spread": spread}


def _bagged_trees(
    X: np.ndarray,
    y: np.ndarray,
    n_bags: int = 8,
    seed: int = 0,
) -> List[GradientBoostingRegressor]:
    rng = np.random.default_rng(seed)
    n = len(y)
    models: List[GradientBoostingRegressor] = []
    for b in range(n_bags):
        idx = rng.integers(0, n, size=n)
        m = GradientBoostingRegressor(
            n_estimators=120,
            max_depth=3,
            learning_rate=0.06,
            subsample=0.85,
            random_state=seed + b,
        )
        m.fit(X[idx], y[idx])
        models.append(m)
    return models


def _ensemble_predict(
    trees: List[GradientBoostingRegressor],
    ridge: Ridge,
    X_raw: pd.DataFrame,
    X_scaled: np.ndarray,
) -> np.ndarray:
    tree_mean = np.mean([m.predict(X_raw.values) for m in trees], axis=0)
    lin_pred = ridge.predict(X_scaled)
    return 0.5 * tree_mean + 0.5 * lin_pred


def train_geographic(
    panel: pd.DataFrame,
    n_bags: int = 8,
    seed: int = 0,
    n_splits: int = 5,
    conformal_alpha: float = 0.20,
) -> TrainedGeoModel:
    """Fit one geographic model and return it.

    1. KFold CV → fold-wise MAE / R² and per-fold empirical coverage
       of a conformal half-width derived inside each fold.
    2. Dedicated calibration split → the production half-width.
    3. Refit on the full panel for the production tree + ridge.
    """
    table = build_supervised_table(panel)
    X_df, cols = feature_matrix(table)
    y = table[TARGET_COL].values

    fold_maes: List[float] = []
    fold_r2s: List[float] = []
    fold_covers: List[float] = []

    kf = KFold(n_splits=n_splits, shuffle=True, random_state=seed)
    for fold, (tr_idx, te_idx) in enumerate(kf.split(X_df)):
        scaler = StandardScaler().fit(X_df.iloc[tr_idx])
        X_tr_s = scaler.transform(X_df.iloc[tr_idx])
        X_te_s = scaler.transform(X_df.iloc[te_idx])

        trees = _bagged_trees(
            X_df.iloc[tr_idx].values, y[tr_idx], n_bags=4, seed=seed + fold
        )
        ridge = Ridge(alpha=1.0).fit(X_tr_s, y[tr_idx])

        ens_te = _ensemble_predict(trees, ridge, X_df.iloc[te_idx], X_te_s)
        fold_maes.append(mean_absolute_error(y[te_idx], ens_te))
        fold_r2s.append(r2_score(y[te_idx], ens_te))

        # Empirical-coverage sanity: derive a conformal half-width
        # inside this fold from a calibration hold-out, then check
        # what fraction of the actual test residuals fall inside it.
        cal_idx, hold_idx = train_test_split(
            np.arange(len(tr_idx)), test_size=0.25, random_state=seed + fold
        )
        cal_pred = _ensemble_predict(
            trees,
            ridge,
            X_df.iloc[tr_idx[hold_idx]],
            scaler.transform(X_df.iloc[tr_idx[hold_idx]]),
        )
        cal_res = np.abs(y[tr_idx[hold_idx]] - cal_pred)
        half_w_fold = float(np.quantile(cal_res, 1.0 - conformal_alpha))
        fold_covers.append(float(np.mean(np.abs(y[te_idx] - ens_te) <= half_w_fold)))

    # Production conformal: hold 20% as calibration, fit on the rest,
    # take the (1 - alpha)-quantile of |residual| as half-width.
    cal_train_idx, cal_hold_idx = train_test_split(
        np.arange(len(X_df)), test_size=0.20, random_state=seed
    )
    scaler_cal = StandardScaler().fit(X_df.iloc[cal_train_idx])
    X_train_s = scaler_cal.transform(X_df.iloc[cal_train_idx])
    trees_cal = _bagged_trees(
        X_df.iloc[cal_train_idx].values, y[cal_train_idx], n_bags=n_bags, seed=seed
    )
    ridge_cal = Ridge(alpha=1.0).fit(X_train_s, y[cal_train_idx])
    cal_pred = _ensemble_predict(
        trees_cal,
        ridge_cal,
        X_df.iloc[cal_hold_idx],
        scaler_cal.transform(X_df.iloc[cal_hold_idx]),
    )
    half_width = float(
        np.quantile(np.abs(y[cal_hold_idx] - cal_pred), 1.0 - conformal_alpha)
    )

    # Refit on full panel for production.
    scaler = StandardScaler().fit(X_df)
    X_full = scaler.transform(X_df)
    trees_full = _bagged_trees(X_df.values, y, n_bags=n_bags, seed=seed)
    ridge_full = Ridge(alpha=1.0).fit(X_full, y)

    return TrainedGeoModel(
        target_name=TARGET_COL,
        tree_models=trees_full,
        linear_model=ridge_full,
        scaler=scaler,
        feature_cols=cols,
        cv_mae=float(np.mean(fold_maes)),
        cv_r2=float(np.mean(fold_r2s)),
        conformal_half_width=half_width,
        empirical_coverage_80=float(np.mean(fold_covers)),
        n_training_rows=int(len(X_df)),
    )
