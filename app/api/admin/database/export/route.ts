import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { ensureDatabaseSchema } from "@/lib/database";

export async function GET() {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  await ensureDatabaseSchema();
  const [users, wallets, transactions, bets, selections, promotions, superOdds, tracking, highlightlyTracking, missions, userMissions, importedMatches, providerCache] = await Promise.all([
    sql`SELECT id, name, email, role, created_at FROM users ORDER BY created_at`,
    sql`SELECT * FROM wallets`,
    sql`SELECT * FROM transactions ORDER BY created_at`,
    sql`SELECT * FROM bets ORDER BY placed_at`,
    sql`SELECT * FROM bet_selections ORDER BY bet_id, id`,
    sql`SELECT * FROM promotions`,
    sql`SELECT * FROM super_odds`,
    sql`SELECT * FROM tracked_matches`,
    sql`SELECT * FROM highlightly_tracking`,
    sql`SELECT * FROM missions`,
    sql`SELECT * FROM user_missions`,
    sql`SELECT * FROM imported_matches`,
    sql`SELECT * FROM provider_cache`,
  ]);
  const backup = {
    version: 2,
    exportedAt: new Date().toISOString(),
    users: users.rows,
    wallets: wallets.rows,
    transactions: transactions.rows,
    bets: bets.rows,
    selections: selections.rows,
    promotions: promotions.rows,
    superOdds: superOdds.rows,
    tracking: tracking.rows,
    highlightlyTracking: highlightlyTracking.rows,
    missions: missions.rows,
    userMissions: userMissions.rows,
    importedMatches: importedMatches.rows,
    providerCache: providerCache.rows,
  };
  return new NextResponse(JSON.stringify(backup, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="arenaodds-backup-${new Date().toISOString().slice(0, 10)}.json"` } });
}
