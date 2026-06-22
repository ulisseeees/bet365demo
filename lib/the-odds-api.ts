import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Market, Match, OddOption, Sport } from "./types";
import { readProviderCache, withProviderRefreshLock, writeProviderCache } from "./provider-cache";

const API_BASE_URL = "https://api.the-odds-api.com/v4/";
const DEFAULT_SPORTS = [
  "soccer_fifa_world_cup",
  "soccer_conmebol_copa_libertadores",
  "soccer_conmebol_copa_sudamericana",
  "soccer_brazil_serie_b",
];
const DEFAULT_MARKETS = ["h2h", "spreads", "totals"];
const DEFAULT_REGIONS = ["eu"];
const dataDirectory = path.join(process.cwd(), "data");
const automaticCachePath = path.join(dataDirectory, "the-odds-api-cache.json");

export interface OddsApiQuota {
  last: number | null;
  remaining: number | null;
  used: number | null;
}

export interface OddsApiSport {
  active: boolean;
  description: string;
  group: string;
  has_outrights: boolean;
  key: string;
  title: string;
}

export interface OddsApiEvent {
  away_team: string;
  bookmakers?: OddsApiBookmaker[];
  commence_time: string;
  home_team: string;
  id: string;
  sport_key: string;
  sport_title: string;
}

export interface OddsApiScoreEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores?: Array<{ name: string; score: string }> | null;
  last_update?: string | null;
}

interface OddsApiOutcome {
  description?: string;
  name: string;
  point?: number;
  price: number;
}

interface OddsApiMarket {
  key: string;
  last_update?: string;
  outcomes?: OddsApiOutcome[];
}

interface OddsApiBookmaker {
  key: string;
  last_update?: string;
  markets?: OddsApiMarket[];
  title: string;
}

interface AutomaticCache {
  error?: string;
  expiresAt: number;
  matches: Match[];
  quota: OddsApiQuota;
  stale?: boolean;
  updatedAt: string;
}

interface AutomaticFeedResult {
  cached: boolean;
  error?: string;
  expiresAt: number | null;
  matches: Match[];
  quota: OddsApiQuota;
  refreshing?: boolean;
  stale?: boolean;
  updatedAt: string | null;
}

interface OddsApiResponse<T> {
  data: T;
  quota: OddsApiQuota;
}

const slug = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "option";
const code = (name: string) => name.replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 3).toUpperCase() || "ARE";

function envList(name: string, fallback: string[]) {
  const value = process.env[name];
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : fallback;
}

function positiveInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

const automaticCacheSeconds = positiveInteger(process.env.THE_ODDS_API_CACHE_SECONDS, 86400, 900, 604800);
const failureBackoffSeconds = positiveInteger(process.env.API_PROVIDER_FAILURE_BACKOFF_SECONDS, 900, 60, 3600);
let automaticRefreshPromise: Promise<AutomaticFeedResult> | null = null;

function quotaFromHeaders(headers: Headers): OddsApiQuota {
  const number = (name: string) => {
    const value = headers.get(name);
    return value === null || !Number.isFinite(Number(value)) ? null : Number(value);
  };
  return {
    last: number("x-requests-last"),
    remaining: number("x-requests-remaining"),
    used: number("x-requests-used"),
  };
}

async function request<T>(endpoint: string, parameters: Record<string, string | undefined> = {}): Promise<OddsApiResponse<T>> {
  const apiKey = process.env.THE_ODDS_API_KEY;
  if (!apiKey) throw new Error("THE_ODDS_API_KEY não configurada");
  const url = new URL(endpoint, API_BASE_URL);
  url.searchParams.set("apiKey", apiKey);
  Object.entries(parameters).forEach(([key, value]) => { if (value) url.searchParams.set(key, value); });

  const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  const quota = quotaFromHeaders(response.headers);
  if (!response.ok) {
    let message = `The Odds API respondeu ${response.status}`;
    try {
      const body = await response.json() as { message?: string };
      if (body.message) message = body.message;
    } catch { /* resposta sem JSON */ }
    throw new Error(message);
  }
  return { data: await response.json() as T, quota };
}

