"""Demographic / economic / migration / help cluster model.

Two complementary models on the predictor blocks (demographics + economy
+ migration + help-resource access; governance + press-freedom are
included as context but can be dropped via `feature_blocks` arg):

  - KMeans clustering over standardized features. Used to answer:
    "show me other countries with similar conditions to country X".
    The cluster label is what powers the "predicted areas with similar
    economic / demographic conditions" view in the UI.

  - Gaussian Naive Bayes classifier over the same standardized features,
    predicting the *dominant* exploit type for that country-year. This
    is what supplies the "likely causes" dropdown on each map pin.

KMeans needs k; we sweep k=3..8 and pick the highest silhouette score.
NB is calibrated by held-out accuracy on a country-level split.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import accuracy_score, silhouette_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.naive_bayes import GaussianNB
from sklearn.preprocessing import StandardScaler

from ..data.synthetic import (
    DEMOGRAPHIC_COLS, ECONOMIC_COLS, GOVERNANCE_COLS,
    MIGRATION_COLS, HELP_COLS, EXPLOIT_TYPES,
)


# Feature blocks the cluster model is allowed to use. Press-freedom is
# intentionally excluded — clustering on reporting bias would group
# countries by media climate, not by exploitation drivers.
DEFAULT_BLOCKS = {
    "demographic": DEMOGRAPHIC_COLS,
    "economic": ECONOMIC_COLS,
    "governance": GOVERNANCE_COLS,
    "migration": MIGRATION_COLS,
    "help": HELP_COLS,
}


def _collapse_to_country_year(panel: pd.DataFrame) -> pd.DataFrame:
    """Cluster/NB operate at (country, year) granularity, not per exploit.

    The exploit_type axis is collapsed by taking the argmax over observed
    prevalence — that becomes the NB target ("dominant exploit type").
    """
    feats_cols = list({c for cols in DEFAULT_BLOCKS.values() for c in cols})
    wide = (
        panel
        .pivot_table(
            index=["country", "year"] + feats_cols,
            columns="exploit_type",
            values="observed_prevalence_per_1k",
            aggfunc="mean",
        )
        .reset_index()
    )
    wide["dominant_exploit"] = wide[EXPLOIT_TYPES].idxmax(axis=1)
    return wide


def _selected_features(blocks: Dict[str, List[str]]) -> List[str]:
    return [c for cols in blocks.values() for c in cols]


@dataclass
class TrainedClusterModel:
    """Bundles KMeans + Naive Bayes + their preprocessing."""

    scaler: StandardScaler
    kmeans: KMeans
    naive_bayes: GaussianNB
    feature_cols: List[str]
    k: int
    silhouette: float
    nb_holdout_accuracy: float
    cluster_centroids: pd.DataFrame
    cluster_dominant_exploit: pd.Series  # cluster_id -> exploit label

    # ------------------------------------------------------------------
    # Inference helpers used by the synthesis layer.
    # ------------------------------------------------------------------
    def assign_cluster(self, X: pd.DataFrame) -> np.ndarray:
        return self.kmeans.predict(self.scaler.transform(X[self.feature_cols]))

    def predict_exploit(self, X: pd.DataFrame) -> Dict[str, np.ndarray]:
        Xs = self.scaler.transform(X[self.feature_cols])
        proba = self.naive_bayes.predict_proba(Xs)
        labels = self.naive_bayes.classes_[proba.argmax(axis=1)]
        return {"label": labels, "proba": proba, "classes": self.naive_bayes.classes_}

    def similar_countries(
        self,
        wide_panel: pd.DataFrame,
        target_country: str,
        target_year: int | None = None,
        top_n: int = 5,
    ) -> pd.DataFrame:
        """Other countries in the same cluster, ranked by Euclidean distance."""
        if target_year is None:
            target_year = int(wide_panel["year"].max())
        target = wide_panel[
            (wide_panel["country"] == target_country)
            & (wide_panel["year"] == target_year)
        ]
        if target.empty:
            return wide_panel.iloc[0:0]

        Xs_all = self.scaler.transform(wide_panel[self.feature_cols])
        Xs_target = self.scaler.transform(target[self.feature_cols])
        same_year = wide_panel["year"] == target_year
        cluster_of_target = self.kmeans.predict(Xs_target)[0]
        cluster_of_all = self.kmeans.predict(Xs_all)

        mask = (cluster_of_all == cluster_of_target) & same_year.values
        candidates = wide_panel[mask].copy()
        candidates = candidates[candidates["country"] != target_country]

        dist = np.linalg.norm(Xs_all[mask] - Xs_target, axis=1)
        candidates = candidates.assign(distance_to_target=dist[: len(candidates)])
        return candidates.sort_values("distance_to_target").head(top_n)


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------
def _select_k(X: np.ndarray, k_range: Tuple[int, ...]) -> Tuple[int, float, KMeans]:
    """Pick the k with the highest silhouette score."""
    best = (k_range[0], -1.0, None)
    for k in k_range:
        km = KMeans(n_clusters=k, n_init=10, random_state=0).fit(X)
        if len(np.unique(km.labels_)) < 2:
            continue
        # Silhouette is O(n^2); fine at panel size ~480 rows.
        score = silhouette_score(X, km.labels_)
        if score > best[1]:
            best = (k, score, km)
    return best  # type: ignore[return-value]


def train_cluster_model(
    panel: pd.DataFrame,
    feature_blocks: Dict[str, List[str]] | None = None,
    k_range: Tuple[int, ...] = (3, 4, 5, 6, 7, 8),
    seed: int = 0,
) -> Tuple[TrainedClusterModel, pd.DataFrame]:
    """Fit KMeans + NB on the collapsed country-year table.

    Returns the trained model plus the wide table it was trained on, so
    callers can re-use it for `similar_countries` lookups without
    rebuilding the pivot.
    """
    blocks = feature_blocks or DEFAULT_BLOCKS
    feature_cols = _selected_features(blocks)

    wide = _collapse_to_country_year(panel)
    scaler = StandardScaler().fit(wide[feature_cols])
    Xs = scaler.transform(wide[feature_cols])

    k, sil, km = _select_k(Xs, k_range)

    # Group-aware NB holdout: don't let a country leak across train/test.
    gss = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=seed)
    tr_idx, te_idx = next(gss.split(Xs, wide["dominant_exploit"], wide["country"]))
    nb = GaussianNB().fit(Xs[tr_idx], wide["dominant_exploit"].values[tr_idx])
    acc = accuracy_score(wide["dominant_exploit"].values[te_idx], nb.predict(Xs[te_idx]))

    # Refit NB on all data for production.
    nb_full = GaussianNB().fit(Xs, wide["dominant_exploit"].values)

    # Profile each cluster: mean of unscaled features + dominant exploit.
    wide_with_cluster = wide.assign(cluster=km.labels_)
    centroids = (
        wide_with_cluster.groupby("cluster")[feature_cols].mean().round(3)
    )
    dominant = (
        wide_with_cluster
        .groupby("cluster")["dominant_exploit"]
        .agg(lambda s: s.value_counts().idxmax())
    )

    model = TrainedClusterModel(
        scaler=scaler,
        kmeans=km,
        naive_bayes=nb_full,
        feature_cols=feature_cols,
        k=k,
        silhouette=float(sil),
        nb_holdout_accuracy=float(acc),
        cluster_centroids=centroids,
        cluster_dominant_exploit=dominant,
    )
    return model, wide
