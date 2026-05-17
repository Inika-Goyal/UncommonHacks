import type { MlGeoExploit, MlPrediction, Report, ReportRequest } from "@/lib/report-types";

const accessedAt = "2026-05-16";

// Shared validation block — same model artifact powers every demo
// prediction below, so the CV / coverage metadata is identical.
const ML_VALIDATION = {
  cv_mae: 2.1748,
  cv_r2: 0.2731,
  conformal_half_width: 3.0117,
  empirical_coverage_80: 0.6606,
} as const;

const ML_GLOBAL_PROPORTION_NOTE =
  "ILO Global Estimates of Modern Slavery 2022 (constant per country; not learned)";

const ML_CLASS_PROBABILITIES = {
  forced_labor: 0.55,
  illegal_profits: 0.28,
  sexual_exploitation: 0.1,
  children: 0.07,
} as const;

const ML_CLASS_PROBABILITIES_NOTE =
  "Global ILO proportions of modern-slavery types (2022); constant per country, not per-country learned.";

const ML_SOURCES = {
  predicted: [
    {
      key: "gsi",
      name: "Walk Free Global Slavery Index",
      publisher: "Walk Free Foundation",
      url: "https://www.walkfree.org/global-slavery-index/",
      role: "predicted",
    },
  ],
  predictors: [
    {
      key: "wdi",
      name: "World Bank World Development Indicators",
      publisher: "World Bank",
      url: "https://datatopics.worldbank.org/world-development-indicators/",
      role: "predictor",
    },
    {
      key: "rsf",
      name: "Reporters Without Borders Press Freedom Index",
      publisher: "RSF",
      url: "https://rsf.org/en/index",
      role: "predictor",
    },
  ],
};

function geoExploit(mean: number, lower: number, upper: number, spread: number): MlGeoExploit {
  return {
    predicted_prevalence_per_1k: mean,
    uncertainty_band_p10_p90: [lower, upper],
    spread,
    global_proportion_source: ML_GLOBAL_PROPORTION_NOTE,
    validation: { ...ML_VALIDATION },
  };
}

const CAMBODIA_ML_PREDICTION: MlPrediction = {
  country: "KHM",
  country_name: "Cambodia",
  year: 2021,
  warnings: [],
  geographic: {
    forced_labor: geoExploit(3.7638, 2.1073, 5.4202, 1.1968),
    illegal_profits: geoExploit(1.9161, 1.0728, 2.7594, 0.6093),
    sexual_exploitation: geoExploit(0.6843, 0.3832, 0.9855, 0.2176),
    child_labor: geoExploit(0.479, 0.2682, 0.6898, 0.1523),
  },
  geographic_overall: {
    predicted_prevalence_per_1k: 6.8433,
    uncertainty_band_p10_p90: [3.8315, 9.855],
    spread: 2.1759,
  },
  cluster: {
    cluster_id: 2,
    k: 3,
    silhouette: 0.282,
    class_probabilities: { ...ML_CLASS_PROBABILITIES },
    class_probabilities_note: ML_CLASS_PROBABILITIES_NOTE,
    similar_countries: [
      { country: "GTM", country_name: "Guatemala", distance: 0.9647 },
      { country: "LAO", country_name: "Lao PDR", distance: 1.0066 },
      { country: "TKM", country_name: "Turkmenistan", distance: 1.169 },
      { country: "GHA", country_name: "Ghana", distance: 1.1819 },
      { country: "UZB", country_name: "Uzbekistan", distance: 1.1929 },
    ],
  },
  scores: {
    severity: 3,
    credibility: 3,
    overall_risk: 65,
    rationale:
      "Severity scales with predicted overall GSI prevalence (log-compressed). " +
      "Credibility scales inversely with the split-conformal half-width. " +
      "Overall risk blends them; no LLM in this loop.",
  },
  sources: ML_SOURCES,
};

