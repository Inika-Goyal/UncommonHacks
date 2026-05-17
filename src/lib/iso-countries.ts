/**
 * Country resolver covering every country in the trained ML panel
 * (GSI 2023 ∩ WDI 2021 ∩ RSF 2021 → 153 countries).
 *
 * Accepts: ISO3, ISO2, the panel's canonical name, or common aliases
 * ("UK", "US", "South Korea", "Russia", "Vietnam", etc.) and returns
 * the ISO3 code the predict CLI expects.
 *
 * The previous resolver (`global-slavery-index.ts`) only knew 49
 * hand-curated GSI entries — anything outside that list silently
 * failed and the ML layer fell back to the deterministic scorer. This
 * resolver fixes that gap.
 */

export type PanelCountry = {
  iso3: string;
  iso2: string;
  name: string;
};

// 153 countries — must stay in sync with ml/artifacts/cluster/panel.csv.
// Regenerate by running `pnpm ml:train` and inspecting that CSV.
export const PANEL_COUNTRIES: readonly PanelCountry[] = [
  { iso3: "AFG", iso2: "AF", name: "Afghanistan" },
  { iso3: "ALB", iso2: "AL", name: "Albania" },
  { iso3: "DZA", iso2: "DZ", name: "Algeria" },
  { iso3: "AGO", iso2: "AO", name: "Angola" },
  { iso3: "ARG", iso2: "AR", name: "Argentina" },
  { iso3: "ARM", iso2: "AM", name: "Armenia" },
  { iso3: "AUS", iso2: "AU", name: "Australia" },
  { iso3: "AUT", iso2: "AT", name: "Austria" },
  { iso3: "AZE", iso2: "AZ", name: "Azerbaijan" },
  { iso3: "BHR", iso2: "BH", name: "Bahrain" },
  { iso3: "BGD", iso2: "BD", name: "Bangladesh" },
  { iso3: "BLR", iso2: "BY", name: "Belarus" },
  { iso3: "BEL", iso2: "BE", name: "Belgium" },
  { iso3: "BEN", iso2: "BJ", name: "Benin" },
  { iso3: "BOL", iso2: "BO", name: "Bolivia" },
  { iso3: "BIH", iso2: "BA", name: "Bosnia and Herzegovina" },
  { iso3: "BWA", iso2: "BW", name: "Botswana" },
  { iso3: "BRA", iso2: "BR", name: "Brazil" },
  { iso3: "BGR", iso2: "BG", name: "Bulgaria" },
  { iso3: "BFA", iso2: "BF", name: "Burkina Faso" },
  { iso3: "BDI", iso2: "BI", name: "Burundi" },
  { iso3: "KHM", iso2: "KH", name: "Cambodia" },
  { iso3: "CMR", iso2: "CM", name: "Cameroon" },
  { iso3: "CAN", iso2: "CA", name: "Canada" },
  { iso3: "CAF", iso2: "CF", name: "Central African Republic" },
  { iso3: "TCD", iso2: "TD", name: "Chad" },
  { iso3: "CHL", iso2: "CL", name: "Chile" },
  { iso3: "CHN", iso2: "CN", name: "China" },
  { iso3: "COL", iso2: "CO", name: "Colombia" },
  { iso3: "CRI", iso2: "CR", name: "Costa Rica" },
  { iso3: "CIV", iso2: "CI", name: "Côte d'Ivoire" },
  { iso3: "HRV", iso2: "HR", name: "Croatia" },
  { iso3: "CYP", iso2: "CY", name: "Cyprus" },
  { iso3: "CZE", iso2: "CZ", name: "Czechia" },
  { iso3: "COD", iso2: "CD", name: "Democratic Republic of the Congo" },
  { iso3: "DNK", iso2: "DK", name: "Denmark" },
  { iso3: "DJI", iso2: "DJ", name: "Djibouti" },
  { iso3: "DOM", iso2: "DO", name: "Dominican Republic" },
  { iso3: "ECU", iso2: "EC", name: "Ecuador" },
  { iso3: "EGY", iso2: "EG", name: "Egypt" },
  { iso3: "SLV", iso2: "SV", name: "El Salvador" },
  { iso3: "GNQ", iso2: "GQ", name: "Equatorial Guinea" },
  { iso3: "EST", iso2: "EE", name: "Estonia" },
  { iso3: "SWZ", iso2: "SZ", name: "Eswatini" },
  { iso3: "ETH", iso2: "ET", name: "Ethiopia" },
  { iso3: "FIN", iso2: "FI", name: "Finland" },
  { iso3: "FRA", iso2: "FR", name: "France" },
  { iso3: "GAB", iso2: "GA", name: "Gabon" },
  { iso3: "GMB", iso2: "GM", name: "Gambia" },
  { iso3: "GEO", iso2: "GE", name: "Georgia" },
  { iso3: "DEU", iso2: "DE", name: "Germany" },
  { iso3: "GHA", iso2: "GH", name: "Ghana" },
  { iso3: "GRC", iso2: "GR", name: "Greece" },
  { iso3: "GTM", iso2: "GT", name: "Guatemala" },
  { iso3: "GIN", iso2: "GN", name: "Guinea" },
  { iso3: "GNB", iso2: "GW", name: "Guinea-Bissau" },
  { iso3: "GUY", iso2: "GY", name: "Guyana" },
  { iso3: "HTI", iso2: "HT", name: "Haiti" },
  { iso3: "HND", iso2: "HN", name: "Honduras" },
  { iso3: "HKG", iso2: "HK", name: "Hong Kong" },
  { iso3: "HUN", iso2: "HU", name: "Hungary" },
  { iso3: "IND", iso2: "IN", name: "India" },
  { iso3: "IDN", iso2: "ID", name: "Indonesia" },
  { iso3: "IRN", iso2: "IR", name: "Iran" },
  { iso3: "IRQ", iso2: "IQ", name: "Iraq" },
  { iso3: "IRL", iso2: "IE", name: "Ireland" },
  { iso3: "ISR", iso2: "IL", name: "Israel" },
  { iso3: "ITA", iso2: "IT", name: "Italy" },
  { iso3: "JAM", iso2: "JM", name: "Jamaica" },
  { iso3: "JPN", iso2: "JP", name: "Japan" },
  { iso3: "JOR", iso2: "JO", name: "Jordan" },
  { iso3: "KAZ", iso2: "KZ", name: "Kazakhstan" },
  { iso3: "KEN", iso2: "KE", name: "Kenya" },
  { iso3: "KWT", iso2: "KW", name: "Kuwait" },
  { iso3: "KGZ", iso2: "KG", name: "Kyrgyzstan" },
  { iso3: "LAO", iso2: "LA", name: "Lao PDR" },
  { iso3: "LVA", iso2: "LV", name: "Latvia" },
  { iso3: "LBN", iso2: "LB", name: "Lebanon" },
  { iso3: "LSO", iso2: "LS", name: "Lesotho" },
  { iso3: "LBR", iso2: "LR", name: "Liberia" },
  { iso3: "LBY", iso2: "LY", name: "Libya" },
  { iso3: "LTU", iso2: "LT", name: "Lithuania" },
  { iso3: "MDG", iso2: "MG", name: "Madagascar" },
  { iso3: "MWI", iso2: "MW", name: "Malawi" },
  { iso3: "MYS", iso2: "MY", name: "Malaysia" },
  { iso3: "MLI", iso2: "ML", name: "Mali" },
  { iso3: "MRT", iso2: "MR", name: "Mauritania" },
  { iso3: "MUS", iso2: "MU", name: "Mauritius" },
  { iso3: "MEX", iso2: "MX", name: "Mexico" },
  { iso3: "MDA", iso2: "MD", name: "Moldova" },
  { iso3: "MNG", iso2: "MN", name: "Mongolia" },
  { iso3: "MAR", iso2: "MA", name: "Morocco" },
  { iso3: "MOZ", iso2: "MZ", name: "Mozambique" },
  { iso3: "MMR", iso2: "MM", name: "Myanmar" },
  { iso3: "NAM", iso2: "NA", name: "Namibia" },
  { iso3: "NPL", iso2: "NP", name: "Nepal" },
  { iso3: "NLD", iso2: "NL", name: "Netherlands" },
  { iso3: "NZL", iso2: "NZ", name: "New Zealand" },
  { iso3: "NIC", iso2: "NI", name: "Nicaragua" },
  { iso3: "NER", iso2: "NE", name: "Niger" },
  { iso3: "NGA", iso2: "NG", name: "Nigeria" },
  { iso3: "MKD", iso2: "MK", name: "North Macedonia" },
  { iso3: "NOR", iso2: "NO", name: "Norway" },
  { iso3: "OMN", iso2: "OM", name: "Oman" },
  { iso3: "PAK", iso2: "PK", name: "Pakistan" },
  { iso3: "PAN", iso2: "PA", name: "Panama" },
  { iso3: "PNG", iso2: "PG", name: "Papua New Guinea" },
  { iso3: "PRY", iso2: "PY", name: "Paraguay" },
  { iso3: "PER", iso2: "PE", name: "Peru" },
  { iso3: "PHL", iso2: "PH", name: "Philippines" },
  { iso3: "POL", iso2: "PL", name: "Poland" },
  { iso3: "PRT", iso2: "PT", name: "Portugal" },
  { iso3: "QAT", iso2: "QA", name: "Qatar" },
  { iso3: "COG", iso2: "CG", name: "Republic of the Congo" },
  { iso3: "ROU", iso2: "RO", name: "Romania" },
  { iso3: "RUS", iso2: "RU", name: "Russia" },
  { iso3: "RWA", iso2: "RW", name: "Rwanda" },
  { iso3: "SAU", iso2: "SA", name: "Saudi Arabia" },
  { iso3: "SEN", iso2: "SN", name: "Senegal" },
  { iso3: "SRB", iso2: "RS", name: "Serbia" },
  { iso3: "SLE", iso2: "SL", name: "Sierra Leone" },
  { iso3: "SGP", iso2: "SG", name: "Singapore" },
  { iso3: "SVK", iso2: "SK", name: "Slovakia" },
  { iso3: "SVN", iso2: "SI", name: "Slovenia" },
  { iso3: "SOM", iso2: "SO", name: "Somalia" },
  { iso3: "ZAF", iso2: "ZA", name: "South Africa" },
  { iso3: "KOR", iso2: "KR", name: "South Korea" },
  { iso3: "ESP", iso2: "ES", name: "Spain" },
  { iso3: "LKA", iso2: "LK", name: "Sri Lanka" },
  { iso3: "SDN", iso2: "SD", name: "Sudan" },
  { iso3: "SWE", iso2: "SE", name: "Sweden" },
  { iso3: "CHE", iso2: "CH", name: "Switzerland" },
  { iso3: "SYR", iso2: "SY", name: "Syria" },
  { iso3: "TJK", iso2: "TJ", name: "Tajikistan" },
  { iso3: "TZA", iso2: "TZ", name: "Tanzania" },
  { iso3: "THA", iso2: "TH", name: "Thailand" },
  { iso3: "TLS", iso2: "TL", name: "Timor-Leste" },
  { iso3: "TGO", iso2: "TG", name: "Togo" },
  { iso3: "TTO", iso2: "TT", name: "Trinidad and Tobago" },
  { iso3: "TUN", iso2: "TN", name: "Tunisia" },
  { iso3: "TUR", iso2: "TR", name: "Türkiye" },
  { iso3: "TKM", iso2: "TM", name: "Turkmenistan" },
  { iso3: "UGA", iso2: "UG", name: "Uganda" },
  { iso3: "UKR", iso2: "UA", name: "Ukraine" },
  { iso3: "ARE", iso2: "AE", name: "United Arab Emirates" },
  { iso3: "GBR", iso2: "GB", name: "United Kingdom" },
  { iso3: "USA", iso2: "US", name: "United States of America" },
  { iso3: "URY", iso2: "UY", name: "Uruguay" },
  { iso3: "UZB", iso2: "UZ", name: "Uzbekistan" },
  { iso3: "VEN", iso2: "VE", name: "Venezuela" },
  { iso3: "VNM", iso2: "VN", name: "Viet Nam" },
  { iso3: "ZMB", iso2: "ZM", name: "Zambia" },
  { iso3: "ZWE", iso2: "ZW", name: "Zimbabwe" },
] as const;

