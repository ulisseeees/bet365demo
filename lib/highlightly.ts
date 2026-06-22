import "server-only";

import { sql } from "@vercel/postgres";
import { ensureDatabaseSchema } from "./database";
import { getCombinedFeed } from "./feed";
import { readProviderCache, withProviderRefreshLock, writeProviderCache } from "./provider-cache";
import type { LiveMatchEvent, LiveMatchSnapshot, LiveMatchStatistic, LiveTopPlayer, MatchStatus } from "./types";

const API_BASE_URL = "https://soccer.highlightly.net";
const QUOTA_CACHE_KEY = "highlightly:quota";
const FINISHED_STATES = new Set(["finished", "finished after penalties", "finished after extra time", "awarded"]);
const CANCELLED_STATES = new Set(["postponed", "cancelled", "abandoned"]);
const LIVE_STATES = new Set(["first half", "half time", "second half", "extra time", "break time", "penalties", "suspended", "interrupted", "in progress"]);

interface ApiTeam { id: number; name: string; logo?: string }
interface ApiState { description?: string; clock?: number; score?: { current?: string; penalties?: string } }
interface ApiEvent { team?: ApiTeam; time?: string; type?: string; player?: string; assist?: string }
interface ApiStatistic { value?: number; displayName?: string }
interface ApiTeamStatistics { team?: ApiTeam; statistics?: ApiStatistic[] }
interface ApiTopPlayer { position?: string; name?: string; statistics?: Array<{ name?: string; value?: unknown }> }
interface ApiDetailedTeam extends ApiTeam { shots?: unknown[]; topPlayers?: ApiTopPlayer[] }
interface ApiMatch {
  id: number;
  date: string;
  homeTeam: ApiDetailedTeam;
  awayTeam: ApiDetailedTeam;
  state?: ApiState;
  events?: ApiEvent[];
  statistics?: ApiTeamStatistics[];
}
interface ApiMatchPage { data?: ApiMatch[] }
interface Quota { remaining: number | null; limit: number | null }

interface TrackingRow {
  match_id: string;
  highlightly_id: number | string | null;
  home_name: string;
  away_name: string;
  kickoff_at: string | Date | null;
  status: string;
  live_data: LiveMatchSnapshot | Record<string, never>;
  last_polled_at: string | Date | null;
  next_poll_at: string | Date | null;
}

const integerEnv = (name: string, fallback: number, min: number, max: number) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;
};

const liveCacheSeconds = integerEnv("HIGHLIGHTLY_LIVE_CACHE_SECONDS", 120, 60, 600);
const resolveCacheSeconds = integerEnv("HIGHLIGHTLY_RESOLVE_CACHE_SECONDS", 21600, 1800, 86400);

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(fc|sc|ac|cf|fk|afc|futebol clube|football club)\b/g, "").replace(/[^a-z0-9]+/g, "").replace(/^unitedstates(ofamerica)?$/, "usa").replace(/^korearepublic$/, "southkorea");

function quotaFromHeaders(headers: Headers): Quota {
  const number = (name: string) => {
    const value = headers.get(name);
    return value == null || !Number.isFinite(Number(value)) ? null : Number(value);
  };
  return { remaining: number("x-ratelimit-requests-remaining"), limit: number("x-ratelimit-requests-limit") };
}

async function request<T>(path: string, parameters: Record<string, string> = {}) {
  const apiKey = process.env.HIGHLIGHTLY_API_KEY;
  if (!apiKey) throw new Error("HIGHLIGHTLY_API_KEY não configurada");
  const url = new URL(path, API_BASE_URL);
  Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json", "x-rapidapi-key": apiKey }, signal: AbortSignal.timeout(15_000) });
  const quota = quotaFromHeaders(response.headers);
  writeProviderCache(QUOTA_CACHE_KEY, "highlightly", quota, { remaining: quota.remaining, limit: quota.limit }, null).catch(() => undefined);
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string; error?: string } | null;
    throw new Error(payload?.message ?? payload?.error ?? `Highlightly respondeu ${response.status}`);
  }
  return { data: await response.json() as T, quota };
}

