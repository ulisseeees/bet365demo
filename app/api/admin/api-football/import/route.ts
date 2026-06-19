import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { getCachedApiFootballMatch } from "@/lib/api-football";
import { upsertImportedOdd } from "@/lib/imported-odds-store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  const body = await request.json().catch(() => null) as { fixtureId?: number; markets?: string[] } | null;
  const fixtureId = Number(body?.fixtureId);
  const marketIds = [...new Set(body?.markets ?? [])].filter((market) => /^[a-z0-9-]+$/i.test(market)).slice(0, 200);
  if (!Number.isInteger(fixtureId) || fixtureId <= 0 || !marketIds.length) {
    return NextResponse.json({ error: "Selecione uma partida e ao menos um mercado" }, { status: 400 });
  }
  const cachedMatch = await getCachedApiFootballMatch(fixtureId);
  if (!cachedMatch) return NextResponse.json({ error: "Consulte as odds desta partida antes de importar" }, { status: 409 });
  const markets = cachedMatch.markets.filter((market) => marketIds.includes(market.id));
  if (!markets.length) return NextResponse.json({ error: "Os mercados selecionados não estão mais disponíveis" }, { status: 409 });
  const match = { ...cachedMatch, markets };
  await upsertImportedOdd(match);
  return NextResponse.json({ match, requestsSpent: 0 });
}