// Common name variants the panel doesn't canonicalize. Wikidata, news,
// and freeform text use these all the time.
const ALIASES: Record<string, string> = {
  // Country code shorthands
  prc: "CHN",
  roc: "CHN", // Republic of China is Taiwan, but the panel only has mainland — map to CHN as best-effort
  uk: "GBR",
  uae: "ARE",
  usa: "USA",
  us: "USA",
  america: "USA",
  drc: "COD",
  "south korea": "KOR",
  "republic of korea": "KOR",
  "korea, south": "KOR",
  "korea south": "KOR",
  "north korea": "PRK", // not in panel; surfaces via warnings.
  "korea, north": "PRK",
  "russian federation": "RUS",
  // Name variants
  vietnam: "VNM",
  "viet nam": "VNM",
  burma: "MMR",
  "burma (myanmar)": "MMR",
  turkey: "TUR",
  türkiye: "TUR",
  turkiye: "TUR",
  czechia: "CZE",
  "czech republic": "CZE",
  swaziland: "SWZ",
  "cape verde": "CPV",
  "ivory coast": "CIV",
  "côte d ivoire": "CIV",
  "cote d ivoire": "CIV",
  "cote d'ivoire": "CIV",
  "republic of the congo": "COG",
  "congo (brazzaville)": "COG",
  "congo brazzaville": "COG",
  "democratic republic of the congo": "COD",
  "congo (kinshasa)": "COD",
  "congo kinshasa": "COD",
  "dr congo": "COD",
  "dr congo (zaire)": "COD",
  "united states": "USA",
  "united states of america": "USA",
  "united kingdom": "GBR",
  "great britain": "GBR",
  britain: "GBR",
  england: "GBR",
  "united arab emirates": "ARE",
  "hong kong sar": "HKG",
  hongkong: "HKG",
  "macao": "HKG", // panel does not include Macao; closest neighbor is HKG. Acceptable best-effort.
  "lao people's democratic republic": "LAO",
  "lao pdr": "LAO",
  laos: "LAO",
  "saint lucia": "LCA",
  taiwan: "CHN", // not in panel; map to mainland CHN as best-effort
  "republic of china": "CHN",

  // Domain-curated subnational alias map for labor-risk geography.
  // Covers high-prevalence apparel / electronics / agriculture
  // manufacturing belts so that free-text inputs like "Xinjiang
  // cotton fields" or "Guangzhou apparel sourcing" resolve to a
  // panel ISO3 instead of getting dropped on the floor.
  xinjiang: "CHN",
  xuar: "CHN",
  uyghur: "CHN",
  uighur: "CHN",
  urumqi: "CHN",
  kashgar: "CHN",
  guangdong: "CHN",
  guangzhou: "CHN",
  shenzhen: "CHN",
  dongguan: "CHN",
  yiwu: "CHN",
  shanghai: "CHN",
  beijing: "CHN",
  chongqing: "CHN",
  chengdu: "CHN",
  zhejiang: "CHN",
  jiangsu: "CHN",
  fujian: "CHN",
  "inner mongolia": "CHN",
  tibet: "CHN",
  "ho chi minh": "VNM",
  "ho chi minh city": "VNM",
  saigon: "VNM",
  hanoi: "VNM",
  "da nang": "VNM",
  "binh duong": "VNM",
  "phnom penh": "KHM",
  sihanoukville: "KHM",
  dhaka: "BGD",
  chittagong: "BGD",
  gazipur: "BGD",
  narayanganj: "BGD",
  karachi: "PAK",
  lahore: "PAK",
  sialkot: "PAK",
  faisalabad: "PAK",
  jakarta: "IDN",
  bandung: "IDN",
  surabaya: "IDN",
  semarang: "IDN",
  mumbai: "IND",
  bombay: "IND",
  delhi: "IND",
  "new delhi": "IND",
  tirupur: "IND",
  bangalore: "IND",
  bengaluru: "IND",
  chennai: "IND",
  ahmedabad: "IND",
  surat: "IND",
  "addis ababa": "ETH",
  hawassa: "ETH",
  yangon: "MMR",
  mandalay: "MMR",
  bangkok: "THA",
  "mae sot": "THA",
  istanbul: "TUR",
  ankara: "TUR",
  manila: "PHL",
  "kuala lumpur": "MYS",
  penang: "MYS",
  johor: "MYS",
};

