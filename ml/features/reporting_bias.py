"""Reporting-bias adjuster — DISABLED stub.

The previous closed-form formula (`0.25 + 0.0075 * press_freedom_score`)
was provably tautological: it was the exact inverse of the bias the
synthetic data generator applied, so the geographic model on synthetic
data was recovering an artificial symmetry, not a real signal.

On real data (GSI 2023), the bias structure is unknown, almost
certainly non-linear in press freedom, and exploit-type specific. Until
empirically calibrated against an ungate-keeper-able victim-count
source (e.g. UNODC GLOTIP asylum-system data), any closed-form adjuster
will mislead.

We keep the function names so accidental re-introduction fails loudly.
"""

from __future__ import annotations

import pandas as pd


_DISABLED_MSG = (
    "Reporting-bias adjuster is disabled. The historical closed-form "
    "formula was tautological on synthetic data and unjustified on real "
    "data. See ml/docs/questionable_choices.md item #2. To re-enable, "
    "implement empirical calibration (regress media-derived prevalence "
    "on victim-count prevalence with press-freedom as a covariate)."
)


def reporting_multiplier(press_freedom_score):  # noqa: ANN001
    raise NotImplementedError(_DISABLED_MSG)


def adjust_observed_prevalence(observed_prevalence, press_freedom_score):  # noqa: ANN001
    raise NotImplementedError(_DISABLED_MSG)


def add_bias_adjusted_target(
    df: pd.DataFrame,
    observed_col: str = "observed_prevalence_per_1k",
    press_col: str = "press_freedom_score",
    out_col: str = "adjusted_prevalence_per_1k",
) -> pd.DataFrame:
    raise NotImplementedError(_DISABLED_MSG)


__all__ = [
    "reporting_multiplier",
    "adjust_observed_prevalence",
    "add_bias_adjusted_target",
]
