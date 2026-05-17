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
from ..data.quality import run_quality_checks, QualityReport
from ..features.imputation import impute, ImputationReport
from ..features.multicollinearity import drop_redundant_columns, CollinearityReport


TARGET_COL = "observed_prevalence_per_1k"


def build_supervised_table(
    panel: pd.DataFrame,
    predictor_cols: List[str] | None = None,
) -> pd.DataFrame:
    """Filter to rows with a non-null target. Predictor NaNs are tolerated
    here — `train_geographic` runs imputation before fitting."""
    cols = list(predictor_cols) if predictor_cols is not None else list(PREDICTOR_COLS)
    sub = panel.dropna(subset=[TARGET_COL]).reset_index(drop=True)
    # Make sure every predictor column at least exists in the frame; if
    # an optional source wasn't loaded the caller should have filtered
    # the column out before calling us.
    missing_cols = [c for c in cols if c not in sub.columns]
    if missing_cols:
        raise ValueError(
            f"predictor columns not in panel: {missing_cols}. "
            "Pass an explicit `predictor_cols` matching the loaded panel."
        )
    return sub


def feature_matrix(
    df: pd.DataFrame, predictor_cols: List[str] | None = None,
) -> Tuple[pd.DataFrame, List[str]]:
    cols = list(predictor_cols) if predictor_cols is not None else list(PREDICTOR_COLS)
    return df[cols].copy(), cols


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
    # New, optional fields populated by the expanded-data pipeline.
    # Default-None so existing joblib artifacts continue to load.
    quality_report: QualityReport | None = None
    imputation_report: ImputationReport | None = None
    collinearity_report: CollinearityReport | None = None
    log_target: bool = False  # train_geographic may switch to log1p(y)

    def predict(self, X: pd.DataFrame) -> Dict[str, np.ndarray]:
        Xs = self.scaler.transform(X[self.feature_cols])
        tree_preds = np.stack(
            [m.predict(X[self.feature_cols].values) for m in self.tree_models],
            axis=0,
        )
        tree_mean = tree_preds.mean(axis=0)
        tree_std = tree_preds.std(axis=0)
        lin_pred = self.linear_model.predict(Xs)

        mean_internal = 0.5 * tree_mean + 0.5 * lin_pred
        spread_internal = tree_std + 0.5 * np.abs(tree_mean - lin_pred)
        lower_internal = mean_internal - self.conformal_half_width
        upper_internal = mean_internal + self.conformal_half_width

        # If the model was fit on log1p(y), expm1 the predictions back to
        # the original scale. The conformal half-width was derived on the
        # log scale, so the interval endpoints must be expm1-ed too, then
        # clipped — *NOT* mean ± expm1(half_width).
        if self.log_target:
            mean = np.expm1(mean_internal)
            lower = np.clip(np.expm1(lower_internal), 0, None)
            upper = np.expm1(upper_internal)
            spread = np.expm1(mean_internal + spread_internal) - np.expm1(mean_internal)
        else:
            mean = mean_internal
            lower = np.clip(lower_internal, 0, None)
            upper = upper_internal
            spread = spread_internal
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
    predictor_cols: List[str] | None = None,
    n_bags: int = 8,
    seed: int = 0,
    n_splits: int = 5,
    conformal_alpha: float = 0.20,
    auto_log_target: bool = True,
    drop_collinear: bool = True,
    ridge_alpha: float | None = None,
) -> TrainedGeoModel:
    """Fit one geographic model on (possibly expanded) predictors.

    Pipeline:
      0. Quality scan — missingness, outliers, multicollinearity, target
         skew. Columns above the missingness threshold are dropped.
      1. Region-aware median imputation of remaining NaNs.
      2. Optional greedy collinearity reduction (|r| > 0.85 pairs).
      3. Optional log1p target if it's approximately log-normal.
      4. Ridge alpha auto-scales with the (post-drop) predictor count
         when not overridden — more predictors → stronger regularisation.
      5. KFold CV → fold MAE / R² and per-fold empirical coverage.
      6. Dedicated calibration split → production conformal half-width.
      7. Refit on the full panel for the production tree + ridge.

    `predictor_cols=None` keeps backwards-compatible behavior (uses
    `data.real.PREDICTOR_COLS`).
    """
    cols_in = list(predictor_cols) if predictor_cols is not None else list(PREDICTOR_COLS)

    # ---- 0. Quality scan -------------------------------------------------
    quality = run_quality_checks(panel, predictor_cols=cols_in, target_col=TARGET_COL)
    # Drop high-missingness columns the report flagged.
    retained = [c for c in cols_in if c not in quality.columns_to_drop]

    # ---- 1. Region-aware imputation -------------------------------------
    imputed, imp_report = impute(panel, columns=retained)

    # ---- 2. Collinearity reduction --------------------------------------
    collin_report = CollinearityReport()
    if drop_collinear and len(retained) > 1:
        retained, collin_report = drop_redundant_columns(imputed, retained)

    # ---- 3. Decide on log target ----------------------------------------
    log_target = bool(
        auto_log_target
        and not np.isnan(quality.target_log_normality_p)
        and quality.target_log_normality_p > 0.05
        and (imputed[TARGET_COL] >= 0).all()
    )

    # ---- 4. Build supervised table on the cleaned panel -----------------
    table = build_supervised_table(imputed, predictor_cols=retained)
    X_df, cols = feature_matrix(table, predictor_cols=retained)
    y_raw = table[TARGET_COL].values
    y = np.log1p(y_raw) if log_target else y_raw

    # Auto-scale Ridge alpha when caller didn't override: more predictors
    # → more regularisation, capped so we don't oversmooth small models.
    if ridge_alpha is None:
        ridge_alpha = float(min(10.0, 1.0 + 0.5 * max(0, len(cols) - 5)))

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
        ridge = Ridge(alpha=ridge_alpha).fit(X_tr_s, y[tr_idx])

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
    ridge_cal = Ridge(alpha=ridge_alpha).fit(X_train_s, y[cal_train_idx])
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
    ridge_full = Ridge(alpha=ridge_alpha).fit(X_full, y)

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
        quality_report=quality,
        imputation_report=imp_report,
        collinearity_report=collin_report,
        log_target=log_target,
    )
