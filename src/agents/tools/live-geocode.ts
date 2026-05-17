import { fetchJson } from "@/agents/tools/http";
import { TTL, hashKey, withCache, type CacheLookup } from "@/agents/tools/cache";

export const SOURCE_NOMINATIM = "nominatim_geocode";

const SEARCH_URL = "https://nominatim.openstreetmap.org/search";

type NominatimResult = {
  display_name?: string;
  lat?: string;
  lon?: string;
  class?: string;
  type?: string;
  importance?: number;
};

const REGION_LAND_ANCHORS: Record<string, { label: string; latitude: number; longitude: number }> = {
  africa: { label: "Africa representative land anchor", latitude: 6.6, longitude: 20.9 },
  americas: { label: "Americas representative land anchor", latitude: 14.6, longitude: -89.0 },
  apac: { label: "Asia-Pacific representative land anchor", latitude: 14.6, longitude: 101.0 },
  asia: { label: "Asia representative land anchor", latitude: 43.5, longitude: 75.0 },
  "asia pacific": { label: "Asia-Pacific representative land anchor", latitude: 14.6, longitude: 101.0 },
  "asia-pacific": { label: "Asia-Pacific representative land anchor", latitude: 14.6, longitude: 101.0 },
  europe: { label: "Europe representative land anchor", latitude: 50.8, longitude: 10.4 },
  "greater china": { label: "Greater China representative land anchor", latitude: 35.9, longitude: 104.2 },
  "latin america": { label: "Latin America representative land anchor", latitude: -13.5, longitude: -64.8 },
  "north america": { label: "North America representative land anchor", latitude: 39.8, longitude: -98.6 },
  "rest of asia pacific": { label: "Rest of Asia-Pacific representative land anchor", latitude: 14.6, longitude: 101.0 },
  "southeast asia": { label: "Southeast Asia representative land anchor", latitude: 15.9, longitude: 101.0 },
  "south america": { label: "South America representative land anchor", latitude: -14.2, longitude: -60.2 },
};

export type GeocodedLocation = {
  query: string;
  label: string;
  latitude: number;
  longitude: number;
  class?: string;
  type?: string;
  importance?: number;
  sourceUrl: string;
};

function isTooVague(location: string): boolean {
  return /^(global|globally|worldwide|international|online|e-commerce|ecommerce|various|multiple countries)$/i.test(
    location.trim(),
  );
}

function normalizeRegionKey(location: string): string {
  return location.toLowerCase().replace(/&/g, " and ").replace(/[^a-z -]/g, " ").replace(/\s+/g, " ").trim();
}

export async function geocodeLocation(location: string): Promise<CacheLookup<GeocodedLocation>> {
  const normalized = location.trim();
  if (!normalized || isTooVague(normalized)) {
    return { source: "miss", error: new Error(`Location is too vague to geocode: ${location}`) };
  }

  const regionAnchor = REGION_LAND_ANCHORS[normalizeRegionKey(normalized)];
  if (regionAnchor) {
    return {
      source: "live",
      payload: {
        query: normalized,
        label: regionAnchor.label,
        latitude: regionAnchor.latitude,
        longitude: regionAnchor.longitude,
        class: "region",
        type: "representative_land_anchor",
        importance: 0.5,
        sourceUrl: `https://www.openstreetmap.org/#map=4/${regionAnchor.latitude}/${regionAnchor.longitude}`,
      },
    };
  }

  const params = new URLSearchParams({
    q: normalized,
    format: "jsonv2",
    limit: "1",
    addressdetails: "1",
  });
  const url = `${SEARCH_URL}?${params.toString()}`;
  const key = hashKey(["nominatim", normalized.toLowerCase()]);

  return withCache<GeocodedLocation>(
    SOURCE_NOMINATIM,
    key,
    { ttlMs: TTL.WEEK, staleTtlMs: TTL.MONTH },
    async () => {
      const results = await fetchJson<NominatimResult[]>(url, {
        timeoutMs: 12_000,
        headers: {
          Accept: "application/json",
        },
      });
      const first = results[0];
      const latitude = Number(first?.lat);
      const longitude = Number(first?.lon);
      if (!first || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error(`No geocode result for ${normalized}`);
      }

      return {
        query: normalized,
        label: first.display_name ?? normalized,
        latitude,
        longitude,
        class: first.class,
        type: first.type,
        importance: first.importance,
        sourceUrl: url,
      };
    },
  );
}
