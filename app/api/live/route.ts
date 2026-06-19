import { NextResponse } from "next/server";
import { getCombinedFeed } from "@/lib/feed";

export const dynamic = "force-dynamic";

export async function GET() {
  const { matches, football, oddsApi, imported, cacheSeconds } = await getCombinedFeed();
  return NextResponse.json({
    mode: matches.length ? "api" : "unavailable",
    matches,
    message: matches.length ? `Feed combinado: ${matches.length} jogos reais de duas APIs.` : football.error ?? "Nenhuma fonte de odds está disponível",
    meta: {
      cacheSeconds,
      oddsPagesLoaded: football.meta?.oddsPagesLoaded ?? 0,
      totalOddsPages: football.meta?.totalOddsPages ?? 0,
      sources: { apiFootball: football.matches.length, theOddsApi: oddsApi.matches.length, imported: imported.length },
      apiFootballQuota: football.meta?.quota ?? null,
      apiFootballCached: football.cached,
      apiFootballStale: football.stale ?? false,
      oddsApiQuota: oddsApi.quota,
    },
    updatedAt: new Date().toISOString(),
  }, { status: matches.length ? 200 : 503 });
}
