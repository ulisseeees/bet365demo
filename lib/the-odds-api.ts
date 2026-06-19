import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Market, Match, OddOption, Sport } from "./types";
import { readProviderCache, writeProviderCache } from "./provider-cache";

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
  expiresAt: number;
  matches: Match[];
  quota: OddsApiQuota;
  updatedAt: string;
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

export async function getAutomaticOddsFeed() {
  const empty: OddsApiQuota = { last: null, remaining: null, used: null };
  let cloudCache: Awaited<ReturnType<typeof readProviderCache<Match[]>>> = null;
  try {
    cloudCache = await readProviderCache<Match[]>("the-odds-api:automatic");
    if (cloudCache && (!cloudCache.expiresAt || new Date(cloudCache.expiresAt).getTime() > Date.now())) {
      return { matches: cloudCache.data, quota: (cloudCache.metadata.quota ?? empty) as OddsApiQuota, updatedAt: cloudCache.updatedAt, cached: true };
    }
  } catch {
    // O cache local mantém o desenvolvimento utilizável se o banco estiver indisponível.
  }

  const localCache = await readAutomaticCache().catch(() => null);
  if (!cloudCache && localCache && localCache.expiresAt > Date.now()) {
    writeProviderCache("the-odds-api:automatic", "the-odds-api", localCache.matches, { quota: localCache.quota }, new Date(localCache.expiresAt)).catch(() => undefined);
    return { matches: localCache.matches, quota: localCache.quota, updatedAt: localCache.updatedAt, cached: true };
  }

  if (!process.env.THE_ODDS_API_KEY) {
    return { matches: cloudCache?.data ?? localCache?.matches ?? [], quota: (cloudCache?.metadata.quota ?? localCache?.quota ?? empty) as OddsApiQuota, updatedAt: cloudCache?.updatedAt ?? localCache?.updatedAt ?? null, cached: true };
  }

  const sportKeys = envList("THE_ODDS_API_SPORTS", DEFAULT_SPORTS);
  const markets = envList("THE_ODDS_API_MARKETS", DEFAULT_MARKETS);
  const regions = envList("THE_ODDS_API_REGIONS", DEFAULT_REGIONS);
  const matches: Match[] = [];
  let quota: OddsApiQuota = { last: null, remaining: null, used: null };

  for (const sportKey of sportKeys) {
    try {
      const result = await request<OddsApiEvent[]>(`sports/${encodeURIComponent(sportKey)}/odds`, {
        regions: regions.join(","),
        markets: markets.join(","),
        oddsFormat: "decimal",
        dateFormat: "iso",
      });
      quota = result.quota;
      matches.push(...result.data.flatMap((event) => {
        const mapped = mapOddsApiEvent(event);
        return mapped ? [mapped] : [];
      }));
    } catch {
      // Uma competição indisponível não derruba as outras fontes.
    }
  }

  const updatedAt = new Date().toISOString();
  const cacheSeconds = positiveInteger(process.env.THE_ODDS_API_CACHE_SECONDS, 86400, 900, 604800);
  const nextCache = { matches, quota, updatedAt, expiresAt: Date.now() + cacheSeconds * 1000 };
  await Promise.all([
    writeAutomaticCache(nextCache),
    writeProviderCache("the-odds-api:automatic", "the-odds-api", matches, { quota }, new Date(nextCache.expiresAt)),
  ]);
  return { matches, quota, updatedAt, cached: false };
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

export async function getOddsApiScores(sportKey: string, daysFrom = 3) {
  return request<OddsApiScoreEvent[]>(`sports/${encodeURIComponent(sportKey)}/scores`, { daysFrom: String(Math.min(3, Math.max(1, daysFrom))), dateFormat: "iso" });
}
