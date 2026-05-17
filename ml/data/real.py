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

# Block tags used by the cluster model. The base predictor list above
# only covers demographic + economic + the WalkFree vulnerability/
# response indices. The OPTIONAL_*_COLS lists are populated only when
# the corresponding raw CSVs exist under `ml/data/raw/`; see the
# load_*() helpers below for the file conventions.
DEMOGRAPHIC_COLS = ["urban_share", "youth_dep_ratio", "population_log"]
ECONOMIC_COLS = ["gdp_per_capita_log", "unemployment", "gini"]
GOVERNANCE_COLS: list[str] = []
MIGRATION_COLS: list[str] = []
HELP_COLS: list[str] = []

# Names the optional loaders will populate if their source files exist.
# Listed here so the cluster model can reference the columns even when
# the loaders are no-ops; missing columns are filtered downstream.
OPTIONAL_GOVERNANCE_COLS = [
    "wgi_rule_of_law",
    "wgi_government_effectiveness",
    "cpi_score",
    "wjp_civil_justice",
]
OPTIONAL_MIGRATION_COLS = [
    "refugee_stock_per_1k",
    "internal_displaced_per_1k",
    "conflict_events_per_1m",
]
OPTIONAL_HELP_COLS = [
    "ngo_aid_projects_per_1m",
    "ilo_office_presence",
    "unhcr_presence",
]


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


# ---------------------------------------------------------------------------
# Optional source loaders.
# Each returns (DataFrame, list_of_columns_added). All return ([], []) when
# the source CSV is missing — by design, so the extended panel degrades
# gracefully on installations that haven't downloaded the heavier datasets.
#
# CSV file conventions (all under ml/data/raw/):
#   wgi_2021.csv      : iso3, wgi_rule_of_law, wgi_government_effectiveness
#   cpi_2021.csv      : iso3, cpi_score
#   wjp_2021.csv      : iso3, wjp_civil_justice
#   unhcr_2021.csv    : iso3, refugee_stock, idp_stock      (joined w/ pop)
#   acled_2021.csv    : iso3, conflict_events                (joined w/ pop)
#   ilo_offices.csv   : iso3, has_office (0/1)
#   ngoaidmap.csv     : iso3, project_count
# ---------------------------------------------------------------------------
def _try_load_csv(name: str) -> pd.DataFrame | None:
    path = os.path.join(RAW_DIR, name)
    if not os.path.exists(path):
        return None
    return pd.read_csv(path)


def _load_wgi() -> tuple[pd.DataFrame, list[str]]:
    df = _try_load_csv("wgi_2021.csv")
    if df is None:
        return pd.DataFrame(columns=["country"]), []
    df = df.rename(columns={"iso3": "country"})
    cols = [c for c in ("wgi_rule_of_law", "wgi_government_effectiveness") if c in df.columns]
    return df[["country"] + cols], cols


def _load_cpi() -> tuple[pd.DataFrame, list[str]]:
    df = _try_load_csv("cpi_2021.csv")
    if df is None:
        return pd.DataFrame(columns=["country"]), []
    df = df.rename(columns={"iso3": "country"})
    cols = ["cpi_score"] if "cpi_score" in df.columns else []
    return df[["country"] + cols], cols


def _load_wjp() -> tuple[pd.DataFrame, list[str]]:
    df = _try_load_csv("wjp_2021.csv")
    if df is None:
        return pd.DataFrame(columns=["country"]), []
    df = df.rename(columns={"iso3": "country"})
    cols = ["wjp_civil_justice"] if "wjp_civil_justice" in df.columns else []
    return df[["country"] + cols], cols


def _load_unhcr() -> tuple[pd.DataFrame, list[str]]:
    """Returns refugee + IDP stock normalised per 1,000 population.
    Requires `population` to be in the panel before merging."""
    df = _try_load_csv("unhcr_2021.csv")
    if df is None:
        return pd.DataFrame(columns=["country"]), []
    df = df.rename(columns={"iso3": "country"})
    # Per-1k normalisation happens after the merge in load_extended_panel;
    # here we just surface raw counts + a presence flag.
    out_cols = []
    for raw, out in (("refugee_stock", "_refugee_stock_raw"),
                     ("idp_stock", "_idp_stock_raw")):
        if raw in df.columns:
            df[out] = df[raw]
            out_cols.append(out)
    df["unhcr_presence"] = 1
    return df[["country", "unhcr_presence"] + out_cols], ["unhcr_presence"] + out_cols


def _load_acled() -> tuple[pd.DataFrame, list[str]]:
    df = _try_load_csv("acled_2021.csv")
    if df is None:
        return pd.DataFrame(columns=["country"]), []
    df = df.rename(columns={"iso3": "country"})
    if "conflict_events" not in df.columns:
        return df[["country"]], []
    df["_conflict_events_raw"] = df["conflict_events"]
    return df[["country", "_conflict_events_raw"]], ["_conflict_events_raw"]


