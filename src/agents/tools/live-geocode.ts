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

export async function geocodeLocation(location: string): Promise<CacheLookup<GeocodedLocation>> {
  const normalized = location.trim();
  if (!normalized || isTooVague(normalized)) {
    return { source: "miss", error: new Error(`Location is too vague to geocode: ${location}`) };
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