function norm(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ");
}

// Build the lookup once, on module load.
const LOOKUP: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const c of PANEL_COUNTRIES) {
    map.set(norm(c.iso3), c.iso3);
    map.set(norm(c.iso2), c.iso3);
    map.set(norm(c.name), c.iso3);
  }
  for (const [alias, iso3] of Object.entries(ALIASES)) {
    map.set(norm(alias), iso3);
  }
  return map;
})();

const NAMES_BY_ISO3: Map<string, string> = new Map(
  PANEL_COUNTRIES.map((c) => [c.iso3, c.name]),
);

// Multi-word keys (e.g. "ho chi minh", "united states") must be scanned
// before single-word ones to avoid a "korea" match swallowing
// "south korea". Sort descending by word count, then by length.
const LOOKUP_KEYS_SORTED: string[] = (() => {
  const keys = Array.from(LOOKUP.keys()).filter((k) => k.length >= 2);
  return keys.sort((a, b) => {
    const wordsA = a.split(" ").length;
    const wordsB = b.split(" ").length;
    if (wordsA !== wordsB) return wordsB - wordsA;
    return b.length - a.length;
  });
})();

// ISO2 codes are extremely short and prone to false positives in free
// text (e.g. "in" → IN/India in "manufacturing in...").  We bypass
// substring scanning for them — they only resolve through exact-match
// resolveCountryToIso3.
const ISO2_KEYS = new Set(PANEL_COUNTRIES.map((c) => c.iso2.toLowerCase()));

