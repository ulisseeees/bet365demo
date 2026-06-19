import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Market, Match, OddOption } from "./types";
import { readProviderCache, writeProviderCache } from "./provider-cache";

interface ApiFixture {
  fixture?: {
    id?: number;
    date?: string;
    status?: { short?: string; elapsed?: number | null };
  };
  league?: { name?: string; country?: string };
  teams?: { home?: { name?: string }; away?: { name?: string } };
  goals?: { home?: number | null; away?: number | null };
}

interface ApiOddValue {
  value?: string | number;
  odd?: string | number;
  handicap?: string | number;
  suspended?: boolean;
}

interface ApiBet {
  id?: number;
  name?: string;
  values?: ApiOddValue[];
}

interface ApiLiveOdds {
  fixture?: { id?: number; status?: { minute?: number } };
  league?: { name?: string; country?: string };
  teams?: { home?: { name?: string }; away?: { name?: string } };
  odds?: ApiBet[];
}

interface ApiPrematchOdds {
  fixture?: { id?: number };
  bookmakers?: { id?: number; name?: string; bets?: ApiBet[] }[];
}

interface ApiPayload<T> {
  errors?: Record<string, string> | string[];
  paging?: { current?: number; total?: number };
  response?: T[];
}

export interface ApiFootballQuota {
  dailyLimit: number | null;
  dailyRemaining: number | null;
  minuteLimit: number | null;
  minuteRemaining: number | null;
}

export interface ApiFootballFixtureOption {
  id: number;
  date: string;
  status: string;
  league: string;
  country: string;
  home: string;
  away: string;
  score?: [number, number];
}

export interface ApiFootballResult {
  fixtureId: number;
  status: string;
  elapsed: number | null;
  date: string;
  home: string;
  away: string;
  homeGoals: number | null;
  awayGoals: number | null;
}

interface ApiFootballFeedMeta {
  cacheSeconds: number;
  oddsPagesLoaded: number;
  totalOddsPages: number;
  requestsSpent: number;
  quota: ApiFootballQuota;
}

interface FeedCache {
  expiresAt: number;
  matches: Match[];
  meta: ApiFootballFeedMeta;
  updatedAt: string;
}

interface FixtureCacheEntry {
  expiresAt: number;
  fixtures: ApiFootballFixtureOption[];
  quota: ApiFootballQuota;
  updatedAt: string;
}

interface OddsCacheEntry {
  expiresAt: number;
  match: Match;
  quota: ApiFootballQuota;
  updatedAt: string;
}

const dataDirectory = path.join(process.cwd(), "data");
const feedCachePath = path.join(dataDirectory, "api-football-cache.json");
const fixturesCachePath = path.join(dataDirectory, "api-football-fixtures-cache.json");
const oddsCachePath = path.join(dataDirectory, "api-football-odds-cache.json");

const emptyQuota: ApiFootballQuota = { dailyLimit: null, dailyRemaining: null, minuteLimit: null, minuteRemaining: null };
const liveStatuses = new Set(["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"]);
const popularMarketPatterns = [
  /^match winner$/i,
  /^goals over\/under$/i,
  /^both teams (to )?score$/i,
  /^corners over under$/i,
  /^double chance$/i,
  /^home\/away$/i,
  /^asian handicap$/i,
  /^first half winner$/i,
  /^goals over\/under first half$/i,
  /^exact score$/i,
];

const marketTranslations: Array<[RegExp, string]> = [
  [/^Match Winner$/i, "Resultado da partida"],
  [/^Home\/Away$/i, "Vencedor sem empate"],
  [/^Goals Over\/Under$/i, "Total de gols"],
  [/^Both Teams (To )?Score$/i, "Ambas marcam"],
  [/^Corners Over Under$/i, "Total de escanteios"],
  [/^Double Chance$/i, "Dupla chance"],
  [/^Asian Handicap$/i, "Handicap asiático"],
  [/^Exact Score$/i, "Placar exato"],
  [/^First Half Winner$/i, "Resultado do 1º tempo"],
  [/^Second Half Winner$/i, "Resultado do 2º tempo"],
  [/^Goals Over\/Under First Half$/i, "Total de gols - 1º tempo"],
  [/^Goals Over\/Under - Second Half$/i, "Total de gols - 2º tempo"],
  [/^Both Teams Score - First Half$/i, "Ambas marcam - 1º tempo"],
  [/^Both Teams To Score - Second Half$/i, "Ambas marcam - 2º tempo"],
  [/^Total Corners \(1st Half\)$/i, "Total de escanteios - 1º tempo"],
  [/^Home Corners Over\/Under$/i, "Escanteios do mandante"],
  [/^Away Corners Over\/Under$/i, "Escanteios do visitante"],
  [/^Match Corners$/i, "Escanteios da partida"],
  [/^Match Goals$/i, "Gols da partida"],
  [/^Over\/Under Line$/i, "Linha de gols"],
  [/^Total Corners$/i, "Total de escanteios"],
  [/^Final Score$/i, "Placar final"],
];

function positiveInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export const apiFootballCacheSeconds = positiveInteger(process.env.API_FEED_CACHE_SECONDS, 86400, 300, 604800);
const adminCacheSeconds = positiveInteger(process.env.API_FOOTBALL_ADMIN_CACHE_SECONDS, 86400, 300, 604800);
const oddsPageLimit = positiveInteger(process.env.API_ODDS_PAGES, 1, 1, 10);

const code = (name: string) => name.replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 3).toUpperCase() || "ARE";
const slug = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "option";

function todayInSaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function kickoffLabel(date?: string) {
  if (!date) return "Em breve";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

function translateMarketName(name = "Mercado") {
  const direct = marketTranslations.find(([pattern]) => pattern.test(name));
  if (direct) return direct[1];
  return name
    .replace(/Both Teams To Score/gi, "Ambas marcam")
    .replace(/Both Teams Score/gi, "Ambas marcam")
    .replace(/Goals/gi, "Gols")
    .replace(/Corners/gi, "Escanteios")
    .replace(/First Half/gi, "1º tempo")
    .replace(/Second Half/gi, "2º tempo")
    .replace(/Home Team/gi, "Mandante")
    .replace(/Away Team/gi, "Visitante")
    .replace(/Winner/gi, "Vencedor")
    .replace(/Odd\/Even/gi, "Ímpar/Par")
    .replace(/Exact Score/gi, "Placar exato");
}

function translateOption(value: string, home: string, away: string) {
  const normalized = value.trim();
  const lower = normalized.toLowerCase();
  if (["home", "1"].includes(lower)) return home;
  if (["away", "2"].includes(lower)) return away;
  if (["draw", "x"].includes(lower)) return "Empate";
  if (lower === "yes") return "Sim";
  if (lower === "no") return "Não";
  if (lower === "1x") return `${home} ou empate`;
  if (lower === "x2") return `${away} ou empate`;
  if (lower === "12") return "Sem empate";
  if (lower === "home/draw") return `${home} ou empate`;
  if (lower === "draw/away") return `${away} ou empate`;
  if (lower === "home/away") return "Sem empate";
  if (lower === "odd") return "Ímpar";
  if (lower === "even") return "Par";
  if (/^over\b/i.test(normalized)) return normalized.replace(/^over/i, "Mais de");
  if (/^under\b/i.test(normalized)) return normalized.replace(/^under/i, "Menos de");
  if (/^home\b/i.test(normalized)) return normalized.replace(/^home/i, home);
  if (/^away\b/i.test(normalized)) return normalized.replace(/^away/i, away);
  if (/^draw\b/i.test(normalized)) return normalized.replace(/^draw/i, "Empate");
  return normalized;
}

function mapMarket(bet: ApiBet, home: string, away: string, phase: "live" | "prematch"): Market | null {
  const marketName = bet.name?.trim() || `Mercado ${bet.id ?? ""}`.trim();
  const options: OddOption[] = (bet.values ?? []).flatMap((item, index) => {
    const rawValue = item.value == null ? "" : String(item.value).trim();
    const price = Number(item.odd);
    if (!rawValue || !Number.isFinite(price) || price <= 1 || item.suspended === true) return [];
    const handicap = item.handicap == null ? "" : String(item.handicap).trim();
    const translated = translateOption(rawValue, home, away);
    const label = handicap && !translated.includes(handicap) ? `${translated} (${handicap})` : translated;
    return [{ id: `${index}-${slug(rawValue)}${handicap ? `-${slug(handicap)}` : ""}`, label, price }];
  });
  if (!options.length) return null;
  return { id: `${phase}-${bet.id ?? slug(marketName)}`, name: translateMarketName(marketName), options };
}

function marketPriority(bet: ApiBet) {
  const index = popularMarketPatterns.findIndex((pattern) => pattern.test(bet.name ?? ""));
  return index === -1 ? popularMarketPatterns.length + (bet.id ?? 9999) : index;
}

function mapMarkets(bets: ApiBet[] | undefined, home: string, away: string, phase: "live" | "prematch") {
  return [...(bets ?? [])]
    .sort((left, right) => marketPriority(left) - marketPriority(right))
    .flatMap((bet) => {
      const market = mapMarket(bet, home, away, phase);
      return market ? [market] : [];
    });
}

function bestBookmaker(item?: ApiPrematchOdds) {
  return [...(item?.bookmakers ?? [])].sort((left, right) => (right.bets?.length ?? 0) - (left.bets?.length ?? 0))[0];
}

function payloadHasErrors<T>(payload: ApiPayload<T>) {
  if (Array.isArray(payload.errors)) return payload.errors.length > 0;
  return Boolean(payload.errors && Object.keys(payload.errors).length);
}

function headerNumber(headers: Headers, name: string) {
  const value = headers.get(name);
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function quotaFromHeaders(headers: Headers): ApiFootballQuota {
  return {
    dailyLimit: headerNumber(headers, "x-ratelimit-requests-limit"),
    dailyRemaining: headerNumber(headers, "x-ratelimit-requests-remaining"),
    minuteLimit: headerNumber(headers, "x-ratelimit-limit"),
    minuteRemaining: headerNumber(headers, "x-ratelimit-remaining"),
  };
}

function mergeQuota(...quotas: ApiFootballQuota[]) {
  return quotas.reduce<ApiFootballQuota>((current, quota) => ({
    dailyLimit: quota.dailyLimit ?? current.dailyLimit,
    dailyRemaining: quota.dailyRemaining ?? current.dailyRemaining,
    minuteLimit: quota.minuteLimit ?? current.minuteLimit,
    minuteRemaining: quota.minuteRemaining ?? current.minuteRemaining,
  }), emptyQuota);
}

async function fetchApi<T>(endpoint: string, label: string) {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) throw new Error("API_FOOTBALL_KEY não configurada");
  const response = await fetch(`https://v3.football.api-sports.io${endpoint}`, {
    cache: "no-store",
    headers: { "x-apisports-key": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${label}: API-Football respondeu ${response.status}`);
  const payload = await response.json() as ApiPayload<T>;
  if (payloadHasErrors(payload)) throw new Error(`${label}: a API-Football recusou a consulta`);
  return { payload, quota: quotaFromHeaders(response.headers) };
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(filePath: string, value: unknown) {
  await mkdir(dataDirectory, { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(value, null, 2), "utf8");
  await rename(temporaryPath, filePath);
}

function fixtureOption(item: ApiFixture): ApiFootballFixtureOption | null {
  const id = item.fixture?.id;
  const date = item.fixture?.date;
  const home = item.teams?.home?.name;
  const away = item.teams?.away?.name;
  if (!id || !date || !home || !away) return null;
  const homeScore = item.goals?.home;
  const awayScore = item.goals?.away;
  return {
    id,
    date,
    status: item.fixture?.status?.short ?? "NS",
    league: item.league?.name ?? "Futebol",
    country: item.league?.country ?? "Internacional",
    home,
    away,
    score: homeScore != null && awayScore != null ? [homeScore, awayScore] : undefined,
  };
}

function buildMatch(fixture: ApiFootballFixtureOption, markets: Market[], minute?: number): Match {
  const isLive = liveStatuses.has(fixture.status);
  return {
    id: `api-${fixture.id}`,
    sport: "Futebol",
    country: fixture.country,
    league: fixture.league,
    home: fixture.home,
    away: fixture.away,
    homeCode: code(fixture.home),
    awayCode: code(fixture.away),
    kickoff: isLive ? "Ao vivo" : kickoffLabel(fixture.date),
    kickoffAt: fixture.date,
    status: isLive ? "live" : "upcoming",
    minute: isLive ? minute ?? 0 : undefined,
    score: isLive ? fixture.score ?? [0, 0] : undefined,
    source: "api-football",
    external: { provider: "api-football", id: String(fixture.id) },
    markets,
  };
}

let memoryFeedCache: FeedCache | null = null;
let feedRefreshPromise: Promise<ReturnTypeResult> | null = null;

type ReturnTypeResult = {
  matches: Match[];
  meta: ApiFootballFeedMeta | null;
  updatedAt: string | null;
  error: string | null;
  cached: boolean;
  stale?: boolean;
};

async function loadFeedCache() {
  if (memoryFeedCache) return memoryFeedCache;
  try {
    const cloud = await readProviderCache<FeedCache>("api-football:automatic");
    if (cloud?.data) memoryFeedCache = cloud.data;
  } catch {
    // O arquivo local continua sendo um fallback útil no desenvolvimento.
  }
  if (!memoryFeedCache) memoryFeedCache = await readJson<FeedCache | null>(feedCachePath, null);
  return memoryFeedCache;
}

async function refreshAutomaticFeed(): Promise<ReturnTypeResult> {
  const previous = await loadFeedCache();
  try {
    const date = todayInSaoPaulo();
    const [fixturesResult, prematchResult, liveResult] = await Promise.all([
      fetchApi<ApiFixture>(`/fixtures?date=${date}&timezone=America%2FSao_Paulo`, "Partidas"),
      fetchApi<ApiPrematchOdds>(`/odds?date=${date}&page=1`, "Odds pré-jogo"),
      fetchApi<ApiLiveOdds>("/odds/live", "Odds ao vivo").catch(() => ({ payload: { response: [] }, quota: emptyQuota })),
    ]);

    const totalOddsPages = prematchResult.payload.paging?.total ?? 1;
    const pagesToLoad = Math.min(totalOddsPages, oddsPageLimit);
    const additionalPages = pagesToLoad > 1
      ? await Promise.all(Array.from({ length: pagesToLoad - 1 }, (_, index) => fetchApi<ApiPrematchOdds>(`/odds?date=${date}&page=${index + 2}`, `Odds pré-jogo página ${index + 2}`)))
      : [];
    const prematchItems = [prematchResult.payload, ...additionalPages.map((result) => result.payload)].flatMap((payload) => payload.response ?? []);
    const fixtures = (fixturesResult.payload.response ?? []).flatMap((item) => {
      const option = fixtureOption(item);
      return option ? [option] : [];
    });
    const fixturesById = new Map(fixtures.map((item) => [item.id, item]));
    const prematchByFixture = new Map(prematchItems.flatMap((item) => item.fixture?.id ? [[item.fixture.id, item] as const] : []));
    const liveByFixture = new Map((liveResult.payload.response ?? []).flatMap((item) => item.fixture?.id ? [[item.fixture.id, item] as const] : []));
    const fixtureIds = new Set([...prematchByFixture.keys(), ...liveByFixture.keys()]);
    const matches = [...fixtureIds].flatMap((fixtureId): Match[] => {
      const fixture = fixturesById.get(fixtureId);
      const liveOdds = liveByFixture.get(fixtureId);
      const prematchOdds = prematchByFixture.get(fixtureId);
      const home = fixture?.home ?? liveOdds?.teams?.home?.name;
      const away = fixture?.away ?? liveOdds?.teams?.away?.name;
      if (!home || !away) return [];
      const normalizedFixture: ApiFootballFixtureOption = fixture ?? {
        id: fixtureId,
        date: new Date().toISOString(),
        status: "LIVE",
        league: liveOdds?.league?.name ?? "Futebol",
        country: liveOdds?.league?.country ?? "Internacional",
        home,
        away,
      };
      const isLive = liveStatuses.has(normalizedFixture.status) || Boolean(liveOdds);
      const markets = isLive
        ? mapMarkets(liveOdds?.odds, home, away, "live")
        : mapMarkets(bestBookmaker(prematchOdds)?.bets, home, away, "prematch");
      if (!markets.length) return [];
      return [buildMatch({ ...normalizedFixture, status: isLive ? "LIVE" : normalizedFixture.status }, markets, liveOdds?.fixture?.status?.minute)];
    }).sort((left, right) => {
      if (left.status !== right.status) return left.status === "live" ? -1 : 1;
      return (left.kickoffAt ?? "").localeCompare(right.kickoffAt ?? "");
    });

    const quota = mergeQuota(fixturesResult.quota, prematchResult.quota, liveResult.quota, ...additionalPages.map((result) => result.quota));
    const updatedAt = new Date().toISOString();
    const meta: ApiFootballFeedMeta = { cacheSeconds: apiFootballCacheSeconds, oddsPagesLoaded: pagesToLoad, totalOddsPages, requestsSpent: 3 + additionalPages.length, quota };
    const cache: FeedCache = { matches, meta, updatedAt, expiresAt: Date.now() + apiFootballCacheSeconds * 1000 };
    const fixturesStore = await readJson<Record<string, FixtureCacheEntry>>(fixturesCachePath, {});
    fixturesStore[date] = { fixtures, quota, updatedAt, expiresAt: Date.now() + adminCacheSeconds * 1000 };
    memoryFeedCache = cache;
    await Promise.all([
      writeJson(feedCachePath, cache),
      writeJson(fixturesCachePath, fixturesStore),
      writeProviderCache("api-football:automatic", "api-football", cache, { quota, requestsSpent: meta.requestsSpent }, new Date(cache.expiresAt)),
      writeProviderCache(`api-football:fixtures:${date}`, "api-football", fixturesStore[date], { quota }, new Date(fixturesStore[date].expiresAt)),
    ]);
    return { matches, meta, updatedAt, error: matches.length ? null : "Nenhuma partida com odds foi encontrada na API-Football", cached: false };
  } catch (error) {
    if (previous?.matches.length) {
      return { matches: previous.matches, meta: previous.meta, updatedAt: previous.updatedAt, error: error instanceof Error ? error.message : "Falha ao atualizar API-Football", cached: true, stale: true };
    }
    return { matches: [], meta: null, updatedAt: null, error: error instanceof Error ? error.message : "Não foi possível atualizar a API-Football", cached: false };
  }
}

export async function getApiFootballFeed(force = false): Promise<ReturnTypeResult> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return { matches: [], meta: null, updatedAt: null, error: "API_FOOTBALL_KEY não configurada", cached: false };
  const cache = await loadFeedCache();
  if (!force && cache && cache.expiresAt > Date.now()) {
    return { matches: cache.matches, meta: cache.meta, updatedAt: cache.updatedAt, error: null, cached: true };
  }
  if (!feedRefreshPromise) feedRefreshPromise = refreshAutomaticFeed().finally(() => { feedRefreshPromise = null; });
  return feedRefreshPromise;
}

export async function getApiFootballStatus() {
  const cache = await loadFeedCache();
  return {
    configured: Boolean(process.env.API_FOOTBALL_KEY),
    matches: cache?.matches.length ?? 0,
    updatedAt: cache?.updatedAt ?? null,
    expiresAt: cache?.expiresAt ?? null,
    quota: cache?.meta.quota ?? emptyQuota,
    cacheSeconds: apiFootballCacheSeconds,
  };
}

export async function searchApiFootballFixtures(date: string, force = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Data inválida");
  const store = await readJson<Record<string, FixtureCacheEntry>>(fixturesCachePath, {});
  let cached = store[date];
  try {
    const cloud = await readProviderCache<FixtureCacheEntry>(`api-football:fixtures:${date}`);
    if (cloud?.data) cached = cloud.data;
  } catch { /* fallback local */ }
  if (!force && cached && cached.expiresAt > Date.now()) {
    return { fixtures: cached.fixtures, quota: cached.quota, requestsSpent: 0, cached: true, updatedAt: cached.updatedAt };
  }
  const result = await fetchApi<ApiFixture>(`/fixtures?date=${date}&timezone=America%2FSao_Paulo`, "Busca de partidas");
  const fixtures = (result.payload.response ?? []).flatMap((item) => {
    const option = fixtureOption(item);
    return option ? [option] : [];
  });
  const updatedAt = new Date().toISOString();
  store[date] = { fixtures, quota: result.quota, updatedAt, expiresAt: Date.now() + adminCacheSeconds * 1000 };
  await Promise.all([
    writeJson(fixturesCachePath, store),
    writeProviderCache(`api-football:fixtures:${date}`, "api-football", store[date], { quota: result.quota }, new Date(store[date].expiresAt)),
  ]);
  return { fixtures, quota: result.quota, requestsSpent: 1, cached: false, updatedAt };
}

export async function discoverApiFootballMarkets(date: string, fixtureId: number, force = false) {
  const fixturesStore = await readJson<Record<string, FixtureCacheEntry>>(fixturesCachePath, {});
  let fixtureEntry = fixturesStore[date];
  try {
    const cloud = await readProviderCache<FixtureCacheEntry>(`api-football:fixtures:${date}`);
    if (cloud?.data) fixtureEntry = cloud.data;
  } catch { /* fallback local */ }
  const fixture = fixtureEntry?.fixtures.find((item) => item.id === fixtureId);
  if (!fixture) throw new Error("Busque esta data novamente antes de consultar as odds");
  const oddsStore = await readJson<Record<string, OddsCacheEntry>>(oddsCachePath, {});
  const cacheKey = String(fixtureId);
  let cached = oddsStore[cacheKey];
  try {
    const cloud = await readProviderCache<OddsCacheEntry>(`api-football:odds:${fixtureId}`);
    if (cloud?.data) cached = cloud.data;
  } catch { /* fallback local */ }
  if (!force && cached && cached.expiresAt > Date.now()) {
    return { match: cached.match, quota: cached.quota, requestsSpent: 0, cached: true, updatedAt: cached.updatedAt };
  }

  const isLive = liveStatuses.has(fixture.status);
  let markets: Market[] = [];
  let quota = emptyQuota;
  let minute: number | undefined;
  if (isLive) {
    const result = await fetchApi<ApiLiveOdds>(`/odds/live?fixture=${fixtureId}`, "Odds ao vivo da partida");
    const item = result.payload.response?.find((entry) => entry.fixture?.id === fixtureId);
    markets = mapMarkets(item?.odds, fixture.home, fixture.away, "live");
    minute = item?.fixture?.status?.minute;
    quota = result.quota;
  } else {
    const result = await fetchApi<ApiPrematchOdds>(`/odds?fixture=${fixtureId}&page=1`, "Odds da partida");
    const item = result.payload.response?.find((entry) => entry.fixture?.id === fixtureId);
    markets = mapMarkets(bestBookmaker(item)?.bets, fixture.home, fixture.away, "prematch");
    quota = result.quota;
  }
  if (!markets.length) throw new Error("A API-Football ainda não oferece odds para esta partida");
  const match = buildMatch(fixture, markets, minute);
  const updatedAt = new Date().toISOString();
  oddsStore[cacheKey] = { match, quota, updatedAt, expiresAt: Date.now() + adminCacheSeconds * 1000 };
  await Promise.all([
    writeJson(oddsCachePath, oddsStore),
    writeProviderCache(`api-football:odds:${fixtureId}`, "api-football", oddsStore[cacheKey], { quota }, new Date(oddsStore[cacheKey].expiresAt)),
  ]);
  return { match, quota, requestsSpent: 1, cached: false, updatedAt };
}

export async function getCachedApiFootballMatch(fixtureId: number) {
  try {
    const cloud = await readProviderCache<OddsCacheEntry>(`api-football:odds:${fixtureId}`);
    if (cloud?.data?.match) return cloud.data.match;
  } catch { /* fallback local */ }
  const oddsStore = await readJson<Record<string, OddsCacheEntry>>(oddsCachePath, {});
  return oddsStore[String(fixtureId)]?.match ?? null;
}

export async function getApiFootballResults(fixtureIds: number[]) {
  const ids = [...new Set(fixtureIds)].filter((id) => Number.isInteger(id) && id > 0).slice(0, 20);
  if (!ids.length) return { results: [] as ApiFootballResult[], quota: emptyQuota, requestsSpent: 0 };
  const response = await fetchApi<ApiFixture>(`/fixtures?ids=${ids.join("-")}&timezone=America%2FSao_Paulo`, "Atualização de resultados");
  const results = (response.payload.response ?? []).flatMap((item): ApiFootballResult[] => {
    const fixtureId = item.fixture?.id;
    const date = item.fixture?.date;
    const home = item.teams?.home?.name;
    const away = item.teams?.away?.name;
    if (!fixtureId || !date || !home || !away) return [];
    return [{
      fixtureId,
      status: item.fixture?.status?.short ?? "NS",
      elapsed: item.fixture?.status?.elapsed ?? null,
      date,
      home,
      away,
      homeGoals: item.goals?.home ?? null,
      awayGoals: item.goals?.away ?? null,
    }];
  });
  return { results, quota: response.quota, requestsSpent: 1 };
}
