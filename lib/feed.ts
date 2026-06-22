import "server-only";

import { sql } from "@vercel/postgres";
import { apiFootballCacheSeconds, getApiFootballFeed } from "./api-football";
import { ensureDatabaseSchema } from "./database";
import { readImportedOdds } from "./imported-odds-store";
import { getOddsApiIoFeed, oddsApiIoCacheSeconds } from "./odds-api-io";
import { getAutomaticOddsFeed } from "./the-odds-api";
import type { Market, Match } from "./types";

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

function currentEvents(matches: Match[]) {
  const cutoff = Date.now() - 8 * 60 * 60 * 1000;
  return matches.filter((match) => !match.kickoffAt || new Date(match.kickoffAt).getTime() >= cutoff);
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

export function mergeFeeds(...feeds: Match[][]) {
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
      ...((match.markets.length > current.markets.length || match.status !== "upcoming") ? match : {}),
      id: current.id,
      score: current.score ?? match.score,
      minute: current.minute ?? match.minute,
      external: current.external ?? match.external,
      source: current.source === match.source ? current.source : "merged",
      markets: mergeMarketLists(current.markets, match.markets),
    };
  });
  return merged.sort((left, right) => {
    if (left.status !== right.status) return left.status === "live" ? -1 : 1;
    return (left.kickoffAt ?? "").localeCompare(right.kickoffAt ?? "");
  });
}

async function decorateMatches(matches: Match[]) {
  try {
    await ensureDatabaseSchema();
    const [superOddsResult, trackingResult] = await Promise.all([
      sql`SELECT match_id, market_id, option_id, original_price, boosted_price FROM super_odds WHERE active = TRUE AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
      sql`SELECT match_id, enabled, last_checked_at FROM tracked_matches WHERE enabled = TRUE`,
    ]);
    const boosts = new Map(superOddsResult.rows.map((row) => [`${row.match_id}:${row.market_id}:${row.option_id}`, row]));
    const tracking = new Map(trackingResult.rows.map((row) => [row.match_id, row]));
    return matches.map((match) => ({
      ...match,
      tracking: tracking.has(match.id) ? { enabled: true, lastCheckedAt: tracking.get(match.id)?.last_checked_at ? new Date(tracking.get(match.id)?.last_checked_at).toISOString() : null } : undefined,
      markets: match.markets.map((market) => ({
        ...market,
        options: market.options.map((option) => {
          const boost = boosts.get(`${match.id}:${market.id}:${option.id}`);
          return boost ? { ...option, originalPrice: Number(boost.original_price), price: Number(boost.boosted_price), boosted: true } : option;
        }),
      })),
    }));
  } catch {
    return matches;
  }
}

export async function getCombinedFeed() {
  const [footballResult, oddsApiResult, oddsApiIoResult, importedResult] = await Promise.all([
    getApiFootballFeed(),
    getAutomaticOddsFeed().catch(() => ({ matches: [] as Match[], quota: { last: null, remaining: null, used: null }, updatedAt: null, expiresAt: null, cached: false, stale: true, error: "The Odds API indisponível" })),
    getOddsApiIoFeed().catch(() => ({ matches: [] as Match[], quota: { limit: null, remaining: null, resetAt: null }, requestsSpent: 0, updatedAt: new Date(0).toISOString(), expiresAt: 0, cached: false, stale: true, error: "Odds-API.io indisponível" })),
    readImportedOdds().catch(() => [] as Match[]),
  ]);
  const football = { ...footballResult, matches: currentEvents(footballResult.matches) };
  const oddsApi = { ...oddsApiResult, matches: currentEvents(oddsApiResult.matches) };
  const oddsApiIo = { ...oddsApiIoResult, matches: currentEvents(oddsApiIoResult.matches) };
  const imported = currentEvents(importedResult);
  const rawMatches = mergeFeeds(football.matches, oddsApi.matches, oddsApiIo.matches, imported);
  const matches = await decorateMatches(rawMatches);
  return {
    matches,
    football,
    oddsApi,
    oddsApiIo,
    imported,
    cacheSeconds: Math.min(football.meta?.cacheSeconds ?? apiFootballCacheSeconds, oddsApiIoCacheSeconds),
  };
}
