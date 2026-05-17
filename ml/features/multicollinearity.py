"""Multicollinearity reduction for the expanded predictor set.

With more incoming sources, correlated blocks appear naturally:
WGI rule-of-law / CPI corruption / WJP civil justice all proxy
"governance quality"; ACLED conflict-events / UNHCR refugee-inflow
both proxy "instability". Feeding all of them to Ridge inflates
coefficient variance; feeding them to KMeans makes the correlated
block dominate the Euclidean distance.

This module implements two complementary fixes:

  1. `drop_redundant_columns` — greedy correlation pruning. For each
     pair with |r| above the threshold, drop the column with higher
     mean correlation against the other predictors. Keeps the more
     "independent" representative.

  2. `pca_collapse_block` — fit a PCA on a block of related columns
     and replace the block with N components (default 1). Used by the
     cluster model so each conceptual block contributes equally.

Both functions return the transformed frame plus a structured log of
what they did, so the training summary can show "the model used 9 of
14 columns; dropped {wgi_voice_accountability, cpi_score, wjp_civil_justice} as
redundant with wgi_rule_of_law".
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

import numpy as np
import pandas as pd
from sklearn.decomposition import PCA


@dataclass
class CollinearityReport:
    dropped: List[str] = field(default_factory=list)
    kept_representatives: Dict[str, List[str]] = field(default_factory=dict)
    threshold: float = 0.85

    def to_dict(self) -> dict:
        return {
            "dropped": self.dropped,
            "kept_representatives": self.kept_representatives,
            "threshold": self.threshold,
        }


def drop_redundant_columns(
    panel: pd.DataFrame,
    columns: List[str],
    threshold: float = 0.85,
) -> tuple[List[str], CollinearityReport]:
    """Greedy pruning of highly-correlated columns.

    Strategy:
      - Compute the absolute correlation matrix of `columns`.
      - Walk pairs in descending |r|; for each (a, b) with |r| above
        threshold where both are still kept, drop the one with the
        higher average |r| against everything else (the "more
        redundant" one).
      - Record which kept column each dropped column corresponds to.

    Returns the list of kept columns plus a CollinearityReport.
    """
    present = [c for c in columns if c in panel.columns and panel[c].notna().any()]
    report = CollinearityReport(threshold=threshold)
    if len(present) < 2:
        return present, report

    corr = panel[present].corr().abs()
    avg_corr = (corr.sum(axis=1) - 1.0) / max(1, len(present) - 1)

    # Order pairs from most-correlated to least so we drop the worst
    # offenders first.
    pairs: List[tuple[float, str, str]] = []
    for i, a in enumerate(present):
        for b in present[i + 1:]:
            r = float(corr.loc[a, b])
            if r >= threshold:
                pairs.append((r, a, b))
    pairs.sort(reverse=True)

    kept = set(present)
    for _, a, b in pairs:
        if a not in kept or b not in kept:
            continue
        loser = a if avg_corr[a] >= avg_corr[b] else b
        winner = b if loser == a else a
        kept.discard(loser)
        report.dropped.append(loser)
        report.kept_representatives.setdefault(winner, []).append(loser)

    return [c for c in present if c in kept], report


def pca_collapse_block(
    panel: pd.DataFrame,
    block_columns: List[str],
    n_components: int = 1,
    block_name: str = "block",
) -> tuple[pd.DataFrame, List[str], Dict[str, float]]:
    """Replace a correlated block with `n_components` PCA components.

    Returns:
      - transformed panel (copy with block_cols dropped, components added)
      - new column names (e.g. ["governance_pc1"])
      - dict of {component_name: explained_variance_ratio}

    No-op when fewer than 2 columns are present.
    """
    present = [c for c in block_columns if c in panel.columns and panel[c].notna().any()]
    if len(present) < 2:
        return panel.copy(), present, {}

    X = panel[present].fillna(panel[present].median()).values
    n_components = min(n_components, len(present))
    pca = PCA(n_components=n_components, random_state=0).fit(X)
    components = pca.transform(X)

    out = panel.drop(columns=present).copy()
    new_cols: List[str] = []
    explained: Dict[str, float] = {}
    for i in range(n_components):
        name = f"{block_name}_pc{i + 1}"
        out[name] = components[:, i]
        new_cols.append(name)
        explained[name] = float(pca.explained_variance_ratio_[i])

    return out, new_cols, explained
