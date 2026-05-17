"""DEPRECATED — synthetic country-year panel (sample data only).

The production pipeline trains on the real GSI+WDI+RSF panel built
in `ml/data/real.py`. This generator stays in the tree for two
narrow purposes:

  1. Regression-testing the synthetic-era report builder
     (`ml/app/build_sample.py`) and any other code paths that
     intentionally pre-date the real-data refactor.
  2. Reference for the shape of a multi-year, per-exploit-type panel
     in case we extend the real loader to that level later.

It is NOT loaded by `train_geographic`, `train_cluster`, `predict`,
`eval/performance`, or `eval/sanity`. Don't import it from real-data
code paths.

This file was previously imported as `ml.data.synthetic`. It now
lives at `ml.data.synthetic_sample` to make its purpose unambiguous.

The generator deliberately injects:
  - a country fixed-effect (so holding out whole countries is the only
    honest evaluation),
  - a press-freedom reporting bias (so models that ignore press freedom
    learn "more articles -> more exploitation"),
  - per-exploit-type weight differences (so the cluster model finds
    meaningfully different country profiles).

Outputs a tidy long-format DataFrame keyed by (country, year, exploit_type).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple

import numpy as np
import pandas as pd


# Four predicted exploit types — same set the product UI categorises by.
EXPLOIT_TYPES = ["forced_labor", "illegal_profits", "sexual_exploitation", "children"]

# Predictor columns grouped by block — kept here so other modules can
# import the same lists rather than re-typing them.
DEMOGRAPHIC_COLS = [
    "population_millions",
    "median_age",
    "youth_share_15_24",
    "urban_share",
]
ECONOMIC_COLS = [
    "gdp_per_capita_usd",
    "gini_index",
    "unemployment_rate",
    "informal_employment_share",
]
GOVERNANCE_COLS = [
    "wgi_rule_of_law",       # -2.5 (worst) .. +2.5 (best)
    "cpi_score",             # 0 (most corrupt) .. 100 (cleanest)
    "wjp_civil_justice",     # 0..1
    "freedom_house_score",   # 0..100
]
MIGRATION_COLS = [
    "migrant_stock_share",   # share of population that is foreign-born
    "internal_displaced_per_1k",
    "refugee_inflow_per_1k",
    "conflict_events_per_1m",
]
HELP_COLS = [
    "ngo_density_per_1m",
    "hotline_coverage",      # 0..1
    "unhcr_presence",        # 0/1
    "ilo_office_presence",   # 0/1
]
BIAS_COLS = [
    "press_freedom_score",   # 0 (worst) .. 100 (best, freest press)
]

PREDICTOR_COLS = (
    DEMOGRAPHIC_COLS
    + ECONOMIC_COLS
    + GOVERNANCE_COLS
    + MIGRATION_COLS
    + HELP_COLS
    + BIAS_COLS
)


@dataclass
class SyntheticPanel:
    """Holds the generated panel + the latent ground-truth prevalence.

    The latent table is exposed only for evaluation diagnostics; production
    models should never read it as a feature.
    """

    panel: pd.DataFrame
    latent_truth: pd.DataFrame


def _country_names(n: int) -> List[str]:
    # Use letter-coded synthetic country IDs so nothing here implies a
    # claim about any real country.
    return [f"C{idx:03d}" for idx in range(n)]


def _simulate_country_baselines(rng: np.random.Generator, n_countries: int) -> pd.DataFrame:
    """One-row-per-country baselines that persist across years.

    These create the country fixed-effect — i.e. country A is always
    poorer / less stable than country B regardless of year noise. This is
    what makes random row splits leaky.
    """
    countries = _country_names(n_countries)
    base = pd.DataFrame({
        "country": countries,
        # log-normal pop ~ exp(2.5) = 12M median; range ~1M..200M.
        "_pop_base": rng.lognormal(mean=2.5, sigma=1.2, size=n_countries),
        # GDP base centered at ~1.65, multiplied by 5000 downstream to
        # give USD per-capita in the realistic $500..$60k range.
        "_gdp_base": rng.lognormal(mean=0.5, sigma=1.0, size=n_countries),
        "_governance_base": rng.normal(0.0, 1.0, size=n_countries),
        "_conflict_base": rng.exponential(scale=1.0, size=n_countries),
        "_press_base": rng.uniform(15, 90, size=n_countries),
        # latent vulnerability that drives the outcome but isn't observed
        "_latent_vulnerability": rng.normal(0.0, 1.0, size=n_countries),
    })
    return base


def _draw_year_features(
    rng: np.random.Generator,
    base: pd.DataFrame,
    year: int,
) -> pd.DataFrame:
    """Generate predictor columns for a single year, given baselines."""
    n = len(base)
    # Mild year drift so longitudinal models have something to learn.
    drift = (year - 2015) * 0.02

    df = pd.DataFrame({"country": base["country"].values, "year": year})

    df["population_millions"] = (base["_pop_base"] * (1 + 0.01 * (year - 2015))).round(2)
    df["median_age"] = np.clip(
        18 + 12 * (base["_gdp_base"] / base["_gdp_base"].max()) + rng.normal(0, 1.5, n) + drift,
        15, 48,
    )
    df["youth_share_15_24"] = np.clip(
        0.30 - 0.10 * (base["_gdp_base"] / base["_gdp_base"].max()) + rng.normal(0, 0.02, n),
        0.08, 0.35,
    )
    df["urban_share"] = np.clip(
        0.30 + 0.40 * (base["_gdp_base"] / base["_gdp_base"].max()) + rng.normal(0, 0.05, n) + drift,
        0.15, 0.95,
    )

    df["gdp_per_capita_usd"] = (base["_gdp_base"] * 5000 * (1 + rng.normal(0, 0.05, n))).round()
    df["gini_index"] = np.clip(
        45 - 0.0004 * df["gdp_per_capita_usd"] + rng.normal(0, 3, n), 22, 65,
    )
    df["unemployment_rate"] = np.clip(
        12 - 0.0003 * df["gdp_per_capita_usd"] + rng.normal(0, 2, n), 1, 35,
    )
    df["informal_employment_share"] = np.clip(
        0.70 - 0.000025 * df["gdp_per_capita_usd"] + rng.normal(0, 0.06, n), 0.05, 0.92,
    )

    df["wgi_rule_of_law"] = np.clip(base["_governance_base"] + rng.normal(0, 0.25, n), -2.5, 2.5)
    df["cpi_score"] = np.clip(40 + 18 * base["_governance_base"] + rng.normal(0, 5, n), 5, 95)
    df["wjp_civil_justice"] = np.clip(
        0.50 + 0.15 * base["_governance_base"] + rng.normal(0, 0.05, n), 0.10, 0.95,
    )
    df["freedom_house_score"] = np.clip(
        50 + 25 * base["_governance_base"] + rng.normal(0, 7, n), 5, 100,
    )

    df["migrant_stock_share"] = np.clip(
        np.abs(rng.normal(0.05, 0.05, n)) + 0.02 * (df["gdp_per_capita_usd"] > 15000),
        0, 0.6,
    )
    df["internal_displaced_per_1k"] = np.clip(
        base["_conflict_base"] * rng.gamma(1.5, 1.0, n), 0, 200,
    )
    df["refugee_inflow_per_1k"] = np.clip(
        base["_conflict_base"] * rng.gamma(1.0, 0.8, n) * 0.4, 0, 80,
    )
    df["conflict_events_per_1m"] = np.clip(
        base["_conflict_base"] * rng.gamma(2.0, 1.5, n), 0, 800,
    )

    df["ngo_density_per_1m"] = np.clip(
        2 + 8 * (base["_governance_base"] + 1.5) + rng.normal(0, 2, n), 0.1, 60,
    )
    df["hotline_coverage"] = np.clip(
        0.20 + 0.20 * (base["_governance_base"] + 1.5) + rng.normal(0, 0.08, n), 0, 1,
    )
    df["unhcr_presence"] = (df["refugee_inflow_per_1k"] > 1).astype(int)
    df["ilo_office_presence"] = (rng.random(n) < (0.3 + 0.2 * (base["_governance_base"] + 1.5))).astype(int)

    df["press_freedom_score"] = np.clip(base["_press_base"] + rng.normal(0, 4, n), 5, 95)

    return df


# Per-exploit-type coefficient profiles. Picking these by hand makes the
# four outcomes meaningfully different so clustering on predictors
# actually separates them — instead of all four being a single signal
# with relabelled headers.
_EXPLOIT_COEFFS = {
    "forced_labor": {
        "informal_employment_share":  1.8,
        "gdp_per_capita_usd":        -0.00004,
        "wgi_rule_of_law":           -0.6,
        "conflict_events_per_1m":     0.004,
        "hotline_coverage":          -0.7,
    },
    "illegal_profits": {
        "cpi_score":                 -0.025,
        "freedom_house_score":       -0.012,
        "gdp_per_capita_usd":        -0.00002,
        "migrant_stock_share":        1.0,
    },
    "sexual_exploitation": {
        "migrant_stock_share":        2.2,
        "youth_share_15_24":          3.0,
        "wjp_civil_justice":         -1.4,
        "ngo_density_per_1m":        -0.02,
    },
    "children": {
        "youth_share_15_24":          4.0,
        "informal_employment_share":  1.4,
        "freedom_house_score":       -0.010,
        "gdp_per_capita_usd":        -0.00003,
    },
}

# Constant offset per exploit. Calibrated so no single exploit dominates
# the (country, year)-level argmax — without this the cluster model's
# "dominant exploit per cluster" labels collapse to one value.
_EXPLOIT_INTERCEPT = {
    "forced_labor":         0.1,
    "illegal_profits":      2.3,
    "sexual_exploitation":  0.6,
    "children":            -0.6,
}


def _latent_prevalence(
    features: pd.DataFrame,
    base: pd.DataFrame,
    exploit: str,
    rng: np.random.Generator,
) -> np.ndarray:
    """Compute true per-1000-population prevalence (unobserved by models).

    Adds the country's _latent_vulnerability so identical observable
    features can still produce different outcomes per country — the
    irreducible noise floor any honest model has to live with.
    """
    coeffs = _EXPLOIT_COEFFS[exploit]
    linear = np.full(len(features), _EXPLOIT_INTERCEPT[exploit])
    for col, c in coeffs.items():
        linear = linear + c * features[col].values
    linear = linear + 0.4 * base["_latent_vulnerability"].values
    # softplus to keep prevalence positive and bounded-ish.
    prevalence = np.log1p(np.exp(linear)) + rng.normal(0, 0.15, len(features))
    return np.clip(prevalence, 0.0, 60.0)


def _apply_reporting_bias(
    true_prevalence: np.ndarray,
    press_freedom: np.ndarray,
    rng: np.random.Generator,
) -> np.ndarray:
    """Convert latent prevalence -> *observed* prevalence (what models see).

    Free-press countries surface a larger fraction of the true cases.
    Closed-press countries under-report. The geographic model has to
    correct for this; if it doesn't, it will rank Sweden above Eritrea.
    """
    # Map press_freedom 0..100 to a reporting multiplier 0.25..1.0.
    multiplier = 0.25 + 0.0075 * press_freedom
    noise = np.exp(rng.normal(0, 0.10, len(true_prevalence)))
    return true_prevalence * multiplier * noise


def generate_panel(
    n_countries: int = 60,
    years: Tuple[int, ...] = (2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022),
    seed: int = 7,
) -> SyntheticPanel:
    """Build a long-format panel (country, year, exploit_type) + features.

    Returns both the modelling panel (with `observed_prevalence_per_1k`)
    and the latent ground-truth table for diagnostic plots.
    """
    rng = np.random.default_rng(seed)
    base = _simulate_country_baselines(rng, n_countries)

    year_frames: List[pd.DataFrame] = []
    truth_rows: List[dict] = []

    for year in years:
        feats = _draw_year_features(rng, base, year)

        for exploit in EXPLOIT_TYPES:
            true_p = _latent_prevalence(feats, base, exploit, rng)
            observed_p = _apply_reporting_bias(true_p, feats["press_freedom_score"].values, rng)

            # Also derive an observed case count (used by the cluster
            # model as an additional feature). 1000-scaled prevalence
            # times population in thousands gives raw cases.
            cases = observed_p * (feats["population_millions"].values * 1_000)

            row = feats.copy()
            row["exploit_type"] = exploit
            row["true_prevalence_per_1k"] = true_p
            row["observed_prevalence_per_1k"] = observed_p
            row["observed_cases"] = np.round(cases).astype(int)
            year_frames.append(row)

            for c, t, o in zip(feats["country"].values, true_p, observed_p):
                truth_rows.append({
                    "country": c, "year": year, "exploit_type": exploit,
                    "true_prevalence_per_1k": t,
                    "observed_prevalence_per_1k": o,
                })

    panel = pd.concat(year_frames, ignore_index=True)
    latent_truth = pd.DataFrame(truth_rows)

    return SyntheticPanel(panel=panel, latent_truth=latent_truth)


def save_panel(panel: SyntheticPanel, out_dir: str) -> Tuple[str, str]:
    """Persist panel + latent-truth as parquet (falls back to CSV)."""
    import os
    os.makedirs(out_dir, exist_ok=True)
    panel_path = os.path.join(out_dir, "panel.csv")
    truth_path = os.path.join(out_dir, "latent_truth.csv")
    panel.panel.to_csv(panel_path, index=False)
    panel.latent_truth.to_csv(truth_path, index=False)
    return panel_path, truth_path


if __name__ == "__main__":
    # Quick sanity entry point: regenerate a panel into ml/artifacts/.
    import os
    out = os.path.join(os.path.dirname(__file__), "..", "artifacts", "synthetic")
    sp = generate_panel()
    p, t = save_panel(sp, out_dir=out)
    print(f"Wrote panel  -> {p}  shape={sp.panel.shape}")
    print(f"Wrote truth  -> {t}  shape={sp.latent_truth.shape}")
