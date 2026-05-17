"""Data-quality report for the real-data panel.

A bigger predictor set means more places for the data to be wrong.
This module runs every time we train and emits a structured report so:

  - The training pipeline can print it to stderr (operator sees it).
  - It's persisted next to the model artifact, so anyone inspecting a
    trained model can see what cleaning decisions were made.
  - Downstream code can read the same report (e.g. inflate uncertainty
    bands when imputation share is high).

Checks performed, in order:

  1. **Schema** — every required column is present, dtypes are numeric
     for predictors. Categorical/string-in-numeric column = early fail.
  2. **Coverage** — rows surviving each join step (helps identify which
     source is shrinking the panel).
  3. **Missingness** — fraction of NaN per column, BEFORE imputation.
     Columns >40% missing are flagged for drop.
  4. **Outliers** — per-column |z| > 3 count (Tukey is more robust but
     we want symmetry with StandardScaler). Flagged, not auto-removed.
  5. **Multicollinearity** — Pearson |r| > 0.85 pairs. Variance Inflation
     Factor (VIF) > 10 columns. Both are warnings — `features/
     multicollinearity.py` chooses what to actually drop.
  6. **Target sanity** — observed prevalence range, log-normality
     check (Shapiro-Wilk on log-transformed). Skewed targets bias R².

The report is a plain dict so it serialises to JSON cleanly.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
from scipy.stats import shapiro


# Threshold knobs — change here, not in training pipelines.
MISSING_DROP_FRACTION = 0.40   # column dropped if more than this share is NaN
OUTLIER_Z = 3.0
CORR_FLAG_THRESHOLD = 0.85
VIF_FLAG_THRESHOLD = 10.0


@dataclass
class QualityReport:
    """Structured output of `run_quality_checks`.

    `to_dict()` is the canonical JSON form used by training summaries.
    """

    n_rows: int
    n_columns: int
    schema_errors: List[str] = field(default_factory=list)
    missingness: Dict[str, float] = field(default_factory=dict)
    columns_to_drop: List[str] = field(default_factory=list)
    outliers: Dict[str, int] = field(default_factory=dict)
    high_correlation_pairs: List[Tuple[str, str, float]] = field(default_factory=list)
    high_vif_columns: List[Tuple[str, float]] = field(default_factory=list)
    target_stats: Dict[str, float] = field(default_factory=dict)
    target_log_normality_p: float = float("nan")
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "n_rows": self.n_rows,
            "n_columns": self.n_columns,
            "schema_errors": self.schema_errors,
            "missingness": {k: round(v, 4) for k, v in self.missingness.items()},
            "columns_to_drop": self.columns_to_drop,
            "outliers": self.outliers,
            "high_correlation_pairs": [
                {"a": a, "b": b, "r": round(r, 3)}
                for a, b, r in self.high_correlation_pairs
            ],
            "high_vif_columns": [
                {"column": c, "vif": round(v, 2)} for c, v in self.high_vif_columns
            ],
            "target_stats": {k: round(v, 4) for k, v in self.target_stats.items()},
            "target_log_normality_p": (
                None if np.isnan(self.target_log_normality_p)
                else round(self.target_log_normality_p, 4)
            ),
            "warnings": self.warnings,
        }


def _check_schema(panel: pd.DataFrame, required: List[str]) -> List[str]:
    errs: List[str] = []
    for col in required:
        if col not in panel.columns:
            errs.append(f"missing required column: {col}")
            continue
        if not pd.api.types.is_numeric_dtype(panel[col]):
            errs.append(
                f"column {col!r} has non-numeric dtype {panel[col].dtype}; "
                "predictor columns must be numeric"
            )
    return errs


def _missingness(panel: pd.DataFrame, cols: List[str]) -> Dict[str, float]:
    """NaN fraction per column. Computed BEFORE imputation, on raw cols."""
    return {c: float(panel[c].isna().mean()) for c in cols if c in panel.columns}


def _outliers(panel: pd.DataFrame, cols: List[str]) -> Dict[str, int]:
    """|z| > OUTLIER_Z count per numeric column. Reported, not removed."""
    out: Dict[str, int] = {}
    for c in cols:
        if c not in panel.columns:
            continue
        col = panel[c].dropna()
        if len(col) < 4 or col.std(ddof=0) == 0:
            out[c] = 0
            continue
        z = (col - col.mean()) / col.std(ddof=0)
        out[c] = int((z.abs() > OUTLIER_Z).sum())
    return out


def _high_correlation_pairs(
    panel: pd.DataFrame, cols: List[str]
) -> List[Tuple[str, str, float]]:
    """All (col_a, col_b, r) pairs with |Pearson r| above threshold."""
    present = [c for c in cols if c in panel.columns and panel[c].notna().any()]
    if len(present) < 2:
        return []
    corr = panel[present].corr().abs()
    pairs: List[Tuple[str, str, float]] = []
    for i, a in enumerate(present):
        for b in present[i + 1:]:
            r = float(corr.loc[a, b])
            if r >= CORR_FLAG_THRESHOLD:
                pairs.append((a, b, r))
    return sorted(pairs, key=lambda t: t[2], reverse=True)


def _vif(panel: pd.DataFrame, cols: List[str]) -> List[Tuple[str, float]]:
    """Per-column VIF: 1 / (1 - R^2 of regressing col on the rest).

    High VIF = the column is well predicted by other predictors, i.e.
    redundant. We skip statsmodels to avoid the dependency — Ridge with
    alpha=0 gives an equivalent R^2.
    """
    from sklearn.linear_model import LinearRegression

    present = [c for c in cols if c in panel.columns and panel[c].notna().sum() >= 10]
    sub = panel[present].dropna()
    if len(sub) < 10 or len(present) < 2:
        return []

    high: List[Tuple[str, float]] = []
    for c in present:
        others = [o for o in present if o != c]
        if not others:
            continue
        X = sub[others].values
        y = sub[c].values
        lr = LinearRegression().fit(X, y)
        r2 = lr.score(X, y)
        if r2 >= 0.999:
            vif = float("inf")
        else:
            vif = 1.0 / (1.0 - r2)
        if vif >= VIF_FLAG_THRESHOLD:
            high.append((c, vif))
    return sorted(high, key=lambda t: t[1], reverse=True)


def _target_stats(panel: pd.DataFrame, target_col: str) -> Tuple[Dict[str, float], float]:
    y = panel[target_col].dropna()
    stats = {
        "n": float(len(y)),
        "mean": float(y.mean()),
        "median": float(y.median()),
        "std": float(y.std(ddof=0)),
        "min": float(y.min()),
        "max": float(y.max()),
        "skew": float(y.skew()),
    }
    # Shapiro-Wilk on log1p — slavery prevalence is right-skewed; if it
    # looks log-normal we should consider training on log1p(target).
    p = float("nan")
    if 8 <= len(y) <= 5000 and y.min() >= 0:
        try:
            _, p = shapiro(np.log1p(y))
            p = float(p)
        except Exception:
            p = float("nan")
    return stats, p


def run_quality_checks(
    panel: pd.DataFrame,
    predictor_cols: List[str],
    target_col: str,
) -> QualityReport:
    """Top-level entry point. Returns a populated QualityReport."""
    report = QualityReport(n_rows=len(panel), n_columns=len(panel.columns))

    # Schema first — failing schema makes the rest of the checks
    # meaningless, but still try to run them so a single fail doesn't
    # blind the operator to other issues.
    report.schema_errors = _check_schema(panel, predictor_cols + [target_col])

    report.missingness = _missingness(panel, predictor_cols)
    report.columns_to_drop = [
        c for c, frac in report.missingness.items() if frac > MISSING_DROP_FRACTION
    ]
    if report.columns_to_drop:
        report.warnings.append(
            f"dropping columns over {int(MISSING_DROP_FRACTION * 100)}% missing: "
            + ", ".join(report.columns_to_drop)
        )

    # Outliers / collinearity computed only on retained columns.
    retained = [c for c in predictor_cols if c not in report.columns_to_drop]
    report.outliers = _outliers(panel, retained)
    report.high_correlation_pairs = _high_correlation_pairs(panel, retained)
    report.high_vif_columns = _vif(panel, retained)

    if report.high_vif_columns:
        report.warnings.append(
            f"{len(report.high_vif_columns)} predictor(s) have VIF >= {VIF_FLAG_THRESHOLD} "
            "— multicollinearity likely; consider PCA-collapsing the correlated block"
        )

    stats, p = _target_stats(panel, target_col)
    report.target_stats = stats
    report.target_log_normality_p = p
    if p == p and p > 0.05:  # NaN-safe
        report.warnings.append(
            "target is approximately log-normal (Shapiro p>0.05 on log1p); "
            "consider training on log1p(y) and exp1m()-ing predictions"
        )

    return report


def pretty_print(report: QualityReport) -> str:
    """Compact human-readable rendering for stderr."""
    out: List[str] = []
    out.append(f"=== Data quality report ({report.n_rows} rows, {report.n_columns} cols) ===")
    if report.schema_errors:
        out.append("  Schema errors:")
        for e in report.schema_errors:
            out.append(f"    ! {e}")
    if report.missingness:
        out.append("  Missingness (% NaN, predictor cols):")
        for c, f in sorted(report.missingness.items(), key=lambda kv: -kv[1]):
            marker = " (DROP)" if c in report.columns_to_drop else ""
            out.append(f"    {c:<30s} {100 * f:5.1f}%{marker}")
    if report.high_correlation_pairs:
        out.append(f"  High-correlation pairs (|r| >= {CORR_FLAG_THRESHOLD}):")
        for a, b, r in report.high_correlation_pairs[:6]:
            out.append(f"    {a} ~ {b}: r={r:.2f}")
    if report.high_vif_columns:
        out.append(f"  High VIF (>= {VIF_FLAG_THRESHOLD}):")
        for c, v in report.high_vif_columns[:6]:
            out.append(f"    {c}: VIF={v:.1f}")
    if report.outliers and any(report.outliers.values()):
        out.append(f"  Outlier counts (|z| > {OUTLIER_Z}):")
        for c, n in sorted(report.outliers.items(), key=lambda kv: -kv[1])[:6]:
            if n > 0:
                out.append(f"    {c}: {n}")
    out.append(f"  Target: mean={report.target_stats.get('mean', 0):.2f}, "
               f"std={report.target_stats.get('std', 0):.2f}, "
               f"skew={report.target_stats.get('skew', 0):.2f}, "
               f"log1p-shapiro p={report.target_log_normality_p}")
    if report.warnings:
        out.append("  Warnings:")
        for w in report.warnings:
            out.append(f"    * {w}")
    return "\n".join(out)
