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
      apiFootballUpdatedAt: football.updatedAt,
      apiFootballError: football.error,
      oddsApiQuota: oddsApi.quota,
      oddsApiCached: oddsApi.cached,
      oddsApiStale: oddsApi.stale ?? false,
      oddsApiUpdatedAt: oddsApi.updatedAt,
      oddsApiError: oddsApi.error ?? null,
    },
    updatedAt: [football.updatedAt, oddsApi.updatedAt].filter(Boolean).sort().at(-1) ?? null,
  }, { status: matches.length ? 200 : 503 });
}
