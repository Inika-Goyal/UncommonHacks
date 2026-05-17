import { fetchText } from "@/agents/tools/http";
import { TTL, hashKey, withCache, type CacheLookup } from "@/agents/tools/cache";

export const SOURCE_NIKE_MANUFACTURING_MAP = "nike_manufacturing_map";

const BASE_URL = "https://manufacturingmap.nikeinc.com";
const SCRIPT_RE = /<script[^>]+src="([^"]*static\/js\/main\.[^"]+\.js)"/i;
const DATA_PREFIX = "const Bt=JSON.parse('";

type NikeFactoryRow = {
  contractor_id?: string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  "country/region"?: string;
  brand?: string;
  product_type?: string;
  supplier_name?: string;
  factory_tier?: string;
  workers?: string;
  lat?: string;
  lon?: string;
  geoData?: {
    latitude?: number;
    longitude?: number;
    formattedAddress?: string;
    country?: string;
    countryCode?: string;
  };
};

export type NikeManufacturingFacility = {
  id: string;
  name: string;
  address: string;
  country: string;
  countryCode?: string;
  latitude: number;
  longitude: number;
  sectors: string[];
  workers?: number;
  supplierName?: string;
  factoryTier?: string;
  source: string;
};

export type NikeManufacturingLookup = {
  sourceUrl: string;
  scriptUrl: string;
  dataAsOf?: string;
  facilities: NikeManufacturingFacility[];
};

function absoluteUrl(pathOrUrl: string): string {
  return pathOrUrl.startsWith("http") ? pathOrUrl : `${BASE_URL}${pathOrUrl}`;
}

function readSingleQuotedString(source: string, start: number): string | null {
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "'") {
      return source.slice(start, index);
    }
  }
  return null;
}

function decodeJsStringLiteral(raw: string): string {
  let decoded = "";
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (char !== "\\") {
      decoded += char;
      continue;
    }

    const next = raw[index + 1];
    if (!next) {
      decoded += char;
      continue;
    }

    if (next === "x") {
      const hex = raw.slice(index + 2, index + 4);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        decoded += String.fromCharCode(Number.parseInt(hex, 16));
        index += 3;
        continue;
      }
    }

    if (next === "u") {
      const hex = raw.slice(index + 2, index + 6);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        decoded += String.fromCharCode(Number.parseInt(hex, 16));
        index += 5;
        continue;
      }
    }

    const escaped: Record<string, string> = {
      "\\": "\\",
      "'": "'",
      '"': '"',
      n: "\n",
      r: "\r",
      t: "\t",
      b: "\b",
      f: "\f",
    };
    decoded += escaped[next] ?? next;
    index += 1;
  }
  return decoded;
}

function extractDataAsOf(script: string): string | undefined {
  const match = script.match(/"dataAsOf":"([^"]+)"/);
  return match?.[1];
}

function parseWorkers(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseCoordinate(primary: number | undefined, fallback: string | undefined): number | null {
  if (typeof primary === "number" && Number.isFinite(primary)) return primary;
  if (!fallback) return null;
  const parsed = Number(fallback);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRow(row: NikeFactoryRow): NikeManufacturingFacility | null {
  const latitude = parseCoordinate(row.geoData?.latitude, row.lat);
  const longitude = parseCoordinate(row.geoData?.longitude, row.lon);
  const id = row.contractor_id?.trim();
  const name = row.name?.trim();

  if (!id || !name || latitude == null || longitude == null) return null;

  return {
    id,
    name,
    address: row.geoData?.formattedAddress || [row.address, row.city, row.state].filter(Boolean).join(", "),
    country: row.geoData?.country || row["country/region"] || "",
    countryCode: row.geoData?.countryCode,
    latitude,
    longitude,
    sectors: [row.product_type].filter((sector): sector is string => Boolean(sector)),
    workers: parseWorkers(row.workers),
    supplierName: row.supplier_name,
    factoryTier: row.factory_tier,
    source: BASE_URL,
  };
}

function extractFacilities(script: string): NikeManufacturingFacility[] {
  const dataStart = script.indexOf(DATA_PREFIX);
  if (dataStart < 0) {
    throw new Error("Nike Manufacturing Map bundle did not expose the factory dataset.");
  }

  const raw = readSingleQuotedString(script, dataStart + DATA_PREFIX.length);
  if (!raw) {
    throw new Error("Nike Manufacturing Map factory dataset string was incomplete.");
  }

  const decoded = decodeJsStringLiteral(raw);
  const rows = JSON.parse(decoded) as NikeFactoryRow[];

  return rows
    .filter((row) => row.brand?.toLowerCase().split(", ").includes("nike"))
    .map(normalizeRow)
    .filter((facility): facility is NikeManufacturingFacility => Boolean(facility));
}

export async function lookupNikeManufacturingMap(query: string): Promise<CacheLookup<NikeManufacturingLookup>> {
  const normalized = query.trim().toLowerCase();
  if (!normalized.includes("nike")) {
    return { source: "miss", error: new Error("Nike Manufacturing Map only applies to Nike queries.") };
  }

  const key = hashKey(["nike_manufacturing_map", normalized]);

  return withCache<NikeManufacturingLookup>(
    SOURCE_NIKE_MANUFACTURING_MAP,
    key,
    { ttlMs: TTL.DAY, staleTtlMs: TTL.WEEK },
    async () => {
      const html = await fetchText(BASE_URL, {
        timeoutMs: 20_000,
        headers: { Accept: "text/html,*/*;q=0.8" },
      });
      const scriptMatch = html.match(SCRIPT_RE);
      if (!scriptMatch?.[1]) {
        throw new Error("Nike Manufacturing Map page did not include an app bundle URL.");
      }

      const scriptUrl = absoluteUrl(scriptMatch[1]);
      const script = await fetchText(scriptUrl, {
        timeoutMs: 20_000,
        headers: { Accept: "application/javascript,text/javascript,*/*;q=0.8" },
      });

      return {
        sourceUrl: BASE_URL,
        scriptUrl,
        dataAsOf: extractDataAsOf(script),
        facilities: extractFacilities(script),
      };
    },
  );
}
