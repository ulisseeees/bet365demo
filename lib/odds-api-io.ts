import "server-only";

import type { Market, Match, OddOption, Sport } from "./types";
import { readProviderCache, withProviderRefreshLock, writeProviderCache } from "./provider-cache";

const API_BASE_URL = "https://api.odds-api.io/v3";
const CACHE_KEY = "odds-api-io:automatic";
const DEFAULT_SPORTS = ["football", "basketball", "tennis"];
const DEFAULT_PRIORITY_TERMS = ["world cup", "copa", "libertadores", "champions", "brazil", "brasil"];
const MULTI_EVENT_LIMIT = 10;

interface ApiNamedSlug { name?: string; slug?: string }
interface ApiScore { home?: number; away?: number }
interface ApiClock { minute?: number; playedSeconds?: number; period?: number; running?: boolean; statusDetail?: string }

interface ApiEvent {
  id?: string | number;
  home?: string;
  away?: string;
  date?: string;
  status?: string;
  sport?: ApiNamedSlug;
  league?: ApiNamedSlug;
  scores?: ApiScore;
  clock?: ApiClock;
}

interface ApiOddsRow {
  [key: string]: string | number | null | undefined;
  hdp?: number;
  label?: string;
  odds?: string | number;
}

interface ApiOddsMarket {
  name?: string;
  odds?: ApiOddsRow[];
  updatedAt?: string;
}

interface ApiEventOdds extends ApiEvent {
  bookmakers?: Record<string, ApiOddsMarket[]>;
}

export interface OddsApiIoQuota {
  limit: number | null;
  remaining: number | null;
  resetAt: string | null;
}

interface FeedCache {
  error?: string;
  expiresAt: number;
  matches: Match[];
  quota: OddsApiIoQuota;
  requestsSpent: number;
  stale?: boolean;
  updatedAt: string;
}

export interface OddsApiIoFeedResult extends FeedCache {
  cached: boolean;
  refreshing?: boolean;
}

class ProviderError extends Error {
  constructor(message: string, readonly status: number, readonly quota: OddsApiIoQuota) {
    super(message);
  }
}

function positiveInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function envList(name: string, fallback: string[]) {
  const value = process.env[name];
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : fallback;
}

const cacheSeconds = positiveInteger(process.env.ODDS_API_IO_CACHE_SECONDS, 600, 60, 86400);
export const oddsApiIoCacheSeconds = cacheSeconds;
const maximumEventsPerSport = positiveInteger(process.env.ODDS_API_IO_MAX_EVENTS_PER_SPORT, 20, 1, 100);
const failureBackoffSeconds = positiveInteger(process.env.API_PROVIDER_FAILURE_BACKOFF_SECONDS, 900, 60, 3600);
let refreshPromise: Promise<OddsApiIoFeedResult> | null = null;

const emptyQuota: OddsApiIoQuota = { limit: null, remaining: null, resetAt: null };
const slug = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "option";
const code = (name: string) => name.replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 3).toUpperCase() || "ARE";

function headerNumber(headers: Headers, name: string) {
  const raw = headers.get(name);
  if (raw == null || !Number.isFinite(Number(raw))) return null;
  return Number(raw);
}

function quotaFromHeaders(headers: Headers): OddsApiIoQuota {
  return {
    limit: headerNumber(headers, "x-ratelimit-limit"),
    remaining: headerNumber(headers, "x-ratelimit-remaining"),
    resetAt: headers.get("x-ratelimit-reset"),
  };
}

async function request<T>(path: string, parameters: Record<string, string | undefined>) {
  const apiKey = process.env.ODDS_API_IO_KEY;
  if (!apiKey) throw new ProviderError("ODDS_API_IO_KEY não configurada", 401, emptyQuota);
  const url = new URL(`${API_BASE_URL}${path}`);
  url.searchParams.set("apiKey", apiKey);
  Object.entries(parameters).forEach(([key, value]) => { if (value) url.searchParams.set(key, value); });
  const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  const quota = quotaFromHeaders(response.headers);
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
    throw new ProviderError(body?.error ?? body?.message ?? `Odds-API.io respondeu ${response.status}`, response.status, quota);
  }
  return { data: await response.json() as T, quota };
}