function marketName(key: string) {
  const direct: Record<string, string> = {
    h2h: "Resultado da partida",
    spreads: "Handicap",
    totals: "Total de gols",
    btts: "Ambas marcam",
    draw_no_bet: "Empate anula aposta",
    alternate_spreads: "Handicaps alternativos",
    alternate_totals: "Totais alternativos",
    team_totals: "Total de gols da equipe",
    h2h_h1: "Resultado do 1º tempo",
    totals_h1: "Total de gols - 1º tempo",
    btts_h1: "Ambas marcam - 1º tempo",
  };
  if (direct[key]) return direct[key];
  return key.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function optionLabel(outcome: OddsApiOutcome, event: OddsApiEvent) {
  const lower = outcome.name.toLowerCase();
  let label = outcome.name;
  if (lower === "draw") label = "Empate";
  else if (lower === "yes") label = "Sim";
  else if (lower === "no") label = "Não";
  else if (lower === "over") label = "Mais de";
  else if (lower === "under") label = "Menos de";
  else if (lower === event.home_team.toLowerCase()) label = event.home_team;
  else if (lower === event.away_team.toLowerCase()) label = event.away_team;
  if (outcome.description) label = `${outcome.description} - ${label}`;
  if (outcome.point !== undefined) label = `${label} ${outcome.point > 0 && lower !== "over" && lower !== "under" ? "+" : ""}${outcome.point}`;
  return label;
}

function mapMarket(market: OddsApiMarket, event: OddsApiEvent): Market | null {
  const options: OddOption[] = (market.outcomes ?? []).flatMap((outcome, index) => {
    const price = Number(outcome.price);
    if (!Number.isFinite(price) || price <= 1) return [];
    const label = optionLabel(outcome, event);
    return [{ id: `${index}-${slug(label)}`, label, price }];
  });
  return options.length ? { id: `odds-${market.key}`, name: marketName(market.key), options } : null;
}

function countryFromSport(event: OddsApiEvent) {
  const key = event.sport_key;
  if (key.includes("world_cup")) return "Mundo";
  if (key.includes("brazil")) return "Brasil";
  if (key.includes("conmebol")) return "América do Sul";
  if (key.includes("england")) return "Inglaterra";
  if (key.includes("italy")) return "Itália";
  if (key.includes("spain")) return "Espanha";
  if (key.includes("germany")) return "Alemanha";
  return "Internacional";
}

function sportFromKey(key: string): Sport {
  if (key.startsWith("basketball")) return "Basquete";
  if (key.startsWith("tennis")) return "Tênis";
  if (key.startsWith("mma")) return "MMA";
  return "Futebol";
}

function kickoffLabel(date: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

export function mapOddsApiEvent(event: OddsApiEvent): Match | null {
  const bookmaker = [...(event.bookmakers ?? [])].sort((left, right) => (right.markets?.length ?? 0) - (left.markets?.length ?? 0))[0];
  const markets = (bookmaker?.markets ?? []).flatMap((item) => {
    const mapped = mapMarket(item, event);
    return mapped ? [mapped] : [];
  });
  if (!markets.length) return null;
  const isLive = new Date(event.commence_time).getTime() <= Date.now();
  return {
    id: `odds-${event.id}`,
    sport: sportFromKey(event.sport_key),
    country: countryFromSport(event),
    league: event.sport_title,
    home: event.home_team,
    away: event.away_team,
    homeCode: code(event.home_team),
    awayCode: code(event.away_team),
    kickoff: isLive ? "Ao vivo" : kickoffLabel(event.commence_time),
    kickoffAt: event.commence_time,
    status: isLive ? "live" : "upcoming",
    source: "the-odds-api",
    external: { provider: "the-odds-api", id: event.id, sportKey: event.sport_key },
    markets,
  };
}

async function readAutomaticCache() {
  try {
    return JSON.parse(await readFile(automaticCachePath, "utf8")) as AutomaticCache;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeAutomaticCache(cache: AutomaticCache) {
  await mkdir(dataDirectory, { recursive: true });
  const temporaryPath = `${automaticCachePath}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(cache, null, 2), "utf8");
  await rename(temporaryPath, automaticCachePath);
}

async function loadAutomaticCache() {
  const empty: OddsApiQuota = { last: null, remaining: null, used: null };
  let cloudCache: AutomaticCache | null = null;
  try {
    const cloud = await readProviderCache<Match[]>("the-odds-api:automatic");
    if (cloud) {
      cloudCache = {
        matches: cloud.data,
        quota: (cloud.metadata.quota ?? empty) as OddsApiQuota,
        updatedAt: cloud.updatedAt,
        expiresAt: cloud.expiresAt ? new Date(cloud.expiresAt).getTime() : 0,
        stale: Boolean(cloud.metadata.stale),
        error: typeof cloud.metadata.lastError === "string" ? cloud.metadata.lastError : undefined,
      };
    }
  } catch {
    // O cache local mantém o desenvolvimento utilizável se o banco estiver indisponível.
  }

  const localCache = await readAutomaticCache().catch(() => null);
  if (!cloudCache && localCache) {
    writeProviderCache("the-odds-api:automatic", "the-odds-api", localCache.matches, { quota: localCache.quota, stale: localCache.stale ?? false, lastError: localCache.error ?? null }, new Date(localCache.expiresAt)).catch(() => undefined);
  }
  return cloudCache ?? localCache;
}

async function refreshAutomaticOddsFeed(previous: AutomaticCache | null): Promise<AutomaticFeedResult> {
  if (!process.env.THE_ODDS_API_KEY) {
    return { matches: previous?.matches ?? [], quota: previous?.quota ?? { last: null, remaining: null, used: null }, updatedAt: previous?.updatedAt ?? null, expiresAt: previous?.expiresAt ?? null, cached: true, stale: true, error: "THE_ODDS_API_KEY não configurada" };
  }

  const sportKeys = envList("THE_ODDS_API_SPORTS", DEFAULT_SPORTS);
  const markets = envList("THE_ODDS_API_MARKETS", DEFAULT_MARKETS);
  const regions = envList("THE_ODDS_API_REGIONS", DEFAULT_REGIONS);
  const matches: Match[] = [];
  const errors: string[] = [];
  let successfulSports = 0;
  let quota: OddsApiQuota = previous?.quota ?? { last: null, remaining: null, used: null };

  for (const sportKey of sportKeys) {
    try {
      const result = await request<OddsApiEvent[]>(`sports/${encodeURIComponent(sportKey)}/odds`, {
        regions: regions.join(","),
        markets: markets.join(","),
        oddsFormat: "decimal",
        dateFormat: "iso",
      });
      quota = result.quota;
      successfulSports += 1;
      matches.push(...result.data.flatMap((event) => {
        const mapped = mapOddsApiEvent(event);
        return mapped ? [mapped] : [];
      }));
    } catch (error) {
      errors.push(error instanceof Error ? `${sportKey}: ${error.message}` : `${sportKey}: falha na consulta`);
      matches.push(...(previous?.matches ?? []).filter((match) => match.external?.sportKey === sportKey));
    }
  }

  if (!successfulSports) {
    const message = errors[0] ?? "Não foi possível atualizar a The Odds API";
    if (!previous?.matches.length) throw new Error(message);
    const retryCache: AutomaticCache = { ...previous, error: message, stale: true, expiresAt: Date.now() + failureBackoffSeconds * 1000 };
    await Promise.allSettled([
      writeProviderCache("the-odds-api:automatic", "the-odds-api", retryCache.matches, { quota: retryCache.quota, stale: true, lastError: message }, new Date(retryCache.expiresAt)),
      writeAutomaticCache(retryCache),
    ]);
    return { ...retryCache, cached: true };
  }

  const updatedAt = new Date().toISOString();
  const nextCache: AutomaticCache = { matches, quota, updatedAt, expiresAt: Date.now() + automaticCacheSeconds * 1000, stale: errors.length > 0, error: errors[0] };
  await writeProviderCache("the-odds-api:automatic", "the-odds-api", matches, { quota, stale: nextCache.stale ?? false, lastError: nextCache.error ?? null, successfulSports, totalSports: sportKeys.length }, new Date(nextCache.expiresAt));
  await writeAutomaticCache(nextCache).catch(() => undefined);
  return { ...nextCache, cached: false };
}

export async function getAutomaticOddsFeed(force = false): Promise<AutomaticFeedResult> {
  const cache = await loadAutomaticCache();
  if (!force && cache && cache.expiresAt > Date.now()) return { ...cache, cached: true };
  if (!automaticRefreshPromise) {
    automaticRefreshPromise = (async () => {
      try {
        const locked = await withProviderRefreshLock("the-odds-api:automatic", async () => {
          const latest = await loadAutomaticCache();
          if (!force && latest && latest.expiresAt > Date.now()) return { ...latest, cached: true };
          return refreshAutomaticOddsFeed(latest ?? cache);
        });
        if (locked.acquired) return locked.value;
        const latest = await loadAutomaticCache() ?? cache;
        if (latest) return { ...latest, cached: true, stale: true, refreshing: true, error: latest.error ?? "Atualização já está em andamento" };
        return { matches: [], quota: { last: null, remaining: null, used: null }, updatedAt: null, expiresAt: null, cached: false, refreshing: true, error: "Atualização já está em andamento" };
      } catch {
        return refreshAutomaticOddsFeed(cache);
      }
    })().finally(() => { automaticRefreshPromise = null; });
  }
  return automaticRefreshPromise;
}

export async function getAutomaticOddsStatus() {
  const cache = await loadAutomaticCache();
  return {
    configured: Boolean(process.env.THE_ODDS_API_KEY),
    matches: cache?.matches.length ?? 0,
    quota: cache?.quota ?? { last: null, remaining: null, used: null },
    updatedAt: cache?.updatedAt ?? null,
    expiresAt: cache?.expiresAt ?? null,
    stale: Boolean(cache && (cache.stale || cache.expiresAt <= Date.now())),
    lastError: cache?.error ?? null,
    cacheSeconds: automaticCacheSeconds,
    estimatedRefreshCost: estimateAutomaticOddsApiCost(),
  };
}

export async function getOddsApiSports() {
  return request<OddsApiSport[]>("sports");
}

export async function getOddsApiEvents(sportKey: string) {
  return request<OddsApiEvent[]>(`sports/${encodeURIComponent(sportKey)}/events`, { dateFormat: "iso" });
}

export async function getOddsApiEventMarkets(sportKey: string, eventId: string) {
  const regions = envList("THE_ODDS_API_REGIONS", DEFAULT_REGIONS);
  const result = await request<OddsApiEvent>(`sports/${encodeURIComponent(sportKey)}/events/${encodeURIComponent(eventId)}/markets`, { regions: regions.join(","), dateFormat: "iso" });
  const markets = [...new Set((result.data.bookmakers ?? []).flatMap((bookmaker) => (bookmaker.markets ?? []).map((market) => market.key)))].sort();
  return { markets, quota: result.quota };
}

export async function getOddsApiEventOdds(sportKey: string, eventId: string, markets: string[]) {
  const regions = envList("THE_ODDS_API_REGIONS", DEFAULT_REGIONS);
  const result = await request<OddsApiEvent>(`sports/${encodeURIComponent(sportKey)}/events/${encodeURIComponent(eventId)}/odds`, {
    regions: regions.join(","),
    markets: markets.join(","),
    oddsFormat: "decimal",
    dateFormat: "iso",
  });
  return { match: mapOddsApiEvent(result.data), quota: result.quota };
}

export function estimateOddsApiCost(markets: number) {
  return Math.max(0, markets) * envList("THE_ODDS_API_REGIONS", DEFAULT_REGIONS).length;
}

export function estimateAutomaticOddsApiCost() {
  return envList("THE_ODDS_API_SPORTS", DEFAULT_SPORTS).length
    * envList("THE_ODDS_API_MARKETS", DEFAULT_MARKETS).length
    * envList("THE_ODDS_API_REGIONS", DEFAULT_REGIONS).length;
}

export async function getOddsApiScores(sportKey: string, daysFrom = 3) {
  return request<OddsApiScoreEvent[]>(`sports/${encodeURIComponent(sportKey)}/scores`, { daysFrom: String(Math.min(3, Math.max(1, daysFrom))), dateFormat: "iso" });
}
