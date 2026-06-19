import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { estimateOddsApiCost, getOddsApiEventMarkets } from "@/lib/the-odds-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  const sport = request.nextUrl.searchParams.get("sport") ?? "";
  const event = request.nextUrl.searchParams.get("event") ?? "";
  if (!/^[a-z0-9_]+$/.test(sport) || !/^[a-f0-9]+$/.test(event)) return NextResponse.json({ error: "Evento inválido" }, { status: 400 });
  try {
    const result = await getOddsApiEventMarkets(sport, event);
    return NextResponse.json({ markets: result.markets, quota: result.quota, estimatedAllCost: estimateOddsApiCost(result.markets.length) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar mercados" }, { status: 502 });
  }
}