function localDate(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const item = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${item("year")}-${item("month")}-${item("day")}`;
}

function scorePair(value?: string): [number, number] | null {
  const numbers = value?.match(/\d+/g)?.map(Number) ?? [];
  return numbers.length >= 2 ? [numbers[0], numbers[1]] : null;
}

function statusFromDescription(description = "") {
  const normalized = description.toLowerCase();
  if (FINISHED_STATES.has(normalized)) return "finished" as MatchStatus;
  if (LIVE_STATES.has(normalized)) return "live" as MatchStatus;
  return "upcoming" as MatchStatus;
}

function numeric(value: unknown) {
  const number = typeof value === "string" ? Number(value.replace("%", "").replace(",", ".")) : Number(value);
  return Number.isFinite(number) ? number : null;
}

function mappedStatistics(match: ApiMatch): LiveMatchStatistic[] {
  const home = match.statistics?.find((item) => item.team?.id === match.homeTeam.id) ?? match.statistics?.[0];
  const away = match.statistics?.find((item) => item.team?.id === match.awayTeam.id) ?? match.statistics?.[1];
  const names = [...new Set([...(home?.statistics ?? []), ...(away?.statistics ?? [])].map((item) => item.displayName).filter((item): item is string => Boolean(item)))];
  return names.map((name) => ({
    name,
    home: numeric(home?.statistics?.find((item) => item.displayName === name)?.value),
    away: numeric(away?.statistics?.find((item) => item.displayName === name)?.value),
  }));
}

function rating(player: ApiTopPlayer) {
  const item = player.statistics?.find((stat) => /rating|nota/i.test(stat.name ?? ""));
  const value = item?.value;
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function topPlayers(match: ApiMatch): LiveTopPlayer[] {
  return [
    ...(match.homeTeam.topPlayers ?? []).slice(0, 3).flatMap((player): LiveTopPlayer[] => player.name ? [{ team: "home", name: player.name, position: player.position, rating: rating(player) }] : []),
    ...(match.awayTeam.topPlayers ?? []).slice(0, 3).flatMap((player): LiveTopPlayer[] => player.name ? [{ team: "away", name: player.name, position: player.position, rating: rating(player) }] : []),
  ];
}

function pressure(match: ApiMatch, statistics: LiveMatchStatistic[]) {
  const possession = statistics.find((item) => /possession|posse/i.test(item.name));
  if (possession?.home != null && possession.away != null && possession.home + possession.away > 0) {
    const total = possession.home + possession.away;
    return { home: Math.round(possession.home / total * 100), away: Math.round(possession.away / total * 100) };
  }
  const shots = statistics.find((item) => /shots|finaliza/i.test(item.name));
  const homeShots = shots?.home ?? match.homeTeam.shots?.length ?? 0;
  const awayShots = shots?.away ?? match.awayTeam.shots?.length ?? 0;
  const total = homeShots + awayShots;
  return total > 0 ? { home: Math.round(homeShots / total * 100), away: Math.round(awayShots / total * 100) } : { home: 50, away: 50 };
}

function mapDetailedMatch(matchId: string, match: ApiMatch, quota: Quota): LiveMatchSnapshot {
  const statistics = mappedStatistics(match);
  const description = match.state?.description ?? "Not started";
  return {
    matchId,
    highlightlyId: match.id,
    resolved: true,
    status: statusFromDescription(description),
    statusLabel: description,
    home: match.homeTeam.name,
    away: match.awayTeam.name,
    kickoffAt: match.date,
    clock: match.state?.clock ?? null,
    score: scorePair(match.state?.score?.current),
    events: (match.events ?? []).map((event): LiveMatchEvent => ({ time: event.time ?? "", type: event.type ?? "Evento", teamId: event.team?.id, team: event.team?.name ?? "", player: event.player, assist: event.assist })),
    statistics,
    topPlayers: topPlayers(match),
    pressure: pressure(match, statistics),
    lastUpdatedAt: new Date().toISOString(),
    quota,
  };
}

function unresolvedSnapshot(row: TrackingRow, quota?: Quota): LiveMatchSnapshot {
  return {
    matchId: row.match_id,
    highlightlyId: row.highlightly_id == null ? null : Number(row.highlightly_id),
    resolved: false,
    status: "unresolved",
    statusLabel: "Sincronizando partida",
    home: row.home_name,
    away: row.away_name,
    kickoffAt: row.kickoff_at ? new Date(row.kickoff_at).toISOString() : null,
    clock: null,
    score: null,
    events: [],
    statistics: [],
    topPlayers: [],
    pressure: { home: 50, away: 50 },
    lastUpdatedAt: row.last_polled_at ? new Date(row.last_polled_at).toISOString() : null,
    nextUpdateAt: row.next_poll_at ? new Date(row.next_poll_at).toISOString() : null,
    quota,
  };
}

function rowSnapshot(row: TrackingRow, quota?: Quota): LiveMatchSnapshot {
  const stored = row.live_data && "matchId" in row.live_data ? row.live_data as LiveMatchSnapshot : null;
  return stored ? {
    ...stored,
    matchId: row.match_id,
    highlightlyId: row.highlightly_id == null ? stored.highlightlyId : Number(row.highlightly_id),
    lastUpdatedAt: row.last_polled_at ? new Date(row.last_polled_at).toISOString() : stored.lastUpdatedAt,
    nextUpdateAt: row.next_poll_at ? new Date(row.next_poll_at).toISOString() : stored.nextUpdateAt,
    quota,
  } : unresolvedSnapshot(row, quota);
}

async function pendingTrackingRows(userId?: string) {
  const result = userId
    ? await sql`
        SELECT DISTINCT ht.* FROM highlightly_tracking ht
        JOIN bet_selections bs ON bs.match_id = ht.match_id
        JOIN bets b ON b.id = bs.bet_id
        WHERE b.status = 'pending' AND bs.result = 'pending' AND b.user_id = ${userId}
      `
    : await sql`
        SELECT DISTINCT ht.* FROM highlightly_tracking ht
        JOIN bet_selections bs ON bs.match_id = ht.match_id
        JOIN bets b ON b.id = bs.bet_id
        WHERE b.status = 'pending' AND bs.result = 'pending'
      `;
  return result.rows as unknown as TrackingRow[];
}

export async function ensureHighlightlyTracking(userId?: string) {
  await ensureDatabaseSchema();
  const pending = userId
    ? await sql`SELECT DISTINCT bs.match_id FROM bet_selections bs JOIN bets b ON b.id = bs.bet_id LEFT JOIN highlightly_tracking ht ON ht.match_id = bs.match_id WHERE b.status = 'pending' AND bs.result = 'pending' AND b.user_id = ${userId} AND ht.match_id IS NULL`
    : await sql`SELECT DISTINCT bs.match_id FROM bet_selections bs JOIN bets b ON b.id = bs.bet_id LEFT JOIN highlightly_tracking ht ON ht.match_id = bs.match_id WHERE b.status = 'pending' AND bs.result = 'pending' AND ht.match_id IS NULL`;
  if (!pending.rows.length) return 0;
  const { matches } = await getCombinedFeed();
  const byId = new Map(matches.map((match) => [match.id, match]));
  let inserted = 0;
  for (const item of pending.rows) {
    const match = byId.get(String(item.match_id));
    if (!match || match.sport !== "Futebol") continue;
    await sql`
      INSERT INTO highlightly_tracking (match_id, home_name, away_name, kickoff_at, status, next_poll_at)
      VALUES (${match.id}, ${match.home}, ${match.away}, ${match.kickoffAt ?? null}, 'unresolved', ${match.kickoffAt ?? null})
      ON CONFLICT (match_id) DO NOTHING
    `;
    inserted += 1;
  }
  return inserted;
}

async function matchesForDate(date: string) {
  const cacheKey = `highlightly:matches:${date}`;
  const cached = await readProviderCache<ApiMatch[]>(cacheKey).catch(() => null);
  if (cached?.expiresAt && new Date(cached.expiresAt).getTime() > Date.now()) return cached.data;
  const result = await request<ApiMatchPage>("/matches", { date, timezone: "America/Sao_Paulo", limit: "100" });
  const matches = result.data.data ?? [];
  await writeProviderCache(cacheKey, "highlightly", matches, { quota: result.quota }, new Date(Date.now() + resolveCacheSeconds * 1000));
  return matches;
}

function teamSimilarity(left: string, right: string) {
  const a = normalize(left);
  const b = normalize(right);
  if (a === b) return 100;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return 82;
  return 0;
}

async function resolveRows(rows: TrackingRow[]) {
  const now = Date.now();
  const candidates = rows.filter((row) => !row.highlightly_id && row.kickoff_at && new Date(row.kickoff_at).getTime() >= now - 4 * 60 * 60 * 1000 && new Date(row.kickoff_at).getTime() <= now + 24 * 60 * 60 * 1000);
  const groups = new Map<string, TrackingRow[]>();
  candidates.forEach((row) => {
    const date = localDate(row.kickoff_at!);
    groups.set(date, [...(groups.get(date) ?? []), row]);
  });
  for (const [date, group] of groups) {
    let available: ApiMatch[];
    try { available = await matchesForDate(date); } catch { continue; }
    for (const row of group) {
      const kickoff = new Date(row.kickoff_at!).getTime();
      const match = available.map((candidate) => ({
        candidate,
        score: teamSimilarity(row.home_name, candidate.homeTeam.name) + teamSimilarity(row.away_name, candidate.awayTeam.name),
        timeDiff: Math.abs(new Date(candidate.date).getTime() - kickoff),
      })).filter((item) => item.score >= 164 && item.timeDiff <= 12 * 60 * 60 * 1000).sort((left, right) => right.score - left.score || left.timeDiff - right.timeDiff)[0]?.candidate;
      if (!match) continue;
      const firstPoll = new Date(Math.max(Date.now(), new Date(match.date).getTime() - 10 * 60 * 1000)).toISOString();
      await sql`
        UPDATE highlightly_tracking SET highlightly_id = ${match.id}, resolved_at = CURRENT_TIMESTAMP,
          kickoff_at = ${match.date}, status = ${statusFromDescription(match.state?.description)}, next_poll_at = ${firstPoll}, updated_at = CURRENT_TIMESTAMP
        WHERE match_id = ${row.match_id}
      `;
    }
  }
}

function pollingInterval(activeCount: number) {
  if (activeCount <= 1) return liveCacheSeconds;
  if (activeCount === 2) return Math.max(180, liveCacheSeconds);
  return Math.max(activeCount * 100, liveCacheSeconds);
}

async function refreshRow(row: TrackingRow, intervalSeconds: number) {
  if (!row.highlightly_id) return;
  const lock = await withProviderRefreshLock(`highlightly:live:${row.match_id}`, async () => {
    const currentResult = await sql`SELECT * FROM highlightly_tracking WHERE match_id = ${row.match_id} LIMIT 1`;
    const current = currentResult.rows[0] as unknown as TrackingRow | undefined;
    if (!current?.highlightly_id || (current.next_poll_at && new Date(current.next_poll_at).getTime() > Date.now())) return null;
    try {
      const response = await request<ApiMatch[]>(`/matches/${current.highlightly_id}`);
      const detailed = response.data[0];
      if (!detailed) throw new Error("Partida não encontrada na Highlightly");
      const snapshot = mapDetailedMatch(current.match_id, detailed, response.quota);
      const finished = snapshot.status === "finished" || CANCELLED_STATES.has(snapshot.statusLabel.toLowerCase());
      const nextPollAt = new Date(Date.now() + (finished ? 24 * 60 * 60 : intervalSeconds) * 1000).toISOString();
      snapshot.nextUpdateAt = nextPollAt;
      await sql`
        UPDATE highlightly_tracking SET status = ${snapshot.status}, live_data = ${JSON.stringify(snapshot)}::jsonb,
          last_polled_at = CURRENT_TIMESTAMP, next_poll_at = ${nextPollAt}, updated_at = CURRENT_TIMESTAMP
        WHERE match_id = ${current.match_id}
      `;
      return snapshot;
    } catch {
      const retryAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      await sql`UPDATE highlightly_tracking SET next_poll_at = ${retryAt}, updated_at = CURRENT_TIMESTAMP WHERE match_id = ${current.match_id}`;
      return null;
    }
  }).catch(() => ({ acquired: false as const, value: null }));
  return lock.acquired ? lock.value : null;
}

export async function refreshHighlightlyTrackedMatches(options: { userId?: string; matchIds?: string[] } = {}) {
  await ensureHighlightlyTracking(options.userId);
  let rows = await pendingTrackingRows(options.userId);
  if (options.matchIds?.length) {
    const wanted = new Set(options.matchIds);
    rows = rows.filter((row) => wanted.has(row.match_id));
  }
  await resolveRows(rows);
  rows = await pendingTrackingRows(options.userId);
  if (options.matchIds?.length) {
    const wanted = new Set(options.matchIds);
    rows = rows.filter((row) => wanted.has(row.match_id));
  }
  const now = Date.now();
  const active = rows.filter((row) => {
    if (!row.highlightly_id || !row.kickoff_at || row.status === "finished") return false;
    const kickoff = new Date(row.kickoff_at).getTime();
    return now >= kickoff - 10 * 60 * 1000 && now <= kickoff + 4 * 60 * 60 * 1000 && (!row.next_poll_at || new Date(row.next_poll_at).getTime() <= now);
  });
  const interval = pollingInterval(active.length);
  await Promise.all(active.map((row) => refreshRow(row, interval)));
  const refreshed = await pendingTrackingRows(options.userId);
  const wanted = options.matchIds?.length ? new Set(options.matchIds) : null;
  const quotaEntry = await readProviderCache<Quota>(QUOTA_CACHE_KEY).catch(() => null);
  return refreshed.filter((row) => !wanted || wanted.has(row.match_id)).map((row) => rowSnapshot(row, quotaEntry?.data));
}

export async function getStoredHighlightlyMatches(matchIds: string[]) {
  if (!matchIds.length) return [];
  await ensureDatabaseSchema();
  const { rows } = await sql`SELECT * FROM highlightly_tracking`;
  const wanted = new Set(matchIds);
  const quotaEntry = await readProviderCache<Quota>(QUOTA_CACHE_KEY).catch(() => null);
  return (rows as unknown as TrackingRow[]).filter((row) => wanted.has(row.match_id)).map((row) => rowSnapshot(row, quotaEntry?.data));
}

export async function getHighlightlyStatus() {
  await ensureDatabaseSchema();
  const [tracking, quotaEntry] = await Promise.all([
    sql`
      SELECT ht.status, ht.highlightly_id, ht.last_polled_at, ht.next_poll_at
      FROM highlightly_tracking ht
      WHERE EXISTS (
        SELECT 1 FROM bet_selections bs JOIN bets b ON b.id = bs.bet_id
        WHERE bs.match_id = ht.match_id AND b.status = 'pending' AND bs.result = 'pending'
      )
    `,
    readProviderCache<Quota>(QUOTA_CACHE_KEY).catch(() => null),
  ]);
  return {
    configured: Boolean(process.env.HIGHLIGHTLY_API_KEY),
    tracked: tracking.rows.length,
    resolved: tracking.rows.filter((row) => row.highlightly_id != null).length,
    live: tracking.rows.filter((row) => row.status === "live").length,
    quota: quotaEntry?.data ?? { remaining: null, limit: null },
    liveCacheSeconds,
    resolveCacheSeconds,
  };
}
