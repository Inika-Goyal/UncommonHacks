import { createHash } from "node:crypto";

import { createSupabaseServerClient } from "@/lib/supabase-server";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type CacheRow = {
  payload: unknown;
  fetched_at: string;
};

export function hashKey(parts: Array<string | number | boolean | undefined | null>): string {
  return createHash("sha256")
    .update(parts.map((part) => (part == null ? "" : String(part))).join("|"))
    .digest("hex")
    .slice(0, 32);
}

export type CacheRead<T> = { hit: true; payload: T; ageMs: number } | { hit: false };

export async function readCache<T>(source: string, key: string): Promise<CacheRead<T>> {
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("source_cache")
      .select("payload,fetched_at")
      .eq("source", source)
      .eq("key", key)
      .maybeSingle<CacheRow>();

    if (error || !data) {
      return { hit: false };
    }

    const ageMs = Date.now() - new Date(data.fetched_at).getTime();
    return { hit: true, payload: data.payload as T, ageMs };
  } catch {
    return { hit: false };
  }
}

export async function writeCache(source: string, key: string, payload: unknown): Promise<void> {
  try {
    const supabase = createSupabaseServerClient();
    await supabase
      .from("source_cache")
      .upsert(
        { source, key, payload, fetched_at: new Date().toISOString() },
        { onConflict: "source,key" },
      );
  } catch {
    // Cache write is best-effort. A failure here must not break the agent.
  }
}

export type CacheOptions = {
  ttlMs: number;
  staleTtlMs?: number;
};

export type CacheLookup<T> =
  | { source: "live"; payload: T }
  | { source: "cache"; payload: T; ageMs: number }
  | { source: "stale"; payload: T; ageMs: number }
  | { source: "miss"; error: unknown };

export async function withCache<T>(
  source: string,
  key: string,
  options: CacheOptions,
  loader: () => Promise<T>,
): Promise<CacheLookup<T>> {
  const fresh = await readCache<T>(source, key);
  if (fresh.hit && fresh.ageMs <= options.ttlMs) {
    return { source: "cache", payload: fresh.payload, ageMs: fresh.ageMs };
  }

  try {
    const payload = await loader();
    await writeCache(source, key, payload);
    return { source: "live", payload };
  } catch (error) {
    const staleTtl = options.staleTtlMs ?? 30 * DAY_MS;
    if (fresh.hit && fresh.ageMs <= staleTtl) {
      return { source: "stale", payload: fresh.payload, ageMs: fresh.ageMs };
    }
    return { source: "miss", error };
  }
}

export const TTL = {
  HOUR: HOUR_MS,
  DAY: DAY_MS,
  WEEK: 7 * DAY_MS,
  MONTH: 30 * DAY_MS,
};
