import "server-only";

import { sql } from "@vercel/postgres";
import { getApiFootballResults } from "./api-football";
import { settleBet } from "./account-service";
import { ensureDatabaseSchema } from "./database";
import { getCombinedFeed } from "./feed";
import { refreshHighlightlyTrackedMatches } from "./highlightly";
import { getOddsApiIoResult } from "./odds-api-io";
import { withProviderRefreshLock } from "./provider-cache";
import { getConfiguredOddsApiSportKeys, getOddsApiScores } from "./the-odds-api";
import { providerTrackingInterval } from "./tracking-policy";
import type { BetSelection, LiveMatchEvent, LiveMatchStatistic, LiveTopPlayer, Match } from "./types";

interface MatchResult {
  matchId: string;
  status: string;
  finished: boolean;
  cancelled: boolean;
  home: string;
  away: string;
  homeGoals: number | null;
  awayGoals: number | null;
  minute?: number | null;
  events?: LiveMatchEvent[];
  eventsComplete?: boolean;
  statistics?: LiveMatchStatistic[];
  topPlayers?: LiveTopPlayer[];
  periods?: Record<string, { home: number | null; away: number | null }>;
  source?: "highlightly" | "api-football" | "the-odds-api" | "odds-api-io";
}

const finishedStatuses = new Set(["FT", "AET", "PEN", "AWD", "WO"]);
const cancelledStatuses = new Set(["CANC", "ABD", "PST"]);
const highlightlyCancelledStatuses = new Set(["postponed", "cancelled", "abandoned"]);
const liveStatuses = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE"]);
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function externalFromMatch(match: Match) {
  if (match.external) return match.external;
  if (match.id.startsWith("api-")) return { provider: "api-football" as const, id: match.id.slice(4) };
  if (match.id.startsWith("odds-")) return { provider: "the-odds-api" as const, id: match.id.slice(5) };
  if (match.id.startsWith("oddsio-")) return { provider: "odds-api-io" as const, id: match.id.slice(7) };
  return null;
}

export async function ensurePendingMatchTracking() {
  await ensureDatabaseSchema();
  await sql`
    UPDATE tracked_matches tm SET check_interval_seconds = CASE tm.provider
      WHEN 'api-football' THEN 180
      WHEN 'odds-api-io' THEN 180
      WHEN 'the-odds-api' THEN 300
      ELSE 300
    END, updated_at = CURRENT_TIMESTAMP
    WHERE tm.enabled = TRUE AND EXISTS (
      SELECT 1 FROM bet_selections bs JOIN bets b ON b.id = bs.bet_id
      WHERE bs.match_id = tm.match_id AND b.status = 'pending' AND bs.result = 'pending'
    )
  `;
  const [{ rows }, feed] = await Promise.all([
    sql`
      SELECT DISTINCT bs.match_id
      FROM bet_selections bs
      JOIN bets b ON b.id = bs.bet_id
      LEFT JOIN tracked_matches tm ON tm.match_id = bs.match_id
      WHERE b.status = 'pending' AND bs.result = 'pending' AND tm.match_id IS NULL
    `,
    getCombinedFeed(),
  ]);
  const feedById = new Map(feed.matches.map((match) => [match.id, match]));
  const orphanOddsIds: string[] = [];
  let registered = 0;
  for (const row of rows) {
    const matchId = String(row.match_id);
    const match = feedById.get(matchId);
    let external = match ? externalFromMatch(match) : null;
    if (!external && matchId.startsWith("api-")) external = { provider: "api-football" as const, id: matchId.slice(4) };
    if (!external && matchId.startsWith("oddsio-")) external = { provider: "odds-api-io" as const, id: matchId.slice(7) };
    if (!external && matchId.startsWith("odds-")) {
      orphanOddsIds.push(matchId.slice(5));
      continue;
    }
    if (!external) continue;
    const trackingInterval = providerTrackingInterval(external.provider);
    await sql`
      INSERT INTO tracked_matches (match_id, provider, external_id, sport_key, enabled, check_interval_seconds, last_status)
      VALUES (${matchId}, ${external.provider}, ${external.id}, ${external.sportKey ?? null}, TRUE, ${trackingInterval}, ${match?.status ?? null})
      ON CONFLICT (match_id) DO NOTHING
    `;
    registered += 1;
  }
  return { registered, orphanOddsIds };
}

