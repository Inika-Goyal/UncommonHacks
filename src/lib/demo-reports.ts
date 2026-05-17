import type { Report, ReportRequest } from "@/lib/report-types";

const accessedAt = "2026-05-16";

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
        id: "point-guangzhou",
        label: "Guangdong supplier cluster",
        latitude: 23.1291,
        longitude: 113.2644,
        risk: "high",
      },
      {
        id: "point-xinjiang",
        label: "Xinjiang enforcement exposure",
        latitude: 41.1129,
        longitude: 85.2401,
        risk: "high",
      },
      {
        id: "point-los-angeles",
        label: "U.S. import review path",
        latitude: 33.7405,
        longitude: -118.2775,
        risk: "medium",
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
        id: "point-phnom-penh",
        label: "Phnom Penh garment cluster",
        latitude: 11.5564,
        longitude: 104.9282,
        risk: "high",
      },
      {
        id: "point-sihanoukville",
        label: "Port and export route",
        latitude: 10.6253,
        longitude: 103.5234,
        risk: "medium",
      },
      {
        id: "point-geneva",
        label: "ILO complaint pathway",
        latitude: 46.2044,
        longitude: 6.1432,
        risk: "low",
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