const CHINA_ML_PREDICTION: MlPrediction = {
  country: "CHN",
  country_name: "China",
  year: 2021,
  warnings: [],
  geographic: {
    forced_labor: geoExploit(3.5396, 1.8831, 5.196, 1.608),
    illegal_profits: geoExploit(1.802, 0.9587, 2.6452, 0.8186),
    sexual_exploitation: geoExploit(0.6436, 0.3424, 0.9447, 0.2924),
    child_labor: geoExploit(0.4505, 0.2397, 0.6613, 0.2047),
  },
  geographic_overall: {
    predicted_prevalence_per_1k: 6.4356,
    uncertainty_band_p10_p90: [3.4239, 9.4473],
    spread: 2.9237,
  },
  cluster: {
    cluster_id: 1,
    k: 3,
    silhouette: 0.282,
    class_probabilities: { ...ML_CLASS_PROBABILITIES },
    class_probabilities_note: ML_CLASS_PROBABILITIES_NOTE,
    similar_countries: [
      { country: "RUS", country_name: "Russia", distance: 1.6831 },
      { country: "USA", country_name: "United States of America", distance: 1.9449 },
      { country: "THA", country_name: "Thailand", distance: 2.2176 },
      { country: "MEX", country_name: "Mexico", distance: 2.267 },
      { country: "IRN", country_name: "Iran", distance: 2.2946 },
    ],
  },
  scores: {
    severity: 3,
    credibility: 3,
    overall_risk: 64,
    rationale:
      "Severity scales with predicted overall GSI prevalence (log-compressed). " +
      "Credibility scales inversely with the split-conformal half-width. " +
      "Overall risk blends them; no LLM in this loop.",
  },
  sources: ML_SOURCES,
};

