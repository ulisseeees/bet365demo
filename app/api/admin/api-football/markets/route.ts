import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { discoverApiFootballMarkets } from "@/lib/api-football";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  const date = request.nextUrl.searchParams.get("date") ?? "";
  const fixtureId = Number(request.nextUrl.searchParams.get("fixture"));
  const force = request.nextUrl.searchParams.get("force") === "true";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(fixtureId) || fixtureId <= 0) {
    return NextResponse.json({ error: "Partida inválida" }, { status: 400 });
  }
  try {
    const result = await discoverApiFootballMarkets(date, fixtureId, force);
    return NextResponse.json({
      markets: result.match.markets.map((market) => ({ id: market.id, name: market.name, options: market.options.length })),
      quota: result.quota,
      requestsSpent: result.requestsSpent,
      cached: result.cached,
      updatedAt: result.updatedAt,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar odds" }, { status: 502 });
  }
}
