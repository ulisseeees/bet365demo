import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { ensureDatabaseSchema } from "@/lib/database";

export async function GET() {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  try {
    await ensureDatabaseSchema();
    const { rows } = await sql`
      SELECT
        (SELECT COUNT(*)::int FROM users) AS users,
        (SELECT COUNT(*)::int FROM wallets) AS wallets,
        (SELECT COUNT(*)::int FROM bets) AS bets,
        (SELECT COUNT(*)::int FROM transactions) AS transactions,
        (SELECT COUNT(*)::int FROM imported_matches) AS imported_matches,
        (SELECT COUNT(*)::int FROM provider_cache) AS provider_caches
    `;
    return NextResponse.json({ connected: true, counts: rows[0] });
  } catch (error) {
    return NextResponse.json({ connected: false, error: error instanceof Error ? error.message : "Banco indisponível" }, { status: 503 });
  }
}