function sportFromSlug(value = "football"): Sport {
  if (value === "basketball") return "Basquete";
  if (value === "tennis") return "Tênis";
  if (value === "mixed-martial-arts") return "MMA";
  if (value === "esports") return "eSports";
  return "Futebol";
}

function kickoffLabel(date: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

function countryFromEvent(event: ApiEvent) {
  const league = event.league?.name ?? "Internacional";
  if (/world cup/i.test(league)) return "Mundo";
  const prefix = league.split(/\s[-–—]\s/)[0]?.trim();
  return prefix && prefix !== league ? prefix : "Internacional";
}

function marketName(name: string, sport: Sport) {
  const normalized = name.trim().toLowerCase();
  const direct: Record<string, string> = {
    ml: "Resultado da partida",
    moneyline: "Resultado da partida",
    "asian handicap": "Handicap asiático",
    handicap: "Handicap",
    totals: sport === "Futebol" ? "Total de gols" : "Total de pontos",
    "both teams to score": "Ambas marcam",
    "double chance": "Dupla chance",
    "draw no bet": "Empate anula aposta",
    "correct score": "Placar exato",
    "odd/even": "Ímpar/Par",
    "first team to score": "Primeira equipe a marcar",
  };
  return direct[normalized] ?? name;
}

function optionLabel(key: string, row: ApiOddsRow, event: ApiEvent) {
  const line = row.hdp == null ? "" : ` ${row.hdp}`;
  const labels: Record<string, string> = {
    home: event.home ?? "Mandante",
    draw: "Empate",
    away: event.away ?? "Visitante",
    over: `Mais de${line}`,
    under: `Menos de${line}`,
    yes: "Sim",
    no: "Não",
    "1X": `${event.home ?? "Mandante"} ou empate`,
    "12": "Sem empate",
    X2: `${event.away ?? "Visitante"} ou empate`,
    odd: "Ímpar",
    even: "Par",
    none: "Nenhuma equipe",
  };
  const base = labels[key] ?? key;
  if (line && ["home", "away"].includes(key)) return `${base}${line}`;
  return base;
}

function mapMarket(item: ApiOddsMarket, event: ApiEvent): Market | null {
  const rawName = item.name?.trim() || "Mercado";
  const options: OddOption[] = [];
  const seen = new Set<string>();
  for (const row of item.odds ?? []) {
    const labeledPrice = Number(row.odds);
    if (row.label && Number.isFinite(labeledPrice) && labeledPrice > 1) {
      const label = String(row.label);
      const id = slug(`${label}-${row.hdp ?? ""}`);
      if (!seen.has(id)) {
        options.push({ id, label, price: labeledPrice });
        seen.add(id);
      }
    }
    for (const key of ["home", "draw", "away", "over", "under", "yes", "no", "1X", "12", "X2", "odd", "even", "none"]) {
      const price = Number(row[key]);
      if (!Number.isFinite(price) || price <= 1) continue;
      const label = optionLabel(key, row, event);
      const id = slug(`${key}-${row.hdp ?? ""}-${row.label ?? ""}`);
      if (seen.has(id)) continue;
      options.push({ id, label, price });
      seen.add(id);
    }
  }
  return options.length ? { id: `oddsio-${slug(rawName)}`, name: marketName(rawName, sportFromSlug(event.sport?.slug)), options } : null;
}

function mapMarkets(event: ApiEventOdds) {
  const bestByName = new Map<string, Market>();
  Object.values(event.bookmakers ?? {}).flat().forEach((item) => {
    const market = mapMarket(item, event);
    if (!market) return;
    const key = market.name.toLowerCase();
    const current = bestByName.get(key);
    if (!current || market.options.length > current.options.length) bestByName.set(key, market);
  });
  return [...bestByName.values()];
}

function mapEvent(event: ApiEventOdds): Match | null {
  const id = event.id == null ? "" : String(event.id);
  const home = event.home?.trim();
  const away = event.away?.trim();
  const date = event.date;
  if (!id || !home || !away || !date) return null;
  const markets = mapMarkets(event);
  if (!markets.length) return null;
  const isLive = event.status === "live";
  return {
    id: `oddsio-${id}`,
    sport: sportFromSlug(event.sport?.slug),
    country: countryFromEvent(event),
    league: event.league?.name ?? event.sport?.name ?? "Odds-API.io",
    home,
    away,
    homeCode: code(home),
    awayCode: code(away),
    kickoff: isLive ? "Ao vivo" : kickoffLabel(date),
    kickoffAt: date,
    status: isLive ? "live" : "upcoming",
    minute: isLive ? event.clock?.minute : undefined,
    score: event.scores?.home != null && event.scores?.away != null ? [event.scores.home, event.scores.away] : undefined,
    markets,
    source: "odds-api-io",
    external: { provider: "odds-api-io", id, sportKey: event.sport?.slug },
  };
}

function eventPriority(event: ApiEvent) {
  if (event.status === "live") return -10_000;
  const text = `${event.league?.name ?? ""} ${event.home ?? ""} ${event.away ?? ""}`.toLowerCase();
  const terms = envList("ODDS_API_IO_PRIORITY_TERMS", DEFAULT_PRIORITY_TERMS);
  const priority = terms.findIndex((term) => text.includes(term.toLowerCase()));
  return priority === -1 ? 0 : -1_000 + priority;
}

function selectedEvents(events: ApiEvent[]) {
  const cutoff = Date.now() - 8 * 60 * 60 * 1000;
  return events
    .filter((event) => event.id != null && event.date && new Date(event.date).getTime() >= cutoff && ["pending", "upcoming", "live"].includes(event.status ?? "pending"))
    .sort((left, right) => eventPriority(left) - eventPriority(right) || new Date(left.date ?? 0).getTime() - new Date(right.date ?? 0).getTime())
    .slice(0, maximumEventsPerSport);
}

function chunks<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

async function loadCache() {
  try {
    const entry = await readProviderCache<FeedCache>(CACHE_KEY);
    return entry?.data ?? null;
  } catch {
    return null;
  }
}

function configuredBookmakers() {
  return envList("ODDS_API_IO_BOOKMAKERS", []).slice(0, 2);
}

async function refreshFeed(previous: FeedCache | null): Promise<OddsApiIoFeedResult> {
  const bookmakers = configuredBookmakers();
  if (!process.env.ODDS_API_IO_KEY || !bookmakers.length) {
    return { matches: previous?.matches ?? [], quota: previous?.quota ?? emptyQuota, requestsSpent: 0, updatedAt: previous?.updatedAt ?? new Date(0).toISOString(), expiresAt: previous?.expiresAt ?? 0, cached: true, stale: true, error: !process.env.ODDS_API_IO_KEY ? "ODDS_API_IO_KEY não configurada" : "ODDS_API_IO_BOOKMAKERS não configurada" };
  }

  const sports = envList("ODDS_API_IO_SPORTS", DEFAULT_SPORTS);
  const matches: Match[] = [];
  const errors: string[] = [];
  let quota = previous?.quota ?? emptyQuota;
  let requestsSpent = 0;
  let successfulSports = 0;
  const from = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
  const to = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  for (const sport of sports) {
    try {
      requestsSpent += 1;
      const eventsResult = await request<ApiEvent[]>("/events", { sport, status: "pending,live", from, to, limit: String(Math.min(5000, maximumEventsPerSport * 5)), bookmaker: bookmakers[0] });
      quota = eventsResult.quota;
      const events = selectedEvents(eventsResult.data);
      const sportMatches: Match[] = [];
      for (const batch of chunks(events, MULTI_EVENT_LIMIT)) {
        if (!batch.length) continue;
        requestsSpent += 1;
        const oddsResult = await request<ApiEventOdds[]>("/odds/multi", { eventIds: batch.map((event) => String(event.id)).join(","), bookmakers: bookmakers.join(",") });
        quota = oddsResult.quota;
        sportMatches.push(...oddsResult.data.flatMap((event) => {
          const match = mapEvent(event);
          return match ? [match] : [];
        }));
      }
      matches.push(...sportMatches);
      successfulSports += 1;
    } catch (error) {
      if (error instanceof ProviderError && error.quota.remaining != null) quota = error.quota;
      errors.push(`${sport}: ${error instanceof Error ? error.message : "falha na consulta"}`);
      matches.push(...(previous?.matches ?? []).filter((match) => match.external?.sportKey === sport));
    }
  }

  if (!successfulSports) {
    const message = errors[0] ?? "Odds-API.io indisponível";
    if (!previous?.matches.length) throw new Error(message);
    const retry: FeedCache = { ...previous, error: message, expiresAt: Date.now() + failureBackoffSeconds * 1000, quota, requestsSpent, stale: true };
    await writeProviderCache(CACHE_KEY, "odds-api-io", retry, { quota, requestsSpent, stale: true, lastError: message }, new Date(retry.expiresAt));
    return { ...retry, cached: true };
  }

  const deduplicated = [...new Map(matches.map((match) => [match.id, match])).values()];
  const updatedAt = new Date().toISOString();
  const cache: FeedCache = { matches: deduplicated, quota, requestsSpent, updatedAt, expiresAt: Date.now() + cacheSeconds * 1000, stale: errors.length > 0, error: errors[0] };
  await writeProviderCache(CACHE_KEY, "odds-api-io", cache, { quota, requestsSpent, stale: cache.stale ?? false, lastError: cache.error ?? null, bookmakers, sports }, new Date(cache.expiresAt));
  return { ...cache, cached: false };
}

export async function getOddsApiIoFeed(force = false): Promise<OddsApiIoFeedResult> {
  const cache = await loadCache();
  if (!process.env.ODDS_API_IO_KEY || !configuredBookmakers().length) {
    return {
      matches: cache?.matches ?? [],
      quota: cache?.quota ?? emptyQuota,
      requestsSpent: 0,
      updatedAt: cache?.updatedAt ?? new Date(0).toISOString(),
      expiresAt: cache?.expiresAt ?? 0,
      cached: true,
      stale: true,
      error: !process.env.ODDS_API_IO_KEY ? "ODDS_API_IO_KEY não configurada" : "ODDS_API_IO_BOOKMAKERS não configurada",
    };
  }
  if (!force && cache && cache.expiresAt > Date.now()) return { ...cache, cached: true };
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const locked = await withProviderRefreshLock(CACHE_KEY, async () => {
          const latest = await loadCache();
          if (!force && latest && latest.expiresAt > Date.now()) return { ...latest, cached: true };
          return refreshFeed(latest ?? cache);
        });
        if (locked.acquired) return locked.value;
        const latest = await loadCache() ?? cache;
        if (latest) return { ...latest, cached: true, stale: true, refreshing: true, error: latest.error ?? "Atualização já está em andamento" };
        return { matches: [], quota: emptyQuota, requestsSpent: 0, updatedAt: new Date(0).toISOString(), expiresAt: 0, cached: false, stale: true, refreshing: true, error: "Atualização já está em andamento" };
      } catch {
        return refreshFeed(cache);
      }
    })().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

export async function getOddsApiIoStatus() {
  const cache = await loadCache();
  const sports = envList("ODDS_API_IO_SPORTS", DEFAULT_SPORTS);
  return {
    configured: Boolean(process.env.ODDS_API_IO_KEY && configuredBookmakers().length),
    keyConfigured: Boolean(process.env.ODDS_API_IO_KEY),
    bookmakersConfigured: configuredBookmakers().length,
    sports,
    matches: cache?.matches.length ?? 0,
    quota: cache?.quota ?? emptyQuota,
    updatedAt: cache?.updatedAt ?? null,
    expiresAt: cache?.expiresAt ?? null,
    stale: Boolean(cache && (cache.stale || cache.expiresAt <= Date.now())),
    lastError: cache?.error ?? null,
    cacheSeconds,
    estimatedRefreshRequests: sports.length * (1 + Math.ceil(maximumEventsPerSport / MULTI_EVENT_LIMIT)),
  };
}

export async function getOddsApiIoResult(eventId: string) {
  const response = await request<ApiEvent>(`/events/${encodeURIComponent(eventId)}`, {});
  return { event: response.data, quota: response.quota, requestsSpent: 1 };
}