const WORD_BOUNDARY_TRAILING = /[a-z0-9]/i;

function isBoundary(text: string, index: number): boolean {
  if (index < 0 || index >= text.length) return true;
  return !WORD_BOUNDARY_TRAILING.test(text[index]!);
}

/**
 * Resolve a country string (ISO3 / ISO2 / name / common alias) to an
 * ISO3 code in the trained panel. Returns null if the value matches
 * nothing — caller should treat that as "no country resolved" and
 * either skip ML or fall back.
 */
export function resolveCountryToIso3(value: string | undefined | null): string | null {
  if (!value) return null;
  const key = norm(value);
  if (!key) return null;
  return LOOKUP.get(key) ?? null;
}

/** Canonical English name for an ISO3, or the ISO3 itself if unknown. */
export function countryNameForIso3(iso3: string): string {
  return NAMES_BY_ISO3.get(iso3) ?? iso3;
}

/** True if the ISO3 is in the trained ML panel (153 countries). */
export function isPanelCountry(iso3: string): boolean {
  return NAMES_BY_ISO3.has(iso3);
}

/**
 * Scan free text for any country name / subnational alias / ISO3 code
 * and return the deduped list of resolved ISO3s. Uses word-boundary
 * matching so "guangzhou" hits inside "Guangzhou apparel" but "in" does
 * NOT hit inside "manufacturing in...".
 *
 * Use this when the caller has a free-text field (e.g. `finding.geography`
 * = "Xinjiang cotton fields" or UFLPA `basis` = "Operates in Xinjiang
 * Uyghur Autonomous Region"). For exact-match strings, prefer the
 * cheaper `resolveCountryToIso3`.
 */
