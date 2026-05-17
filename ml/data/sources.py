"""Catalog of upstream data sources used for predictor and predicted variables.

Kept as a Python module (not JSON) so downstream code can import a typed
mapping and attach source citations to model outputs. The synthesis layer
reads from here when assembling the "Sources" section of a report.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Dict, List


@dataclass(frozen=True)
class Source:
    key: str           # short id used inside feature tables (e.g. "gsi")
    name: str          # human-readable name shown in reports
    publisher: str
    url: str
    role: str          # one of: predicted | predictor | bias_adjuster | reference


# ---------------------------------------------------------------------------
# Predicted-variable sources (outcomes the geographic model targets)
# ---------------------------------------------------------------------------
PREDICTED_SOURCES: List[Source] = [
    Source("gsi", "Walk Free Global Slavery Index",
           "Walk Free Foundation",
           "https://www.walkfree.org/global-slavery-index/", "predicted"),
    Source("tip", "US State Department TIP Report tiers",
           "US Department of State",
           "https://www.state.gov/trafficking-in-persons-report/", "predicted"),
    Source("ilostat", "ILOSTAT forced-labour & child-labour indicators",
           "International Labour Organization",
           "https://ilostat.ilo.org/", "predicted"),
    Source("glotip", "UNODC Global Report on Trafficking in Persons",
           "UNODC",
           "https://www.unodc.org/unodc/data-and-analysis/glotip.html",
           "predicted"),
    Source("ctdc", "Counter-Trafficking Data Collaborative",
           "IOM / Polaris",
           "https://www.ctdatacollaborative.org/", "predicted"),
]


# ---------------------------------------------------------------------------
# Predictor-variable sources (inputs to both models)
# ---------------------------------------------------------------------------
PREDICTOR_SOURCES: List[Source] = [
    # Demographic / economic
    Source("wdi", "World Bank World Development Indicators",
           "World Bank", "https://datatopics.worldbank.org/world-development-indicators/",
           "predictor"),
    Source("undesa", "UN Population Division estimates",
           "UN DESA", "https://population.un.org/wpp/", "predictor"),

    # Migration / trafficking flows
    Source("dtm", "IOM Displacement Tracking Matrix",
           "IOM", "https://dtm.iom.int/", "predictor"),
    Source("migstock", "UN DESA International Migrant Stock",
           "UN DESA",
           "https://www.un.org/development/desa/pd/content/international-migrant-stock",
           "predictor"),
    Source("wb_bilat", "World Bank Bilateral Migration Matrix",
           "World Bank",
           "https://www.worldbank.org/en/topic/migrationremittancesdiasporaissues/brief/migration-remittances-data",
           "predictor"),
    Source("mmc", "Mixed Migration Centre 4Mi data",
           "MMC", "https://mixedmigration.org/", "predictor"),

    # Conflict / instability
    Source("acled", "Armed Conflict Location & Event Data",
           "ACLED", "https://acleddata.com/", "predictor"),
    Source("gdelt", "GDELT 2.0 event database",
           "GDELT Project", "https://www.gdeltproject.org/", "predictor"),

    # Governance / civic space
    Source("wgi", "World Bank Worldwide Governance Indicators",
           "World Bank",
           "https://info.worldbank.org/governance/wgi/", "predictor"),
    Source("wjp", "World Justice Project Rule of Law Index",
           "WJP", "https://worldjusticeproject.org/rule-of-law-index/",
           "predictor"),
    Source("cpi", "Transparency International Corruption Perceptions Index",
           "Transparency International",
           "https://www.transparency.org/en/cpi", "predictor"),
    Source("freedomhouse", "Freedom House Freedom in the World",
           "Freedom House", "https://freedomhouse.org/", "predictor"),
    Source("civicus", "CIVICUS Monitor civic-space ratings",
           "CIVICUS", "https://monitor.civicus.org/", "predictor"),

    # Help / resource access
    Source("polaris", "Polaris National Human Trafficking Hotline coverage",
           "Polaris Project", "https://polarisproject.org/", "predictor"),
    Source("ilo_offices", "ILO country office presence",
           "ILO", "https://www.ilo.org/global/about-the-ilo/where-we-work/",
           "predictor"),
    Source("unhcr", "UNHCR operational presence",
           "UNHCR", "https://www.unhcr.org/where-we-work", "predictor"),
    Source("ecpat", "ECPAT International member directory",
           "ECPAT", "https://ecpat.org/network/", "predictor"),
    Source("ngoaidmap", "NGO Aid Map projects",
           "InterAction", "https://www.ngoaidmap.org/", "predictor"),
    Source("reliefweb", "ReliefWeb humanitarian situation reports",
           "OCHA", "https://reliefweb.int/", "predictor"),
    Source("hdx", "Humanitarian Data Exchange",
           "OCHA Centre for Humanitarian Data",
           "https://data.humdata.org/", "predictor"),
    Source("iati", "IATI Registry aid activity data",
           "IATI", "https://iatiregistry.org/", "predictor"),
]


# ---------------------------------------------------------------------------
# Reporting-bias adjusters (used to deflate apparent prevalence in
# high-press-freedom countries before training).
# ---------------------------------------------------------------------------
BIAS_SOURCES: List[Source] = [
    Source("rsf", "Reporters Without Borders Press Freedom Index",
           "RSF", "https://rsf.org/en/index", "bias_adjuster"),
]


ALL_SOURCES: List[Source] = PREDICTED_SOURCES + PREDICTOR_SOURCES + BIAS_SOURCES
SOURCE_INDEX: Dict[str, Source] = {s.key: s for s in ALL_SOURCES}


def sources_for(keys: List[str]) -> List[dict]:
    """Return a list of dict-form source records for the given keys.

    Used by the synthesis layer to attach citations to model outputs.
    """
    return [asdict(SOURCE_INDEX[k]) for k in keys if k in SOURCE_INDEX]