def _load_ilo_offices() -> tuple[pd.DataFrame, list[str]]:
    df = _try_load_csv("ilo_offices.csv")
    if df is None:
        return pd.DataFrame(columns=["country"]), []
    df = df.rename(columns={"iso3": "country"})
    if "has_office" not in df.columns:
        return df[["country"]], []
    df["ilo_office_presence"] = df["has_office"].astype(int)
    return df[["country", "ilo_office_presence"]], ["ilo_office_presence"]


def _load_ngoaidmap() -> tuple[pd.DataFrame, list[str]]:
    df = _try_load_csv("ngoaidmap.csv")
    if df is None:
        return pd.DataFrame(columns=["country"]), []
    df = df.rename(columns={"iso3": "country"})
    if "project_count" not in df.columns:
        return df[["country"]], []
    df["_ngo_projects_raw"] = df["project_count"]
    return df[["country", "_ngo_projects_raw"]], ["_ngo_projects_raw"]


def load_extended_panel() -> tuple[pd.DataFrame, dict[str, list[str]]]:
    """Base GSI+WDI+RSF panel left-joined with every optional source
    that has a file on disk.

    Returns:
      - panel DataFrame (one row per country, year 2021)
      - dict mapping block name → list of columns actually populated,
        so the trainer knows which blocks to feed each model.

    Per-million / per-1k normalisations are applied here once
    `population` is available, then the raw `_*_raw` columns are dropped.
    """
    panel = load_panel()
    # Recover raw population (loaded above as `population_log`) so we
    # can normalise count-style features per-capita.
    wdi_pop = _try_load_csv("wdi.csv")
    if wdi_pop is not None and "population" in wdi_pop.columns:
        pop = wdi_pop.rename(columns={"iso3": "country"})[["country", "population"]]
        pop = pop.drop_duplicates("country")
        panel = panel.merge(pop, on="country", how="left")

    blocks: dict[str, list[str]] = {
        "governance_optional": [],
        "migration_optional": [],
        "help_optional": [],
    }

    # Governance.
    for loader in (_load_wgi, _load_cpi, _load_wjp):
        df, cols = loader()
        if cols:
            panel = panel.merge(df, on="country", how="left")
            blocks["governance_optional"].extend(cols)

    # Migration (requires population for per-1k normalisation).
    for loader in (_load_unhcr, _load_acled):
        df, raw_cols = loader()
        if not raw_cols:
            continue
        panel = panel.merge(df, on="country", how="left")
        if "_refugee_stock_raw" in raw_cols and "population" in panel.columns:
            panel["refugee_stock_per_1k"] = (
                panel["_refugee_stock_raw"] / panel["population"] * 1_000
            )
            blocks["migration_optional"].append("refugee_stock_per_1k")
        if "_idp_stock_raw" in raw_cols and "population" in panel.columns:
            panel["internal_displaced_per_1k"] = (
                panel["_idp_stock_raw"] / panel["population"] * 1_000
            )
            blocks["migration_optional"].append("internal_displaced_per_1k")
        if "_conflict_events_raw" in raw_cols and "population" in panel.columns:
            panel["conflict_events_per_1m"] = (
                panel["_conflict_events_raw"] / panel["population"] * 1_000_000
            )
            blocks["migration_optional"].append("conflict_events_per_1m")
        # binary presence flag carries through directly
        if "unhcr_presence" in raw_cols:
            blocks["migration_optional"].append("unhcr_presence")

    # Help / resource access.
    for loader in (_load_ilo_offices, _load_ngoaidmap):
        df, raw_cols = loader()
        if not raw_cols:
            continue
        panel = panel.merge(df, on="country", how="left")
        if "_ngo_projects_raw" in raw_cols and "population" in panel.columns:
            panel["ngo_aid_projects_per_1m"] = (
                panel["_ngo_projects_raw"] / panel["population"] * 1_000_000
            )
            blocks["help_optional"].append("ngo_aid_projects_per_1m")
        if "ilo_office_presence" in raw_cols:
            blocks["help_optional"].append("ilo_office_presence")

    # Drop the temporary raw columns; downstream code only needs the
    # normalised versions.
    raw_cols = [c for c in panel.columns if c.startswith("_") and c.endswith("_raw")]
    panel = panel.drop(columns=raw_cols, errors="ignore")
    if "population" in panel.columns:
        panel = panel.drop(columns=["population"], errors="ignore")

    return panel.reset_index(drop=True), blocks


def extended_predictor_cols(blocks: dict[str, list[str]]) -> list[str]:
    """Predictor list for the geographic model when training on the
    extended panel. Base predictors + any optional block columns that
    actually exist on disk."""
    return list(PREDICTOR_COLS) + sum(blocks.values(), [])


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