export async function setMatchTracking(matchId: string, enabled: boolean, intervalSeconds = 60) {
  await ensureDatabaseSchema();
  const { matches } = await getCombinedFeed();
  const match = matches.find((item) => item.id === matchId);
  if (!match) throw new Error("Jogo não encontrado no feed");
  const external = externalFromMatch(match);
  if (!external) throw new Error("Este jogo não possui identificador do provedor");
  const interval = Math.min(3600, Math.max(60, Math.round(intervalSeconds)));
  await sql`
    INSERT INTO tracked_matches (match_id, provider, external_id, sport_key, enabled, check_interval_seconds, last_status)
    VALUES (${match.id}, ${external.provider}, ${external.id}, ${external.sportKey ?? null}, ${enabled}, ${interval}, ${match.status})
    ON CONFLICT (match_id) DO UPDATE SET
      provider = EXCLUDED.provider,
      external_id = EXCLUDED.external_id,
      sport_key = EXCLUDED.sport_key,
      enabled = EXCLUDED.enabled,
      check_interval_seconds = EXCLUDED.check_interval_seconds,
      updated_at = CURRENT_TIMESTAMP
  `;
  return { ...match, tracking: { enabled } };
}

export async function listTrackedMatches() {
  await ensureDatabaseSchema();
  const { rows } = await sql`SELECT * FROM tracked_matches ORDER BY enabled DESC, updated_at DESC`;
  return rows.map((row) => ({
    matchId: row.match_id,
    provider: row.provider,
    externalId: row.external_id,
    sportKey: row.sport_key,
    enabled: row.enabled,
    intervalSeconds: row.check_interval_seconds,
    lastStatus: row.last_status,
    score: row.last_score_home == null ? null : [row.last_score_home, row.last_score_away],
    lastCheckedAt: row.last_checked_at ? new Date(row.last_checked_at).toISOString() : null,
  }));
}

function parseLine(label: string) {
  const result = label.replace(",", ".").match(/([+-]?\d+(?:\.\d+)?)\s*$/);
  return result ? Number(result[1]) : null;
}

function matchStatistic(result: MatchResult, pattern: RegExp) {
  return result.statistics?.find((item) => pattern.test(normalize(item.name))) ?? null;
}

function samePlayer(left: string, right: string) {
  const tokens = (value: string) => normalize(value).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const a = tokens(left);
  const b = tokens(right);
  if (!a.length || !b.length || a.at(-1) !== b.at(-1)) return false;
  if (a.length === 1 || b.length === 1) return true;
  return a[0][0] === b[0][0];
}

