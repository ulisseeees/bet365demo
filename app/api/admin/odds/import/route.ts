import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { upsertImportedOdd } from "@/lib/imported-odds-store";
import { estimateOddsApiCost, getOddsApiEventOdds } from "@/lib/the-odds-api";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  const body = await request.json().catch(() => null) as { sport?: string; eventId?: string; markets?: string[] } | null;
  const sport = body?.sport ?? "";
  const eventId = body?.eventId ?? "";
  const markets = [...new Set(body?.markets ?? [])].filter((market) => /^[a-z0-9_]+$/.test(market)).slice(0, 80);
  if (!/^[a-z0-9_]+$/.test(sport) || !/^[a-f0-9]+$/.test(eventId) || !markets.length) {
    return NextResponse.json({ error: "Selecione um evento e ao menos um mercado" }, { status: 400 });
  }

  try {
    const result = await getOddsApiEventOdds(sport, eventId, markets);
    if (!result.match) return NextResponse.json({ error: "O evento não retornou odds disponíveis" }, { status: 404 });
    await upsertImportedOdd(result.match);
    return NextResponse.json({ match: result.match, quota: result.quota, estimatedCost: estimateOddsApiCost(markets.length) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao importar evento" }, { status: 502 });
  }
}