export const demoReports: Report[] = [
  {
    id: "demo-shein-company",
    inputType: "company",
    query: "Shein",
    title: "Shein forced-labor exposure brief",
    summary:
      "Demo synthesis flags elevated exposure across Xinjiang-linked import enforcement, opaque fast-fashion supplier networks, and recurring wage and hours concerns in apparel production hubs.",
    overallRisk: 82,
    severity: 4,
    credibility: 4,
    recommendedAction:
      "Generate a corporate compliance letter requesting supplier disclosure, UFLPA screening evidence, and remediation timelines for high-risk facilities.",
    sourceNote:
      "Demo mode uses labeled fixture evidence to prove the workflow. It is not a live source refresh.",
    createdAt: "2026-05-16T18:00:00.000Z",
    findings: [
      {
        id: "finding-shein-uflpa",
        signal: "Import enforcement exposure",
        severity: 5,
        credibility: 4,
        geography: "China, United States import channel",
        category: "forced_labor",
        evidence:
          "Fixture evidence links the company-risk narrative to UFLPA-style entity screening, customs detention risk, and traceability gaps in cotton and apparel supply chains.",
        citations: [
          {
            label: "UFLPA Entity List",
            source: "U.S. Customs and Border Protection",
            url: "https://www.dhs.gov/uflpa-entity-list",
            accessedAt,
          },
        ],
      },
      {
        id: "finding-shein-suppliers",
        signal: "Supplier opacity",
        severity: 4,
        credibility: 4,
        geography: "Guangdong, China",
        category: "child_labor",
        evidence:
          "Open supplier data is incomplete for fast-fashion subcontracting chains, making verification difficult during rapid production cycles.",
        citations: [
          {
            label: "Open Supply Hub",
            source: "Open Supply Hub",
            url: "https://opensupplyhub.org/",
            accessedAt,
          },
        ],
      },
      {
        id: "finding-shein-news",
        signal: "Recurring labor allegations",
        severity: 3,
        credibility: 3,
        geography: "Global apparel reporting",
        category: "illegal_profits",
        evidence:
          "News and NGO-style reporting patterns repeatedly associate ultra-fast fashion with wage, hours, and subcontracting risks.",
        citations: [
          {
            label: "GDELT labor-theme search target",
            source: "GDELT Project",
            url: "https://www.gdeltproject.org/",
            accessedAt,
          },
        ],
      },
    ],
    mapPoints: [
      {
        id: "point-xinjiang",
        label: "Xinjiang cotton fields",
        latitude: 41.1129,
        longitude: 85.2401,
        risk: "high",
        exploitType: "forced_labor",
        severity: 5,
        stage: "origin",
        order: 0,
        causes: [
          "State-imposed labor-transfer programs (XUAR work-aid)",
          "UFLPA rebuttable presumption applies to cotton inputs",
          "Independent audit access systematically denied",
        ],
        sources: [
          {
            label: "UFLPA Entity List (CBP/DHS)",
            url: "https://www.dhs.gov/uflpa-entity-list",
          },
          {
            label: "ILO Forced Labour Convention (C029)",
            url: "https://normlex.ilo.org/dyn/normlex/en/f?p=NORMLEXPUB:12100:0::NO::P12100_ILO_CODE:C029",
          },
        ],
      },
      {
        id: "point-guangzhou",
        label: "Guangdong subcontractor cluster",
        latitude: 23.1291,
        longitude: 113.2644,
        risk: "high",
        exploitType: "child_labor",
        severity: 4,
        stage: "factory",
        order: 1,
        causes: [
          "Unregistered subcontracting beyond Tier-1 visibility",
          "Documented 75+ hour workweeks (Public Eye, 2021)",
          "Piece-rate wages below provincial minimum",
        ],
        sources: [
          {
            label: "Public Eye — Toiling Away for Shein",
            url: "https://www.publiceye.ch/en/topics/fashion/shein-the-uncool-side-of-fast-fashion",
          },
          {
            label: "Open Supply Hub — Guangdong facilities",
            url: "https://opensupplyhub.org/facilities?countries=CN",
          },
        ],
      },
      {
        id: "point-shenzhen",
        label: "Shenzhen / Yantian export port",
        latitude: 22.5641,
        longitude: 114.2664,
        risk: "medium",
        exploitType: "illegal_profits",
        severity: 3,
        stage: "transit",
        order: 2,
        causes: [
          "Mixed-origin container loading obscures cotton provenance",
          "Limited isotopic testing on outbound apparel",
        ],
        sources: [
          {
            label: "CBP Trade Statistics — Forced-labor enforcement",
            url: "https://www.cbp.gov/newsroom/stats/trade",
          },
        ],
      },
      {
        id: "point-los-angeles",
        label: "Los Angeles / Long Beach import review",
        latitude: 33.7405,
        longitude: -118.2775,
        risk: "medium",
        exploitType: "illegal_profits",
        severity: 3,
        stage: "distribution",
        order: 3,
        causes: [
          "UFLPA-detained shipments awaiting traceability proof",
          "De minimis loophole reduces formal entry scrutiny",
        ],
        sources: [
          {
            label: "U.S. CBP — Trade Statistics",
            url: "https://www.cbp.gov/newsroom/stats/trade",
          },
        ],
      },
      {
        id: "point-us-consumer",
        label: "U.S. retail / consumer market",
        latitude: 39.8283,
        longitude: -98.5795,
        risk: "low",
        exploitType: "illegal_profits",
        severity: 2,
        stage: "consumer",
        order: 4,
        causes: [
          "Direct-to-consumer model bypasses traditional importer-of-record checks",
          "Limited consumer-facing supply-chain disclosure",
        ],
        sources: [
          {
            label: "Shein 2024 Sustainability & Social Impact Report",
            url: "https://www.sheingroup.com/sustainability/",
          },
        ],
      },
    ],
    sourceChecks: [
      {
        name: "UFLPA Entity List",
        status: "snapshot",
        detail: "Fixture points to the intended CBP/DHS parse target.",
      },
      {
        name: "Open Supply Hub",
        status: "pending",
        detail: "API key and endpoint verification still needed.",
      },
      {
        name: "GDELT",
        status: "pending",
        detail: "Labor-theme query not wired in this MVP.",
      },
      {
        name: "CourtListener",
        status: "blocked",
        detail: "API key not configured.",
      },
    ],
    mlPrediction: CHINA_ML_PREDICTION,
  },
  {
    id: "demo-cambodia-region",
    inputType: "region",
    query: "Cambodia garment sector",
    title: "Cambodia garment-sector exploitation signals",
    summary:
      "Demo synthesis highlights high garment-sector vulnerability through country-level forced-labor prevalence, wage disputes, and supplier concentration around Phnom Penh.",
    overallRisk: 74,
    severity: 4,
    credibility: 3,
    recommendedAction:
      "Draft a labor-authority complaint and ask buyers sourcing from Cambodia to disclose factory lists, audit history, and remediation commitments.",
    sourceNote:
      "Demo mode uses labeled fixture evidence to prove the workflow. It is not a live source refresh.",
    createdAt: "2026-05-16T18:10:00.000Z",
    findings: [
      {
        id: "finding-cambodia-gsi",
        signal: "Country-level forced-labor vulnerability",
        severity: 4,
        credibility: 4,
        geography: "Cambodia",
        category: "forced_labor",
        evidence:
          "Country risk scores make Cambodia a plausible geographic demo target for exploitation screening across garment supply chains.",
        citations: [
          {
            label: "Global Slavery Index country data",
            source: "Walk Free",
            url: "https://www.walkfree.org/global-slavery-index/",
            accessedAt,
          },
        ],
      },
      {
        id: "finding-cambodia-factory",
        signal: "Factory concentration",
        severity: 3,
        credibility: 3,
        geography: "Phnom Penh, Cambodia",
        category: "illegal_profits",
        evidence:
          "Open supplier registries can support a region-first investigation by clustering factories and linking them to buyer disclosures.",
        citations: [
          {
            label: "Open Supply Hub",
            source: "Open Supply Hub",
            url: "https://opensupplyhub.org/",
            accessedAt,
          },
        ],
      },
      {
        id: "finding-cambodia-ilo",
        signal: "Labor complaint monitoring target",
        severity: 4,
        credibility: 3,
        geography: "Cambodia",
        category: "forced_labor",
        evidence:
          "ILO NORMLEX is identified as the follow-on complaint source for jurisdiction and labor-standard context.",
        citations: [
          {
            label: "NORMLEX information system",
            source: "International Labour Organization",
            url: "https://normlex.ilo.org/",
            accessedAt,
          },
        ],
      },
    ],
    mapPoints: [
      {
        id: "point-prey-veng",
        label: "Prey Veng labor-recruitment villages",
        latitude: 11.4845,
        longitude: 105.3258,
        risk: "high",
        exploitType: "forced_labor",
        severity: 4,
        stage: "origin",
        order: 0,
        causes: [
          "Migration brokers charge debt-bondage recruitment fees",
          "Rural household debt drives early-age factory entry",
        ],
        sources: [
          {
            label: "GSI 2023 — Cambodia country profile",
            url: "https://www.walkfree.org/global-slavery-index/country-studies/cambodia/",
          },
          {
            label: "Mixed Migration Centre — Mekong",
            url: "https://mixedmigration.org/regions/asia-and-the-pacific/",
          },
        ],
      },
      {
        id: "point-phnom-penh",
        label: "Phnom Penh garment cluster",
        latitude: 11.5564,
        longitude: 104.9282,
        risk: "high",
        exploitType: "illegal_profits",
        severity: 4,
        stage: "factory",
        order: 1,
        causes: [
          "Short-term contracts evade severance and seniority obligations",
          "Forced overtime tied to buyer lead-time pressure",
          "Independent union representation suppressed since 2017",
        ],
        sources: [
          {
            label: "ILO Better Factories Cambodia",
            url: "https://betterwork.org/where-we-work/cambodia/",
          },
          {
            label: "Human Rights Watch — Cambodia garment",
            url: "https://www.hrw.org/asia/cambodia",
          },
        ],
      },
      {
        id: "point-sihanoukville",
        label: "Sihanoukville port & export route",
        latitude: 10.6253,
        longitude: 103.5234,
        risk: "medium",
        exploitType: "illegal_profits",
        severity: 3,
        stage: "transit",
        order: 2,
        causes: [
          "Special Economic Zone reduces inspection frequency",
          "Mixed-buyer container loads obscure factory of origin",
        ],
        sources: [
          {
            label: "Cambodia Garment Manufacturers Association",
            url: "https://www.gmac-cambodia.org/",
          },
        ],
      },
      {
        id: "point-bangkok",
        label: "Bangkok regional redistribution",
        latitude: 13.7563,
        longitude: 100.5018,
        risk: "medium",
        exploitType: "illegal_profits",
        severity: 3,
        stage: "distribution",
        order: 3,
        causes: [
          "Trans-shipment relabeling can mask country-of-origin",
          "Limited public buyer-disclosure obligations in transit hubs",
        ],
        sources: [
          {
            label: "Transparency International — CPI",
            url: "https://www.transparency.org/en/cpi",
          },
        ],
      },
      {
        id: "point-geneva",
        label: "ILO complaint pathway (Geneva)",
        latitude: 46.2044,
        longitude: 6.1432,
        risk: "low",
        exploitType: "forced_labor",
        severity: 2,
        stage: "consumer",
        order: 4,
        causes: [
          "NORMLEX submission window for sustained-violation pattern",
          "Article 24 representation route available to worker organizations",
        ],
        sources: [
          {
            label: "ILO NORMLEX — Cambodia",
            url: "https://normlex.ilo.org/dyn/normlex/en/f?p=NORMLEXPUB:11200:0::NO::P11200_COUNTRY_ID:103055",
          },
        ],
      },
    ],
    sourceChecks: [
      {
        name: "Global Slavery Index",
        status: "snapshot",
        detail: "Country-score fixture is ready for demo.",
      },
      {
        name: "Open Supply Hub",
        status: "pending",
        detail: "Factory endpoint verification still needed.",
      },
      {
        name: "ILO NORMLEX",
        status: "pending",
        detail: "One-time scrape not implemented.",
      },
      {
        name: "GDELT",
        status: "blocked",
        detail: "BigQuery or DOC API credentials not configured.",
      },
    ],
    mlPrediction: CAMBODIA_ML_PREDICTION,
  },
];

export function findDemoReport(request: ReportRequest): Report | null {
  const normalizedQuery = request.query.trim().toLowerCase();

  return (
    demoReports.find((report) => {
      if (report.inputType !== request.inputType) {
        return false;
      }

      const reportQuery = report.query.toLowerCase();
      return (
        normalizedQuery === reportQuery ||
        reportQuery.includes(normalizedQuery) ||
        normalizedQuery.includes(reportQuery)
      );
    }) ?? demoReports.find((report) => report.inputType === request.inputType) ?? null
  );
}