function selectedPlayerName(selection: BetSelection) {
  const label = selection.selectionLabel.split(/\s[—–-]\s|â€”| - /)[0] ?? selection.selectionLabel;
  return label
    .replace(/\([^)]*(?:\d|score|assist|goal|gol|shot|chute|target|alvo|over|under|mais|menos)[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function validGoalEvent(event: LiveMatchEvent) {
  return /goal|gol|penalty|penalti/i.test(event.type) && !/missed|cancelled|canceled|disallowed|own goal|contra/i.test(event.type);
}

function playerGoalCount(player: string, result: MatchResult) {
  if (!player) return null;
  return (result.events ?? []).filter((event) => validGoalEvent(event) && samePlayer(player, event.player ?? "")).length;
}

function playerAssistCount(player: string, result: MatchResult) {
  if (!player) return null;
  return (result.events ?? []).filter((event) => validGoalEvent(event) && samePlayer(player, event.assist ?? "")).length;
}

function numberValue(value: unknown) {
  const number = typeof value === "string" ? Number(value.replace("%", "").replace(",", ".")) : Number(value);
  return Number.isFinite(number) ? number : null;
}

function playerStatistic(selection: BetSelection, result: MatchResult, pattern: RegExp) {
  const player = selectedPlayerName(selection);
  const topPlayer = result.topPlayers?.find((item) => samePlayer(player, item.name));
  const stat = topPlayer?.statistics?.find((item) => pattern.test(normalize(item.name)));
  return numberValue(stat?.value);
}

function playerLine(label: string, fallback = 0.5) {
  return parseLine(label) ?? fallback;
}

function compareOverUnder(label: string, current: number, line: number, final = false): "green" | "red" | "void" | null {
  if (label.includes("mais de") || label.includes("over")) return current > line ? "green" : final ? "red" : null;
  if (label.includes("menos de") || label.includes("under")) return current > line ? "red" : final ? current === line ? "void" : "green" : null;
  if (label === "sim" || label.includes(" yes")) return current > 0 ? "green" : final ? "red" : null;
  if (label === "nao" || label === "não" || label.includes(" no")) return current > 0 ? "red" : final ? "green" : null;
  return current > line ? "green" : final ? "red" : null;
}

function playerPropValue(selection: BetSelection, result: MatchResult) {
  const market = normalize(selection.marketName);
  const player = selectedPlayerName(selection);
  if (!player) return null;
  if (market.includes("score or assist") || market.includes("marca ou assiste") || market.includes("gol ou assist") || (market.includes("score") && market.includes("assist"))) {
    const goals = playerGoalCount(player, result);
    const assists = playerAssistCount(player, result);
    return goals == null || assists == null ? null : goals + assists;
  }
  if (market.includes("jogador marca") || market.includes("goalscorer") || market.includes("gols do jogador") || market.includes("player goals")) {
    return playerGoalCount(player, result);
  }
  if (market.includes("assist")) return playerAssistCount(player, result) ?? playerStatistic(selection, result, /assist/);
  if (market.includes("alvo") || market.includes("on target")) return playerStatistic(selection, result, /shots? on target|finaliza.*alvo|chutes? no alvo/);
  if (market.includes("finaliza") || market.includes("shot")) return playerStatistic(selection, result, /total shots?|shots(?!.*target)|finaliza|chutes?/);
  if (market.includes("passe") || market.includes("pass")) return playerStatistic(selection, result, /pass/);
  if (market.includes("desarme") || market.includes("tackle")) return playerStatistic(selection, result, /tackle|desarme/);
  return null;
}

function isPlayerMarket(market: string) {
  return /jogador|player|goalscorer|scorer|finaliza|shot|assist|passe|pass|desarme|tackle/.test(market);
}

function evaluatePlayerSelection(selection: BetSelection, result: MatchResult, final: boolean): "green" | "red" | "void" | null {
  const market = normalize(selection.marketName);
  if (!isPlayerMarket(market)) return null;
  const label = normalize(selection.selectionLabel);
  const current = playerPropValue(selection, result);
  if (current == null) return null;
  return compareOverUnder(label, current, playerLine(label), final);
}

function isMatchWinnerMarket(market: string) {
  return (market.includes("resultado da partida") || market === "match winner" || market === "h2h" || market.includes("h2h")) && !market.includes("tempo") && !market.includes("half");
}

function firstHalfGoals(result: MatchResult) {
  const period = Object.entries(result.periods ?? {}).find(([key]) => /^(p1|ht|1h|firsthalf|first-half)$/i.test(key))?.[1];
  if (period?.home != null && period.away != null) return period.home + period.away;
  if (!result.events) return null;
  return result.events.filter((event) => {
    if (!/^(goal|own goal|penalty)$/i.test(event.type)) return false;
    const minute = Number(event.time.match(/^\d+/)?.[0] ?? NaN);
    return Number.isFinite(minute) && minute <= 45;
  }).length;
}

function isFirstHalfTotal(market: string) {
  return (market.includes("total") || market.includes("gols")) && (/\bht\b/.test(market) || market.includes("1 tempo") || market.includes("1º tempo") || market.includes("first half"));
}

function firstHalfClosed(result: MatchResult) {
  const status = normalize(result.status);
  const secondPeriodStarted = Object.keys(result.periods ?? {}).some((key) => /^(p2|2h|secondhalf|second-half)$/i.test(key));
  return result.finished || secondPeriodStarted || Number(result.minute ?? 0) > 45 || ["ht", "2h", "et", "bt", "p", "ft"].includes(status) || ["half time", "second half", "extra time", "penalties"].some((item) => status.includes(item));
}

function evaluateGuaranteedLiveSelection(selection: BetSelection, result: MatchResult): "green" | "red" | null {
  if (result.homeGoals == null || result.awayGoals == null) return null;
  const market = normalize(selection.marketName);
  const label = normalize(selection.selectionLabel);
  const total = result.homeGoals + result.awayGoals;
  const playerOutcome = evaluatePlayerSelection(selection, result, false);
  if (playerOutcome === "green" || playerOutcome === "red") return playerOutcome;
  if (isFirstHalfTotal(market)) {
    const goals = firstHalfGoals(result);
    const line = parseLine(label);
    if (goals == null || line == null) return null;
    if (label.includes("mais de")) return goals > line ? "green" : firstHalfClosed(result) ? "red" : null;
    if (label.includes("menos de")) return goals > line ? "red" : firstHalfClosed(result) ? "green" : null;
  }
  if ((market.includes("total de gols") || market.includes("linha de gols")) && !market.includes("tempo")) {
    const line = parseLine(label);
    if (line == null) return null;
    if (label.includes("mais de") && total > line) return "green";
    if (label.includes("menos de") && total > line) return "red";
  }
  if (market.includes("ambas marcam") && result.homeGoals > 0 && result.awayGoals > 0) {
    if (label === "sim") return "green";
    if (label === "nao") return "red";
  }
  if (market.includes("escanteio") || market.includes("corner")) {
    const corners = matchStatistic(result, /corner|escanteio/);
    const line = parseLine(label);
    if (!corners || corners.home == null || corners.away == null || line == null) return null;
    const current = corners.home + corners.away;
    if (label.includes("mais de") && current > line) return "green";
    if (label.includes("menos de") && current > line) return "red";
  }
  return null;
}

function evaluateSelection(selection: BetSelection, result: MatchResult): "green" | "red" | "void" | null {
  if (result.cancelled) return "void";
  if (!result.finished || result.homeGoals == null || result.awayGoals == null) return null;
  const market = normalize(selection.marketName);
  const label = normalize(selection.selectionLabel);
  const home = normalize(result.home);
  const away = normalize(result.away);
  const homeWon = result.homeGoals > result.awayGoals;
  const awayWon = result.awayGoals > result.homeGoals;
  const draw = result.homeGoals === result.awayGoals;
  const total = result.homeGoals + result.awayGoals;
  const playerOutcome = evaluatePlayerSelection(selection, result, true);
  if (playerOutcome) return playerOutcome;

  if (isFirstHalfTotal(market)) {
    const goals = firstHalfGoals(result);
    const line = parseLine(label);
    if (goals == null || line == null) return null;
    if (goals === line) return "void";
    if (label.includes("mais de")) return goals > line ? "green" : "red";
    if (label.includes("menos de")) return goals < line ? "green" : "red";
  }

  if (isMatchWinnerMarket(market)) {
    if (label.includes("empate")) return draw ? "green" : "red";
    if (label.includes(home)) return homeWon ? "green" : "red";
    if (label.includes(away)) return awayWon ? "green" : "red";
  }
  if (market.includes("vencedor sem empate") || market.includes("empate anula")) {
    if (draw) return "void";
    if (label.includes(home)) return homeWon ? "green" : "red";
    if (label.includes(away)) return awayWon ? "green" : "red";
  }
  if (market.includes("dupla chance")) {
    const acceptsDraw = label.includes("empate");
    const acceptsHome = label.includes(home);
    const acceptsAway = label.includes(away);
    return (draw && acceptsDraw) || (homeWon && acceptsHome) || (awayWon && acceptsAway) ? "green" : "red";
  }
  if (market.includes("ambas marcam") && !market.includes("tempo")) {
    const both = result.homeGoals > 0 && result.awayGoals > 0;
    if (label === "sim") return both ? "green" : "red";
    if (label === "nao") return !both ? "green" : "red";
  }
  if ((market.includes("total de gols") || market.includes("linha de gols")) && !market.includes("tempo")) {
    const line = parseLine(label);
    if (line == null) return null;
    if (market.includes("equipe")) {
      const teamGoals = label.includes(home) ? result.homeGoals : label.includes(away) ? result.awayGoals : null;
      if (teamGoals == null) return null;
      if (teamGoals === line) return "void";
      if (label.includes("mais de")) return teamGoals > line ? "green" : "red";
      if (label.includes("menos de")) return teamGoals < line ? "green" : "red";
    }
    if (total === line) return "void";
    if (label.includes("mais de")) return total > line ? "green" : "red";
    if (label.includes("menos de")) return total < line ? "green" : "red";
  }
  if (market.includes("handicap") && !market.includes("tempo")) {
    const line = parseLine(label);
    if (line == null) return null;
    const adjustedHome = label.includes(home) ? result.homeGoals + line : result.homeGoals;
    const adjustedAway = label.includes(away) ? result.awayGoals + line : result.awayGoals;
    if (adjustedHome === adjustedAway) return "void";
    if (label.includes(home)) return adjustedHome > adjustedAway ? "green" : "red";
    if (label.includes(away)) return adjustedAway > adjustedHome ? "green" : "red";
  }
  if (market.includes("impar/par") || market.includes("odd/even")) {
    if (label.includes("impar")) return total % 2 === 1 ? "green" : "red";
    if (label.includes("par")) return total % 2 === 0 ? "green" : "red";
  }
  if (market.includes("placar exato") || market.includes("placar final")) {
    const score = label.match(/(\d+)\D+(\d+)/);
    if (!score) return null;
    return Number(score[1]) === result.homeGoals && Number(score[2]) === result.awayGoals ? "green" : "red";
  }
  if (market.includes("escanteio") || market.includes("corner")) {
    const corners = matchStatistic(result, /corner|escanteio/);
    const line = parseLine(label);
    if (!corners || corners.home == null || corners.away == null || line == null) return null;
    const current = corners.home + corners.away;
    if (current === line) return "void";
    if (label.includes("mais de")) return current > line ? "green" : "red";
    if (label.includes("menos de")) return current < line ? "green" : "red";
  }
  return null;
}

async function persistMatchResult(result: MatchResult) {
  const existing = await sql`SELECT match_data FROM imported_matches WHERE id = ${result.matchId} LIMIT 1`;
  if (existing.rows[0]?.match_data) {
    const match = existing.rows[0].match_data as Match;
    const next: Match = {
      ...match,
      status: result.finished || result.cancelled ? "finished" : liveStatuses.has(result.status) ? "live" : match.status,
      minute: result.minute ?? match.minute,
      score: result.homeGoals == null || result.awayGoals == null ? match.score : [result.homeGoals, result.awayGoals],
    };
    await sql`UPDATE imported_matches SET status = ${next.status}, match_data = ${JSON.stringify(next)}::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = ${result.matchId}`;
  }
  await sql`
    UPDATE tracked_matches SET
      last_status = ${result.status},
      last_score_home = ${result.homeGoals},
      last_score_away = ${result.awayGoals},
      last_checked_at = CURRENT_TIMESTAMP,
      enabled = CASE WHEN ${result.finished || result.cancelled} THEN FALSE ELSE enabled END,
      updated_at = CURRENT_TIMESTAMP
    WHERE match_id = ${result.matchId}
  `;
}

async function liquidateFromResult(result: MatchResult) {
  const { rows } = await sql`
    SELECT bs.* FROM bet_selections bs
    JOIN bets b ON b.id = bs.bet_id
    WHERE bs.match_id = ${result.matchId} AND b.status = 'pending'
  `;
  let evaluated = 0;
  let manual = 0;
  for (const row of rows) {
    if (String(row.result) !== "pending") continue;
    const selection = {
      id: row.id, matchId: row.match_id, marketId: row.market_id, optionId: row.option_id,
      matchLabel: row.match_label, marketName: row.market_name, selectionLabel: row.selection_label, odd: Number(row.odd),
    } as BetSelection;
    const outcome = result.finished || result.cancelled ? evaluateSelection(selection, result) : evaluateGuaranteedLiveSelection(selection, result);
    if (outcome) {
      await sql`UPDATE bet_selections SET result = ${outcome} WHERE id = ${selection.id}`;
      evaluated += 1;
    } else if (result.finished || result.cancelled) manual += 1;
  }
  const affected = [...new Set(rows.map((row) => String(row.bet_id)))];
  let settled = 0;
  for (const betId of affected) {
    const selectionResults = await sql`SELECT result FROM bet_selections WHERE bet_id = ${betId}`;
    const statuses = selectionResults.rows.map((row) => String(row.result));
    if (statuses.includes("red")) {
      await settleBet(betId, "red");
      settled += 1;
    } else if (statuses.length > 0 && statuses.every((status) => status === "green" || status === "void")) {
      await settleBet(betId, statuses.every((status) => status === "void") ? "void" : "green");
      settled += 1;
    }
  }
  return { evaluated, settled, manual };
}

export async function updateHighlightlyLiveResults(options: string | { userId?: string; matchIds?: string[]; force?: boolean } = {}) {
  await ensureDatabaseSchema();
  const userId = typeof options === "string" ? options : options.userId;
  const matchIds = typeof options === "string" ? undefined : options.matchIds;
  const force = typeof options === "string" ? false : options.force === true;
  const snapshots = await refreshHighlightlyTrackedMatches({ userId, matchIds, force });
  let evaluated = 0;
  let settled = 0;
  let manual = 0;
  for (const snapshot of snapshots) {
    const cancelled = highlightlyCancelledStatuses.has(snapshot.statusLabel.toLowerCase());
    if (snapshot.status !== "live" && snapshot.status !== "finished" && !cancelled) continue;
    const liquidation = await liquidateFromResult({
      matchId: snapshot.matchId,
      status: snapshot.statusLabel,
      finished: snapshot.status === "finished",
      cancelled,
      home: snapshot.home,
      away: snapshot.away,
      homeGoals: snapshot.score?.[0] ?? null,
      awayGoals: snapshot.score?.[1] ?? null,
      minute: snapshot.clock,
      events: snapshot.events,
      eventsComplete: snapshot.eventsComplete,
      statistics: snapshot.statistics,
      topPlayers: snapshot.topPlayers,
      source: "highlightly",
    });
    evaluated += liquidation.evaluated;
    settled += liquidation.settled;
    manual += liquidation.manual;
  }
  return { snapshots, evaluated, settled, manual };
}

export async function userPendingMatchIds(userId: string) {
  await ensureDatabaseSchema();
  const { rows } = await sql`SELECT DISTINCT bs.match_id FROM bet_selections bs JOIN bets b ON b.id = bs.bet_id WHERE b.user_id = ${userId} AND b.status = 'pending' AND bs.result = 'pending'`;
  return rows.map((row) => String(row.match_id));
}

async function updateTrackedResultsUnlocked(options: { force?: boolean; matchIds?: string[] } = {}) {
  await ensureDatabaseSchema();
  const backfill = await ensurePendingMatchTracking();
  const tracked = await listTrackedMatches();
  const requested = options.matchIds?.length ? new Set(options.matchIds) : null;
  const due = tracked.filter((item) => item.enabled && (!requested || requested.has(item.matchId)) && (options.force || !item.lastCheckedAt || Date.now() - new Date(item.lastCheckedAt).getTime() >= item.intervalSeconds * 1000));
  const results: MatchResult[] = [];
  let requestsSpent = 0;
  const football = due.filter((item) => item.provider === "api-football");
  for (let index = 0; index < football.length; index += 20) {
    const batch = football.slice(index, index + 20);
    const response = await getApiFootballResults(batch.map((item) => Number(item.externalId)));
    requestsSpent += response.requestsSpent;
    response.results.forEach((item) => {
      const trackedMatch = batch.find((entry) => entry.externalId === String(item.fixtureId));
      if (trackedMatch) results.push({ matchId: trackedMatch.matchId, status: item.status, finished: finishedStatuses.has(item.status), cancelled: cancelledStatuses.has(item.status), home: item.home, away: item.away, homeGoals: item.homeGoals, awayGoals: item.awayGoals, minute: item.elapsed, periods: item.periods, source: "api-football" });
    });
  }
  const oddsGroups = new Map<string, typeof due>();
  due.filter((item) => item.provider === "the-odds-api" && item.sportKey).forEach((item) => oddsGroups.set(item.sportKey, [...(oddsGroups.get(item.sportKey) ?? []), item]));
  const oddsScoreCache = new Map<string, Awaited<ReturnType<typeof getOddsApiScores>>>();
  const scoresFor = async (sportKey: string) => {
    const cached = oddsScoreCache.get(sportKey);
    if (cached) return cached;
    const response = await getOddsApiScores(sportKey);
    oddsScoreCache.set(sportKey, response);
    requestsSpent += response.quota.last ?? 0;
    return response;
  };
  for (const [sportKey, items] of oddsGroups) {
    let response: Awaited<ReturnType<typeof getOddsApiScores>>;
    try {
      response = await scoresFor(sportKey);
    } catch {
      continue;
    }
    response.data.forEach((item) => {
      const trackedMatch = items.find((entry) => entry.externalId === item.id);
      if (!trackedMatch) return;
      const homeGoals = Number(item.scores?.find((score) => score.name === item.home_team)?.score ?? NaN);
      const awayGoals = Number(item.scores?.find((score) => score.name === item.away_team)?.score ?? NaN);
      results.push({ matchId: trackedMatch.matchId, status: item.completed ? "FT" : "LIVE", finished: item.completed, cancelled: false, home: item.home_team, away: item.away_team, homeGoals: Number.isFinite(homeGoals) ? homeGoals : null, awayGoals: Number.isFinite(awayGoals) ? awayGoals : null, source: "the-odds-api" });
    });
  }
  const requestedOrphans = backfill.orphanOddsIds.filter((externalId) => !requested || requested.has(`odds-${externalId}`));
  if (requestedOrphans.length) {
    const unresolved = new Set(requestedOrphans);
    for (const sportKey of getConfiguredOddsApiSportKeys()) {
      if (!unresolved.size) break;
      let response: Awaited<ReturnType<typeof getOddsApiScores>>;
      try {
        response = await scoresFor(sportKey);
      } catch {
        continue;
      }
      for (const event of response.data) {
        if (!unresolved.has(event.id)) continue;
        const homeGoals = Number(event.scores?.find((score) => score.name === event.home_team)?.score ?? NaN);
        const awayGoals = Number(event.scores?.find((score) => score.name === event.away_team)?.score ?? NaN);
        const matchId = `odds-${event.id}`;
        const trackingInterval = providerTrackingInterval("the-odds-api");
        await sql`
          INSERT INTO tracked_matches (match_id, provider, external_id, sport_key, enabled, check_interval_seconds, last_status)
          VALUES (${matchId}, 'the-odds-api', ${event.id}, ${sportKey}, TRUE, ${trackingInterval}, ${event.completed ? "FT" : "LIVE"})
          ON CONFLICT (match_id) DO UPDATE SET sport_key = EXCLUDED.sport_key, enabled = TRUE, check_interval_seconds = EXCLUDED.check_interval_seconds, updated_at = CURRENT_TIMESTAMP
        `;
        results.push({
          matchId,
          status: event.completed ? "FT" : "LIVE",
          finished: event.completed,
          cancelled: false,
          home: event.home_team,
          away: event.away_team,
          homeGoals: Number.isFinite(homeGoals) ? homeGoals : null,
          awayGoals: Number.isFinite(awayGoals) ? awayGoals : null,
          source: "the-odds-api",
        });
        unresolved.delete(event.id);
      }
    }
  }
  const oddsApiIo = due.filter((item) => item.provider === "odds-api-io");
  for (const item of oddsApiIo) {
    try {
      requestsSpent += 1;
      const response = await getOddsApiIoResult(item.externalId);
      const event = response.event;
      const status = String(event.status ?? "pending").toLowerCase();
      const finished = ["settled", "finished"].includes(status);
      const cancelled = ["cancelled", "canceled", "abandoned"].includes(status);
      results.push({
        matchId: item.matchId,
        status: finished ? "FT" : cancelled ? "CANC" : status === "live" ? "LIVE" : "NS",
        finished,
        cancelled,
        home: event.home ?? "Mandante",
        away: event.away ?? "Visitante",
        homeGoals: event.scores?.home ?? null,
        awayGoals: event.scores?.away ?? null,
        minute: event.clock?.minute ?? null,
        periods: Object.fromEntries(Object.entries(event.scores?.periods ?? {}).map(([key, period]) => [key, { home: period.home ?? null, away: period.away ?? null }])),
        source: "odds-api-io",
      });
    } catch {
      // Uma falha isolada não impede a atualização dos demais jogos rastreados.
    }
  }
  let evaluated = 0;
  let settled = 0;
  let manual = 0;
  for (const result of results) {
    await persistMatchResult(result);
    const liquidation = await liquidateFromResult(result);
    evaluated += liquidation.evaluated;
    settled += liquidation.settled;
    manual += liquidation.manual;
  }
  return { tracked: due.length + backfill.registered, updated: results.length, evaluated, settled, manual, requestsSpent };
}

export async function updateTrackedResults(options: { force?: boolean; matchIds?: string[] } = {}) {
  const locked = await withProviderRefreshLock("live-result-providers", () => updateTrackedResultsUnlocked(options));
  return locked.acquired && locked.value
    ? locked.value
    : { tracked: 0, updated: 0, evaluated: 0, settled: 0, manual: 0, requestsSpent: 0 };
}
