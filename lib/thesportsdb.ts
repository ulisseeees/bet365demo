import "server-only";

import { readProviderCache, withProviderRefreshLock, writeProviderCache } from "./provider-cache";
import type { Match, MatchEnrichment } from "./types";

const API_BASE_URL = "https://www.thesportsdb.com/api/v1/json";
const integerEnv = (name: string, fallback: number, min: number, max: number) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;
};
const positiveCacheSeconds = integerEnv("THESPORTSDB_CACHE_SECONDS", 2_592_000, 86_400, 31_536_000);
const negativeCacheSeconds = integerEnv("THESPORTSDB_NEGATIVE_CACHE_SECONDS", 21_600, 1_800, 604_800);

interface ApiEvent {
  idEvent?: string | null;
  idLeague?: string | null;
  idHomeTeam?: string | null;
  idAwayTeam?: string | null;
  strHomeTeam?: string | null;
  strAwayTeam?: string | null;
  strHomeTeamBadge?: string | null;
  strAwayTeamBadge?: string | null;
  strLeagueBadge?: string | null;
  strThumb?: string | null;
  strPoster?: string | null;
  strBanner?: string | null;
  strVenue?: string | null;
  strCity?: string | null;
  strCountry?: string | null;
  strSeason?: string | null;
  intRound?: string | number | null;
  strGroup?: string | null;
}

interface SearchPayload {
  event?: ApiEvent[] | null;
  events?: ApiEvent[] | null;
}

interface CachedEnrichment {
  enrichment: MatchEnrichment | null;
  found: boolean;
}

function normalize(value = "") {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(fc|sc|ac|cf|afc|futebol clube|football club)\b/g, "").replace(/[^a-z0-9]+/g, "");
}

function sameTeam(left = "", right = "") {
  const a = normalize(left);
  const b = normalize(right);
  return Boolean(a && b && (a === b || (a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a)))));
}

function safeImage(value?: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !(url.hostname === "r2.thesportsdb.com" || url.hostname === "www.thesportsdb.com" || url.hostname.endsWith(".thesportsdb.com"))) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function saoPauloDate(value?: string) {
  if (!value || Number.isNaN(new Date(value).getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function eventQuery(home: string, away: string) {
  return `${home}_vs_${away}`.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
}

function mapEvent(match: Match, event: ApiEvent): MatchEnrichment | null {
  const direct = sameTeam(match.home, event.strHomeTeam ?? "") && sameTeam(match.away, event.strAwayTeam ?? "");
  const reversed = sameTeam(match.home, event.strAwayTeam ?? "") && sameTeam(match.away, event.strHomeTeam ?? "");
  if (!event.idEvent || (!direct && !reversed)) return null;
  return {
    source: "thesportsdb",
    eventId: event.idEvent,
    leagueId: event.idLeague ?? undefined,
    homeTeamId: (direct ? event.idHomeTeam : event.idAwayTeam) ?? undefined,
    awayTeamId: (direct ? event.idAwayTeam : event.idHomeTeam) ?? undefined,
    homeBadge: safeImage(direct ? event.strHomeTeamBadge : event.strAwayTeamBadge),
    awayBadge: safeImage(direct ? event.strAwayTeamBadge : event.strHomeTeamBadge),
    leagueBadge: safeImage(event.strLeagueBadge),
    eventThumb: safeImage(event.strThumb),
    eventPoster: safeImage(event.strPoster),
    eventBanner: safeImage(event.strBanner),
    venue: event.strVenue?.trim() || undefined,
    city: event.strCity?.trim() || undefined,
    country: event.strCountry?.trim() || undefined,
    season: event.strSeason?.trim() || undefined,
    round: event.intRound == null ? undefined : String(event.intRound),
    group: event.strGroup?.trim() || undefined,
  };
}

async function searchEvent(match: Match) {
  const apiKey = (process.env.THESPORTSDB_API_KEY || "123").trim();
  const date = saoPauloDate(match.kickoffAt);
  if (!date) return null;
  const query = eventQuery(match.home, match.away);
  const response = await fetch(`${API_BASE_URL}/${encodeURIComponent(apiKey)}/searchevents.php?e=${encodeURIComponent(query)}&d=${date}`, {
    cache: "no-store",
    headers: { Accept: "application/json", "User-Agent": "ArenaOdds/1.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 429) throw new Error("TheSportsDB atingiu o limite temporário de 30 chamadas por minuto");
  if (!response.ok) throw new Error(`TheSportsDB respondeu ${response.status}`);
  const payload = await response.json() as SearchPayload;
  const events = payload.event ?? payload.events ?? [];
  return events.map((event) => mapEvent(match, event)).find((event): event is MatchEnrichment => Boolean(event)) ?? null;
}

export async function getMatchEnrichment(match: Match) {
  const cacheKey = `thesportsdb:event:${match.id}`;
  const cached = await readProviderCache<CachedEnrichment>(cacheKey).catch(() => null);
  if (cached?.expiresAt && new Date(cached.expiresAt).getTime() > Date.now()) {
    return { enrichment: cached.data.enrichment, cached: true, updatedAt: cached.updatedAt };
  }

  const locked = await withProviderRefreshLock(cacheKey, async () => {
    const current = await readProviderCache<CachedEnrichment>(cacheKey).catch(() => null);
    if (current?.expiresAt && new Date(current.expiresAt).getTime() > Date.now()) return { enrichment: current.data.enrichment, cached: true, updatedAt: current.updatedAt };
    const enrichment = await searchEvent(match);
    const cacheSeconds = enrichment ? positiveCacheSeconds : negativeCacheSeconds;
    const expiresAt = new Date(Date.now() + cacheSeconds * 1000);
    const data: CachedEnrichment = { enrichment, found: Boolean(enrichment) };
    await writeProviderCache(cacheKey, "thesportsdb", data, { found: data.found, matchId: match.id, cacheSeconds }, expiresAt);
    return { enrichment, cached: false, updatedAt: new Date().toISOString() };
  });

  if (locked.acquired && locked.value) return locked.value;
  const afterLock = await readProviderCache<CachedEnrichment>(cacheKey).catch(() => null);
  return { enrichment: afterLock?.data.enrichment ?? null, cached: true, updatedAt: afterLock?.updatedAt ?? null };
}
