import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { getPromotions } from "@/lib/account-service";
import { ensureDatabaseSchema } from "@/lib/database";
import { getCombinedFeed } from "@/lib/feed";
import { uid } from "@/lib/utils";

export async function GET() {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  await ensureDatabaseSchema();
  const superOdds = await sql`SELECT * FROM super_odds ORDER BY created_at DESC LIMIT 100`;
  return NextResponse.json({ promotions: await getPromotions(), superOdds: superOdds.rows });
}

export async function POST(request: Request) {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  const body = await request.json().catch(() => null) as { action?: string; matchId?: string; marketId?: string; optionId?: string; boostedPrice?: number; tiers?: unknown } | null;
  await ensureDatabaseSchema();
  try {
    if (body?.action === "super-odd") {
      const { matches } = await getCombinedFeed();
      const match = matches.find((item) => item.id === body.matchId);
      const market = match?.markets.find((item) => item.id === body.marketId);
      const option = market?.options.find((item) => item.id === body.optionId);
      const boosted = Number(body.boostedPrice);
      if (!match || !market || !option || !Number.isFinite(boosted) || boosted <= option.price || boosted > 1000) throw new Error("Jogo, mercado ou Super Odd inválidos");
      await sql`
        INSERT INTO super_odds (id, match_id, market_id, option_id, original_price, boosted_price, label)
        VALUES (${uid("SOD")}, ${match.id}, ${market.id}, ${option.id}, ${option.originalPrice ?? option.price}, ${boosted}, ${`${option.label} • ${match.home} × ${match.away}`})
        ON CONFLICT (match_id, market_id, option_id) DO UPDATE SET boosted_price = EXCLUDED.boosted_price, active = TRUE, updated_at = CURRENT_TIMESTAMP
      `;
      return NextResponse.json({ ok: true });
    }
    if (body?.action === "accumulator") {
      if (!Array.isArray(body.tiers)) throw new Error("Faixas inválidas");
      await sql`UPDATE promotions SET config = ${JSON.stringify({ tiers: body.tiers })}::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = 'PROMO-ACC-5'`;
      return NextResponse.json({ ok: true });
    }
    throw new Error("Ação inválida");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao salvar promoção" }, { status: 400 });
  }
}
