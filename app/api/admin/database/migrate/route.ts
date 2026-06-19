import { readFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { ensureDatabaseSchema } from "@/lib/database";
import { upsertImportedOdd } from "@/lib/imported-odds-store";
import { writeProviderCache } from "@/lib/provider-cache";
import type { Match } from "@/lib/types";

interface LocalFootballCache { expiresAt: number; matches: Match[]; meta: Record<string, unknown>; updatedAt: string }
interface LocalOddsCache { expiresAt: number; matches: Match[]; quota: Record<string, unknown>; updatedAt: string }
interface LocalUser { id: string; name: string; email: string; role: string; passwordHash: string; createdAt: string }

async function localJson<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "data", name), "utf8")) as T;
  } catch { return null; }
}

export async function POST() {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  await ensureDatabaseSchema();
  const [football, odds, imported, users] = await Promise.all([
    localJson<LocalFootballCache>("api-football-cache.json"),
    localJson<LocalOddsCache>("the-odds-api-cache.json"),
    localJson<Match[]>("imported-odds.json"),
    localJson<LocalUser[]>("users.json"),
  ]);
  let userCount = 0;
  for (const user of users ?? []) {
    await sql`
      INSERT INTO users (id, name, email, role, password_hash, created_at)
      VALUES (${user.id}, ${user.name}, ${user.email}, ${user.role}, ${user.passwordHash}, ${user.createdAt})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, role = EXCLUDED.role
    `;
    await sql`INSERT INTO wallets (user_id) VALUES (${user.id}) ON CONFLICT DO NOTHING`;
    userCount += 1;
  }
  if (football) await writeProviderCache("api-football:automatic", "api-football", football, { quota: football.meta?.quota ?? null, migrated: true }, new Date(football.expiresAt));
  if (odds) await writeProviderCache("the-odds-api:automatic", "the-odds-api", odds.matches, { quota: odds.quota, migrated: true }, new Date(odds.expiresAt));
  for (const match of imported ?? []) await upsertImportedOdd(match);
  return NextResponse.json({ ok: true, users: userCount, apiFootballMatches: football?.matches.length ?? 0, oddsApiMatches: odds?.matches.length ?? 0, importedMatches: imported?.length ?? 0 });
}
