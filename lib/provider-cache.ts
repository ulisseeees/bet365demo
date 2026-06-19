import "server-only";

import { sql } from "@vercel/postgres";
import { ensureDatabaseSchema } from "./database";

export interface ProviderCacheEntry<T> {
  data: T;
  metadata: Record<string, unknown>;
  expiresAt: string | null;
  updatedAt: string;
}

export async function readProviderCache<T>(cacheKey: string): Promise<ProviderCacheEntry<T> | null> {
  await ensureDatabaseSchema();
  const { rows } = await sql`
    SELECT data, metadata, expires_at, updated_at
    FROM provider_cache
    WHERE cache_key = ${cacheKey}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    data: row.data as T,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function writeProviderCache<T>(cacheKey: string, provider: string, data: T, metadata: Record<string, unknown>, expiresAt?: Date | null) {
  await ensureDatabaseSchema();
  const dataJson = JSON.stringify(data);
  const metadataJson = JSON.stringify(metadata);
  const expiry = expiresAt?.toISOString() ?? null;
  await sql`
    INSERT INTO provider_cache (cache_key, provider, data, metadata, expires_at)
    VALUES (${cacheKey}, ${provider}, ${dataJson}::jsonb, ${metadataJson}::jsonb, ${expiry})
    ON CONFLICT (cache_key) DO UPDATE SET
      provider = EXCLUDED.provider,
      data = EXCLUDED.data,
      metadata = EXCLUDED.metadata,
      expires_at = EXCLUDED.expires_at,
      updated_at = CURRENT_TIMESTAMP
  `;
}
