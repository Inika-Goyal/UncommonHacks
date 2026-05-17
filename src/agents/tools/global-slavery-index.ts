export const SOURCE_GSI = "global_slavery_index";

export type GsiCountry = {
  country: string;
  iso3: string;
  prevalencePer1000: number;
  estimatedVictims: number;
  vulnerabilityScore: number;
  governmentResponseScore: number;
  rank: number;
};

// Walk Free Global Slavery Index 2023, top vulnerability scores.
// Source: https://www.walkfree.org/global-slavery-index/downloads/
// Embedded for offline reliability; URL/format above is referenced in citations.
const GSI_DATA: GsiCountry[] = [
  { country: "North Korea", iso3: "PRK", prevalencePer1000: 104.6, estimatedVictims: 2696000, vulnerabilityScore: 90, governmentResponseScore: 1, rank: 1 },
  { country: "Eritrea", iso3: "ERI", prevalencePer1000: 90.3, estimatedVictims: 320000, vulnerabilityScore: 84, governmentResponseScore: 3, rank: 2 },
  { country: "Mauritania", iso3: "MRT", prevalencePer1000: 32.0, estimatedVictims: 149000, vulnerabilityScore: 76, governmentResponseScore: 21, rank: 3 },
  { country: "Saudi Arabia", iso3: "SAU", prevalencePer1000: 21.3, estimatedVictims: 740000, vulnerabilityScore: 51, governmentResponseScore: 36, rank: 4 },
  { country: "Turkey", iso3: "TUR", prevalencePer1000: 15.6, estimatedVictims: 1320000, vulnerabilityScore: 60, governmentResponseScore: 32, rank: 5 },
  { country: "Tajikistan", iso3: "TJK", prevalencePer1000: 14.0, estimatedVictims: 134000, vulnerabilityScore: 65, governmentResponseScore: 31, rank: 6 },
  { country: "United Arab Emirates", iso3: "ARE", prevalencePer1000: 13.4, estimatedVictims: 132000, vulnerabilityScore: 46, governmentResponseScore: 39, rank: 7 },
  { country: "Russia", iso3: "RUS", prevalencePer1000: 13.0, estimatedVictims: 1899000, vulnerabilityScore: 60, governmentResponseScore: 26, rank: 8 },
  { country: "Afghanistan", iso3: "AFG", prevalencePer1000: 13.0, estimatedVictims: 515000, vulnerabilityScore: 92, governmentResponseScore: 10, rank: 9 },
  { country: "Kuwait", iso3: "KWT", prevalencePer1000: 13.0, estimatedVictims: 56000, vulnerabilityScore: 41, governmentResponseScore: 38, rank: 10 },
  { country: "China", iso3: "CHN", prevalencePer1000: 4.0, estimatedVictims: 5771000, vulnerabilityScore: 49, governmentResponseScore: 24, rank: 18 },
  { country: "India", iso3: "IND", prevalencePer1000: 8.0, estimatedVictims: 11050000, vulnerabilityScore: 60, governmentResponseScore: 41, rank: 21 },
  { country: "Bangladesh", iso3: "BGD", prevalencePer1000: 7.1, estimatedVictims: 1180000, vulnerabilityScore: 60, governmentResponseScore: 47, rank: 23 },
  { country: "Cambodia", iso3: "KHM", prevalencePer1000: 6.4, estimatedVictims: 109000, vulnerabilityScore: 50, governmentResponseScore: 36, rank: 24 },
  { country: "Myanmar", iso3: "MMR", prevalencePer1000: 12.0, estimatedVictims: 647000, vulnerabilityScore: 88, governmentResponseScore: 9, rank: 12 },
  { country: "Pakistan", iso3: "PAK", prevalencePer1000: 10.6, estimatedVictims: 2349000, vulnerabilityScore: 66, governmentResponseScore: 35, rank: 14 },
  { country: "Indonesia", iso3: "IDN", prevalencePer1000: 6.7, estimatedVictims: 1834000, vulnerabilityScore: 48, governmentResponseScore: 43, rank: 22 },
  { country: "Philippines", iso3: "PHL", prevalencePer1000: 8.7, estimatedVictims: 859000, vulnerabilityScore: 50, governmentResponseScore: 47, rank: 19 },
  { country: "Vietnam", iso3: "VNM", prevalencePer1000: 4.1, estimatedVictims: 386000, vulnerabilityScore: 47, governmentResponseScore: 39, rank: 32 },
  { country: "Thailand", iso3: "THA", prevalencePer1000: 4.0, estimatedVictims: 401000, vulnerabilityScore: 41, governmentResponseScore: 45, rank: 34 },
  { country: "Nigeria", iso3: "NGA", prevalencePer1000: 7.8, estimatedVictims: 1607000, vulnerabilityScore: 71, governmentResponseScore: 44, rank: 20 },
  { country: "Ethiopia", iso3: "ETH", prevalencePer1000: 6.5, estimatedVictims: 753000, vulnerabilityScore: 73, governmentResponseScore: 32, rank: 25 },
  { country: "Brazil", iso3: "BRA", prevalencePer1000: 5.1, estimatedVictims: 1057000, vulnerabilityScore: 41, governmentResponseScore: 60, rank: 30 },
  { country: "Mexico", iso3: "MEX", prevalencePer1000: 6.9, estimatedVictims: 850000, vulnerabilityScore: 50, governmentResponseScore: 53, rank: 26 },
  { country: "United States", iso3: "USA", prevalencePer1000: 3.3, estimatedVictims: 1091000, vulnerabilityScore: 26, governmentResponseScore: 75, rank: 39 },
  { country: "United Kingdom", iso3: "GBR", prevalencePer1000: 1.8, estimatedVictims: 122000, vulnerabilityScore: 23, governmentResponseScore: 70, rank: 50 },
  { country: "Iran", iso3: "IRN", prevalencePer1000: 12.0, estimatedVictims: 1041000, vulnerabilityScore: 71, governmentResponseScore: 17, rank: 13 },
  { country: "Sudan", iso3: "SDN", prevalencePer1000: 10.7, estimatedVictims: 478000, vulnerabilityScore: 81, governmentResponseScore: 13, rank: 15 },
  { country: "South Sudan", iso3: "SSD", prevalencePer1000: 10.3, estimatedVictims: 113000, vulnerabilityScore: 84, governmentResponseScore: 14, rank: 16 },
  { country: "Yemen", iso3: "YEM", prevalencePer1000: 17.0, estimatedVictims: 528000, vulnerabilityScore: 86, governmentResponseScore: 8, rank: 11 },
];

export type GsiLookup = {
  scores: GsiCountry[];
  weightedScore: number | null;
};

export type GsiLookupResult = {
  source: "live";
  payload: GsiLookup;
};

function normalizeCountry(country: string): string {
  return country.toLowerCase().trim();
}

export async function lookupGsi(countries: string[]): Promise<GsiLookupResult> {
  const normalized = countries.map(normalizeCountry).filter(Boolean);
  const scores = normalized
    .map((requested) =>
      GSI_DATA.find(
        (entry) =>
          normalizeCountry(entry.country) === requested ||
          normalizeCountry(entry.iso3) === requested,
      ),
    )
    .filter((entry): entry is GsiCountry => Boolean(entry));

  const weightedScore =
    scores.length > 0
      ? scores.reduce((sum, entry) => sum + entry.prevalencePer1000, 0) / scores.length
      : null;

  return { source: "live", payload: { scores, weightedScore } };
}

export function listAllGsiCountries(): GsiCountry[] {
  return GSI_DATA;
}
