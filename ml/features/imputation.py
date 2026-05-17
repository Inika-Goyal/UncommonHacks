"""Region-aware missing-value imputation.

The single-source synthetic era used `fillna(panel[col].median())`. With
multiple incoming sources (WGI/UNHCR/ACLED/CPI), per-column missingness
clusters geographically — UNHCR doesn't publish for some Pacific island
states, ACLED skips quiet OECD countries, etc. Imputing with a global
median in those cases pulls the country toward "average" in ways that
bias the prediction toward the global mean.

This module instead:

  1. Imputes with the **regional median** when the country's region has
     at least `min_region_n` observed values (default 5).
  2. Falls back to the **global median** otherwise.
  3. Records, per column, what fraction of values were imputed and at
     which tier — exposed in the quality report so the operator can
     judge how synthetic a column has become.

Region is the GSI `region` field (UNESCO/Walk Free regional buckets)
because every real-data row has it. If `region` is absent the function
behaves like plain global-median imputation and records that fact.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

import numpy as np
import pandas as pd


@dataclass
class ImputationReport:
    """Per-column imputation log. JSON-friendly via `to_dict`."""

    regional_imputed: Dict[str, int] = field(default_factory=dict)
    global_imputed: Dict[str, int] = field(default_factory=dict)
    column_used_region: Dict[str, bool] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "regional_imputed_counts": self.regional_imputed,
            "global_imputed_counts": self.global_imputed,
            "column_used_region": self.column_used_region,
        }

    def total_imputed(self) -> int:
        return sum(self.regional_imputed.values()) + sum(self.global_imputed.values())


def impute(
    panel: pd.DataFrame,
    columns: List[str],
    region_col: str = "region",
    min_region_n: int = 5,
) -> tuple[pd.DataFrame, ImputationReport]:
    """Region-then-global median impute.

    Returns a copy of `panel` with NaNs filled in `columns`, plus an
    ImputationReport detailing what was filled how. The original frame
    is not mutated so the data-quality report can still see raw
    missingness.
    """
    out = panel.copy()
    report = ImputationReport()

    use_region = region_col in out.columns
    if not use_region:
        # No region column → fall back to global-median for everything.
        for col in columns:
            if col not in out.columns:
                continue
            n_missing = int(out[col].isna().sum())
            if n_missing == 0:
                report.column_used_region[col] = False
                continue
            out[col] = out[col].fillna(out[col].median())
            report.global_imputed[col] = n_missing
            report.column_used_region[col] = False
        return out, report

    for col in columns:
        if col not in out.columns:
            continue
        n_missing_total = int(out[col].isna().sum())
        if n_missing_total == 0:
            report.column_used_region[col] = False
            continue

        # Per-region median map. Regions whose observed-count is below
        # the threshold fall through to the global median.
        observed = out[[region_col, col]].dropna()
        region_counts = observed.groupby(region_col)[col].size()
        eligible_regions = set(region_counts[region_counts >= min_region_n].index)
        region_medians = (
            observed[observed[region_col].isin(eligible_regions)]
            .groupby(region_col)[col]
            .median()
            .to_dict()
        )

        global_median = float(out[col].median())
        if np.isnan(global_median):
            # Column is entirely NaN — nothing useful to impute with.
            # Fill with 0 and warn via the report.
            global_median = 0.0

        regional_filled = 0
        global_filled = 0
        new_values = out[col].copy()
        for idx in out.index[out[col].isna()]:
            region = out.at[idx, region_col]
            if isinstance(region, str) and region in region_medians:
                new_values.at[idx] = region_medians[region]
                regional_filled += 1
            else:
                new_values.at[idx] = global_median
                global_filled += 1
        out[col] = new_values

        report.regional_imputed[col] = regional_filled
        report.global_imputed[col] = global_filled
        report.column_used_region[col] = regional_filled > 0

    return out, report
