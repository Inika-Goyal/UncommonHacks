"""Reporting-bias adjuster keyed on RSF press-freedom scores.

Without this, the geographic model would learn the wrong correlation:
free-press countries publish more articles -> the model labels them
higher-risk than closed-press countries that actually have worse
conditions. The adjuster inflates observed prevalence in low-press-
freedom countries before model training, so the target moves closer to
true (latent) prevalence.

The functional form mirrors `_apply_reporting_bias` in the synthetic
data generator. In production this would be calibrated empirically by
comparing UNODC GLOTIP victim counts (which include closed regimes
through asylum-system case data) to media-derived counts.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


# Same shape used in the synthetic generator: multiplier 0.25..1.0 over
# press_freedom_score 0..100. Real calibration would fit this from data.
def reporting_multiplier(press_freedom_score: np.ndarray | pd.Series) -> np.ndarray:
    arr = np.asarray(press_freedom_score, dtype=float)
    return 0.25 + 0.0075 * arr


def adjust_observed_prevalence(
    observed_prevalence: np.ndarray | pd.Series,
    press_freedom_score: np.ndarray | pd.Series,
) -> np.ndarray:
    """Return a bias-corrected estimate of true prevalence.

    `observed / multiplier` undoes the multiplicative reporting bias.
    Clipped above to avoid blow-ups when press freedom is near zero.
    """
    mult = reporting_multiplier(press_freedom_score)
    mult = np.clip(mult, 0.10, 1.0)
    return np.asarray(observed_prevalence, dtype=float) / mult


def add_bias_adjusted_target(df: pd.DataFrame,
                             observed_col: str = "observed_prevalence_per_1k",
                             press_col: str = "press_freedom_score",
                             out_col: str = "adjusted_prevalence_per_1k") -> pd.DataFrame:
    """Return a copy of `df` with the adjusted target appended."""
    out = df.copy()
    out[out_col] = adjust_observed_prevalence(out[observed_col], out[press_col])
    return out
