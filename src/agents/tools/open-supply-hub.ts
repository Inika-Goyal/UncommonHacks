import { fetchJson } from "@/agents/tools/http";
import { TTL, hashKey, withCache, type CacheLookup } from "@/agents/tools/cache";

export const SOURCE_OSH = "open_supply_hub";

const BASE_URL = "https://opensupplyhub.org/api/facilities";

export type OshFacility = {
  osId: string;
  name: string;
  address: string;
  country: string;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
  sectors: string[];
};

export type OshLookup = {
  facilities: OshFacility[];
  total: number;
  authenticated: boolean;
};

type OshFeature = {
  id: string;
  type: string;
  geometry?: { coordinates?: [number, number] };
  properties: {
    name?: string;
    address?: string;
    country_code?: string;
    country_name?: string;
    sector?: string[] | string;
  };
};

type OshResponse = {
  count?: number;
  features?: OshFeature[];
};

function buildUrl(query: string, countries: string[]): string {
  const params = new URLSearchParams({ q: query, pageSize: "25" });
  for (const country of countries) {
    if (country) params.append("countries", country);
  }
  return `${BASE_URL}?${params.toString()}`;
}

function mapFeature(feature: OshFeature): OshFacility {
  const sectorField = feature.properties.sector;
  const sectors = Array.isArray(sectorField) ? sectorField : sectorField ? [sectorField] : [];
  const coordinates = feature.geometry?.coordinates;
  return {
    osId: feature.id,
    name: feature.properties.name ?? "",
    address: feature.properties.address ?? "",
    country: feature.properties.country_name ?? "",
    countryCode: feature.properties.country_code ?? "",
    latitude: coordinates ? coordinates[1] : null,
    longitude: coordinates ? coordinates[0] : null,
    sectors,
  };
}

export async function lookupOpenSupplyHub(
  query: string,
  countries: string[],
): Promise<CacheLookup<OshLookup>> {
  const token = process.env.OPEN_SUPPLY_HUB_TOKEN;
  const url = buildUrl(query, countries);
  const key = hashKey(["osh", query, ...countries.sort()]);

  return withCache<OshLookup>(
    SOURCE_OSH,
    key,
    { ttlMs: TTL.DAY, staleTtlMs: TTL.MONTH },
    async () => {
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Token ${token}`;

      const payload = await fetchJson<OshResponse>(url, { headers });
      const facilities = (payload.features ?? []).map(mapFeature);
      return {
        facilities,
        total: payload.count ?? facilities.length,
        authenticated: Boolean(token),
      };
    },
  );
}
