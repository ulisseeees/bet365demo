import { NextResponse } from "next/server";
import { apiFootballCacheSeconds, getApiFootballFeed } from "@/lib/api-football";
import { readImportedOdds } from "@/lib/imported-odds-store";
import { getAutomaticOddsFeed } from "@/lib/the-odds-api";
import type { Market, Match } from "@/lib/types";

export const dynamic = "force-dynamic";

function normalizedTeam(name: string) {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases: Record<string, string> = {
    unitedstates: "usa",
    unitedstatesofamerica: "usa",
    cotedivoire: "ivorycoast",
    democraticrepublicofcongo: "drcongo",
    korearepublic: "southkorea",
  };
  return aliases[normalized] ?? normalized;
}

function sameEvent(left: Match, right: Match) {
  const direct = normalizedTeam(left.home) === normalizedTeam(right.home) && normalizedTeam(left.away) === normalizedTeam(right.away);
  const reversed = normalizedTeam(left.home) === normalizedTeam(right.away) && normalizedTeam(left.away) === normalizedTeam(right.home);
  if (!direct && !reversed) return false;
  if (!left.kickoffAt || !right.kickoffAt) return true;
  return Math.abs(new Date(left.kickoffAt).getTime() - new Date(right.kickoffAt).getTime()) <= 12 * 60 * 60 * 1000;
}

function mergeMarketLists(left: Market[], right: Market[]) {
  const markets = [...left];
  right.forEach((market) => {
    const index = markets.findIndex((item) => item.name.toLowerCase() === market.name.toLowerCase());
    if (index === -1) markets.push(market);
    else if (market.options.length > markets[index].options.length) markets[index] = market;
  });
  return markets;
}

function mergeFeeds(...feeds: Match[][]) {
  const merged: Match[] = [];
  feeds.flat().forEach((match) => {
    const index = merged.findIndex((item) => item.id === match.id || sameEvent(item, match));
    if (index === -1) {
      merged.push(match);
      return;
    }
    const current = merged[index];
    merged[index] = {
      ...current,
      ...((match.markets.length > current.markets.length || match.status === "live") ? match : {}),
      id: current.id,
      score: current.score ?? match.score,
      minute: current.minute ?? match.minute,
      source: current.source === match.source ? current.source : "merged",
      markets: mergeMarketLists(current.markets, match.markets),
    };
  });
  return merged.sort((left, right) => {
    if (left.status !== right.status) return left.status === "live" ? -1 : 1;
    return (left.kickoffAt ?? "").localeCompare(right.kickoffAt ?? "");
  });
}

export async function GET() {
  const [football, oddsApi, imported] = await Promise.all([
    getApiFootballFeed(),
    getAutomaticOddsFeed().catch(() => ({ matches: [] as Match[], quota: { last: null, remaining: null, used: null }, updatedAt: null, cached: false })),
    readImportedOdds().catch(() => [] as Match[]),
  ]);
  const matches = mergeFeeds(football.matches, oddsApi.matches, imported);
  const sources = {
    apiFootball: football.matches.length,
    theOddsApi: oddsApi.matches.length,
    imported: imported.length,
  };
  return NextResponse.json({
    mode: matches.length ? "api" : "unavailable",
    matches,
    message: matches.length ? `Feed combinado: ${matches.length} jogos reais de duas APIs.` : football.error ?? "Nenhuma fonte de odds está disponível",
    meta: {
      cacheSeconds: football.meta?.cacheSeconds ?? apiFootballCacheSeconds,
      oddsPagesLoaded: football.meta?.oddsPagesLoaded ?? 0,
      totalOddsPages: football.meta?.totalOddsPages ?? 0,
      sources,
      apiFootballQuota: football.meta?.quota ?? null,
      apiFootballCached: football.cached,
      apiFootballStale: football.stale ?? false,
      oddsApiQuota: oddsApi.quota,
    },
    updatedAt: new Date().toISOString(),
  }, { status: matches.length ? 200 : 503 });
}
