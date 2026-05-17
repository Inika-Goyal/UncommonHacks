"""Real country-level panel for the geographic + cluster models.

Joins three public datasets — all bundled as CSVs under `ml/data/raw/`:

  - Walk Free, Global Slavery Index 2023 (target: prevalence per 1,000)
  - World Bank, World Development Indicators 2021 (predictors)
  - Reporters Without Borders, Press Freedom Index 2021 (predictor)

Replaces the previous synthetic generator. The synthetic generator was
removed because (a) it baked the same closed-form relationship the model
was trained to recover, producing tautologically high metrics, and
(b) it never made any contact with reality.

Design notes:

  - One row per country (year = 2021). GSI 2023 publishes a single
    point estimate per country derived from multiple years of Walk Free
    surveys; treating it as 2021 matches the WDI/RSF year. Earlier GSI
    editions (2014/2018) used different methodology and are NOT
    longitudinally comparable, so we don't try to construct a panel.

  - The geographic model is single-output (overall modern-slavery
    prevalence per 1,000). The four-exploit-type breakdown in the
    output schema is applied at INFERENCE time using fixed proportions
    from the ILO Global Estimates of Modern Slavery 2022. Those
    proportions are GLOBAL and CONSTANT per country — they are not
    learned. This is honest because real per-country per-exploit
    prevalence is not publicly available at this granularity.

  - EXPLOIT_TYPES / EXPLOIT_BLOCKS constants are kept here so the rest
    of the package can import them without caring whether the upstream
    panel is real or synthetic.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import numpy as np
import pandas as pd


RAW_DIR = os.path.join(os.path.dirname(__file__), "raw")

# Kept for downstream API compatibility with the predict CLI and the TS
# bridge. The model itself no longer trains per-exploit.
EXPLOIT_TYPES = ("forced_labor", "sexual_exploitation", "children", "illegal_profits")

# Source: ILO Global Estimates of Modern Slavery 2022 (the joint ILO /
# Walk Free / IOM report). Forced labour and forced marriage together
# total 49.6M; within forced labour, ~12% are children and ~18% are in
# commercial sexual exploitation. We map those headline shares onto the
# four output buckets used by the rest of the product. These are
# GLOBAL proportions used to split a single per-country overall
# prediction — they are not per-country learned.
ILO_GLOBAL_PROPORTIONS = {
    "forced_labor": 0.55,
    "illegal_profits": 0.28,
    "sexual_exploitation": 0.10,
    "children": 0.07,
}

PREDICTOR_COLS = [
    "gdp_per_capita_log",
    "urban_share",
    "unemployment",
    "gini",
    "youth_dep_ratio",
    "population_log",
    "press_freedom_score",
    "vulnerability_total",
    "govt_response_total",
]

# Block tags used by the cluster model. With the GSI+WDI+RSF tier we
# only have demographic and economic blocks populated; the synthetic
# code's governance/migration/help blocks remain empty and the cluster
# model collapses to demographic+economic similarity.
DEMOGRAPHIC_COLS = ["urban_share", "youth_dep_ratio", "population_log"]
ECONOMIC_COLS = ["gdp_per_capita_log", "unemployment", "gini"]
GOVERNANCE_COLS: list[str] = []
MIGRATION_COLS: list[str] = []
HELP_COLS: list[str] = []


def _load_gsi() -> pd.DataFrame:
    df = pd.read_csv(os.path.join(RAW_DIR, "gsi_2023.csv"))
    return df.rename(
        columns={
            "iso3": "country",
            "prevalence_per_1k": "observed_prevalence_per_1k",
        }
    )[
        [
            "country",
            "country_name",
            "region",
            "observed_prevalence_per_1k",
            "vulnerability_total",
            "govt_response_total",
        ]
    ]


def _load_wdi() -> pd.DataFrame:
    wdi = pd.read_csv(os.path.join(RAW_DIR, "wdi.csv"))
    wdi = wdi[wdi["year"] == 2021].copy()
    wdi["gdp_per_capita_log"] = np.log1p(wdi["gdp_per_capita"])
    wdi["population_log"] = np.log1p(wdi["population"])
    return wdi.rename(columns={"iso3": "country"})[
        [
            "country",
            "gdp_per_capita_log",
            "population_log",
            "urban_share",
            "unemployment",
            "gini",
            "youth_dep_ratio",
        ]
    ]


def _load_rsf() -> pd.DataFrame:
    rsf = pd.read_csv(os.path.join(RAW_DIR, "rsf_2021.csv"))
    return rsf.rename(columns={"iso3": "country"})[["country", "press_freedom_score"]]


def load_panel() -> pd.DataFrame:
    """Inner-join the three sources, impute gini, drop rows with gaps."""
    panel = (
        _load_gsi()
        .merge(_load_wdi(), on="country", how="inner")
        .merge(_load_rsf(), on="country", how="inner")
    )
    # Gini is the only sparse column we tolerate; median-impute so we
    # don't lose ~30% of rows. Govt response is rarely null in this
    # tier but median-impute defensively.
    for col in ("gini", "govt_response_total", "vulnerability_total"):
        panel[col] = panel[col].fillna(panel[col].median())

    required = [
        "observed_prevalence_per_1k",
        "gdp_per_capita_log",
        "urban_share",
        "unemployment",
        "youth_dep_ratio",
        "population_log",
        "press_freedom_score",
    ]
    panel = panel.dropna(subset=required).reset_index(drop=True)
    panel["year"] = 2021
    return panel


@dataclass
class _RealPanel:
    """Compatibility shim mimicking the old SyntheticPanel return shape."""

    panel: pd.DataFrame
    latent_truth: None = None


def generate_panel() -> _RealPanel:
    return _RealPanel(panel=load_panel())


def _cli_check() -> int:
    panel = load_panel()
    print(f"Panel rows: {len(panel)}")
    print(f"Columns: {list(panel.columns)}")
    print()
    print("Non-null counts:")
    print(panel.notna().sum().to_string())
    print()
    print("Target stats (observed_prevalence_per_1k):")
    print(panel["observed_prevalence_per_1k"].describe().to_string())
    print()
    print("First 3 rows:")
    print(panel.head(3).to_string())
    return 0


if __name__ == "__main__":
    import sys

    if "--check" in sys.argv or len(sys.argv) == 1:
        raise SystemExit(_cli_check())
    print(f"Unknown args: {sys.argv[1:]}", file=__import__("sys").stderr)
    raise SystemExit(2)
