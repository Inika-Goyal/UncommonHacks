import { fetchJson } from "@/agents/tools/http";
import { TTL, hashKey, withCache, type CacheLookup } from "@/agents/tools/cache";

export const SOURCE_WIKIDATA = "wikidata";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

export type WikidataSubsidiary = {
  name: string;
  country?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
};

export type WikidataLookup = {
  entityId?: string;
  label?: string;
  homeCountry?: string;
  homeCountryCode?: string;
  industries: string[];
  headquarters?: string;
  subsidiaries: WikidataSubsidiary[];
  entityUrl?: string;
};

type SparqlBinding = Record<string, { type: string; value: string; "xml:lang"?: string }>;
type SparqlResponse = {
  results?: { bindings?: SparqlBinding[] };
};

// Q4830453 = business, Q43229 = organization, Q891723 = public company,
// Q6881511 = enterprise. Including subclasses via wdt:P279* picks up
// "fashion company", "fast-fashion retailer", etc.
const COMPANY_CLASSES = ["wd:Q4830453", "wd:Q43229", "wd:Q891723", "wd:Q6881511"];

function buildSparql(query: string): string {
  const escaped = query.replace(/"/g, '\\"').trim();
  const classFilter = COMPANY_CLASSES.map((c) => `?type = ${c}`).join(" || ");
  return `SELECT DISTINCT ?company ?companyLabel ?countryLabel ?countryCode ?industryLabel ?hqLabel ?subsidiary ?subsidiaryLabel ?subsidiaryCountryLabel ?subsidiaryCountryCode ?coords WHERE {
  ?company rdfs:label "${escaped}"@en ;
           wdt:P31/wdt:P279* ?type .
  FILTER(${classFilter})
  OPTIONAL { ?company wdt:P17 ?country .
             OPTIONAL { ?country wdt:P297 ?countryCode . } }
  OPTIONAL { ?company wdt:P452 ?industry . }
  OPTIONAL { ?company wdt:P159 ?hq . }
  OPTIONAL {
    ?company wdt:P355 ?subsidiary .
    OPTIONAL { ?subsidiary wdt:P17 ?subsidiaryCountry .
               OPTIONAL { ?subsidiary wdt:P625 ?coords . }
               OPTIONAL { ?subsidiaryCountry wdt:P297 ?subsidiaryCountryCode . } }
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 40`;
}

function parseCoords(literal: string | undefined): { lat: number; lon: number } | undefined {
  if (!literal) return undefined;
  // Wikidata coords come as "Point(lon lat)"
  const match = literal.match(/Point\(([-+]?\d+\.?\d*)\s+([-+]?\d+\.?\d*)\)/);
  if (!match) return undefined;
  return { lon: Number(match[1]), lat: Number(match[2]) };
}

function parseBindings(bindings: SparqlBinding[]): WikidataLookup {
  if (bindings.length === 0) {
    return { industries: [], subsidiaries: [] };
  }
  const first = bindings[0];
  const entityUri = first.company?.value ?? "";
  const entityId = entityUri.split("/").pop();

  const industries = new Set<string>();
  const subsidiaries = new Map<string, WikidataSubsidiary>();

  for (const b of bindings) {
    const industry = b.industryLabel?.value;
    if (industry) industries.add(industry);

    const subUri = b.subsidiary?.value;
    if (!subUri) continue;
    const subKey = subUri;
    if (subsidiaries.has(subKey)) continue;
    const coords = parseCoords(b.coords?.value);
    subsidiaries.set(subKey, {
      name: b.subsidiaryLabel?.value ?? "Subsidiary",
      country: b.subsidiaryCountryLabel?.value,
      countryCode: b.subsidiaryCountryCode?.value,
      latitude: coords?.lat,
      longitude: coords?.lon,
    });
  }

  return {
    entityId,
    label: first.companyLabel?.value,
    homeCountry: first.countryLabel?.value,
    homeCountryCode: first.countryCode?.value,
    industries: Array.from(industries),
    headquarters: first.hqLabel?.value,
    subsidiaries: Array.from(subsidiaries.values()),
    entityUrl: entityId ? `https://www.wikidata.org/wiki/${entityId}` : undefined,
  };
}

export async function lookupWikidata(query: string): Promise<CacheLookup<WikidataLookup>> {
  const sparql = buildSparql(query);
  const key = hashKey(["wikidata", query]);

  return withCache<WikidataLookup>(
    SOURCE_WIKIDATA,
    key,
    { ttlMs: TTL.WEEK, staleTtlMs: TTL.MONTH },
    async () => {
      const params = new URLSearchParams({ query: sparql, format: "json" });
      const url = `${SPARQL_ENDPOINT}?${params.toString()}`;
      const payload = await fetchJson<SparqlResponse>(url, {
        timeoutMs: 20_000,
        headers: {
          Accept: "application/sparql-results+json",
          "User-Agent": "LaborLensHackathon/0.1 (https://github.com/UncommonHacks)",
        },
      });
      return parseBindings(payload.results?.bindings ?? []);
    },
  );
}