export function extractCountriesFromText(text: string | undefined | null): string[] {
  if (!text) return [];
  const normalized = norm(text);
  if (!normalized) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const matchedSpans: Array<[number, number]> = [];

  for (const key of LOOKUP_KEYS_SORTED) {
    // Skip ISO2 — too short and false-positive-prone.
    if (ISO2_KEYS.has(key)) continue;
    let from = 0;
    while (from <= normalized.length - key.length) {
      const idx = normalized.indexOf(key, from);
      if (idx === -1) break;
      const left = idx - 1;
      const right = idx + key.length;
      // Word-boundary check on both sides
      const leftOk = isBoundary(normalized, left);
      const rightOk = isBoundary(normalized, right);
      // Span-collision check — don't double-count a longer key that
      // already absorbed this region (e.g. "south korea" + "korea")
      const collides = matchedSpans.some(
        ([s, e]) => !(right <= s || idx >= e),
      );
      if (leftOk && rightOk && !collides) {
        const iso3 = LOOKUP.get(key);
        if (iso3 && !seen.has(iso3)) {
          seen.add(iso3);
          out.push(iso3);
        }
        matchedSpans.push([idx, right]);
      }
      from = idx + Math.max(1, key.length);
    }
  }

  return out;
}

/**
 * Resolve any number of country strings to a deduped list of panel
 * ISO3 codes. Order is preserved from the first occurrence.
 */
export function resolveCountriesToIso3(values: Iterable<string | undefined | null>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const iso3 = resolveCountryToIso3(v ?? undefined);
    if (iso3 && !seen.has(iso3)) {
      seen.add(iso3);
      out.push(iso3);
    }
  }
  return out;
}
