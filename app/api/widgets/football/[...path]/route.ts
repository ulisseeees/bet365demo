import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { sessionCookie, verifySessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

const API_BASE_URL = "https://v3.football.api-sports.io/";
const CACHE_TTL_MS = 60_000;
const DEFAULT_WIDGET_TOKEN = "arenaodds-local-widget";

const allowedEndpoints = new Set([
  "coachs",
  "coaches",
  "countries",
  "fixtures",
  "fixtures/events",
  "fixtures/headtohead",
  "fixtures/lineups",
  "fixtures/players",
  "fixtures/statistics",
  "injuries",
  "leagues",
  "players",
  "players/profiles",
  "players/squads",
  "players/teams",
  "sidelined",
  "standings",
  "teams",
  "teams/statistics",
  "timezone",
  "transfers",
  "trophies",
  "venues",
]);

interface CachedResponse {
  body: string;
  expiresAt: number;
  status: number;
}

const globalWidgetCache = globalThis as typeof globalThis & {
  arenaOddsWidgetCache?: Map<string, CachedResponse>;
};

const widgetCache = globalWidgetCache.arenaOddsWidgetCache ?? new Map<string, CachedResponse>();
globalWidgetCache.arenaOddsWidgetCache = widgetCache;

function jsonHeaders(cached = false) {
  return {
    "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=120",
    "Content-Type": "application/json; charset=utf-8",
    "X-ArenaOdds-Cache": cached ? "HIT" : "MISS",
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const cookieStore = await cookies();
  const user = verifySessionToken(cookieStore.get(sessionCookie.name)?.value);
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const suppliedToken = request.headers.get("x-apisports-key");
  const expectedToken = process.env.NEXT_PUBLIC_WIDGET_PROXY_TOKEN || DEFAULT_WIDGET_TOKEN;
  if (suppliedToken !== expectedToken) {
    return NextResponse.json({ error: "Token do widget inválido" }, { status: 401 });
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    return NextResponse.json({ error: "Origem não autorizada" }, { status: 403 });
  }

  const { path } = await context.params;
  const endpoint = path.join("/");
  if (!allowedEndpoints.has(endpoint)) {
    return NextResponse.json({ error: "Endpoint não permitido para o widget" }, { status: 404 });
  }

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        get: endpoint,
        parameters: Object.fromEntries(request.nextUrl.searchParams),
        errors: { token: "API_FOOTBALL_KEY não configurada no servidor" },
        results: 0,
        paging: { current: 1, total: 1 },
        response: [],
      },
      { status: 503 },
    );
  }

  const upstreamUrl = new URL(endpoint, API_BASE_URL);
  request.nextUrl.searchParams.forEach((value, key) => upstreamUrl.searchParams.append(key, value));
  const cacheKey = upstreamUrl.toString();
  const cached = widgetCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return new NextResponse(cached.body, { status: cached.status, headers: jsonHeaders(true) });
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      cache: "no-store",
      headers: { Accept: "application/json", "x-apisports-key": apiKey },
      signal: AbortSignal.timeout(12_000),
    });
    const body = await upstream.text();

    if (upstream.ok) {
      widgetCache.set(cacheKey, { body, status: upstream.status, expiresAt: Date.now() + CACHE_TTL_MS });
    }

    return new NextResponse(body, { status: upstream.status, headers: jsonHeaders(false) });
  } catch {
    return NextResponse.json({ error: "Falha ao consultar a API-Football" }, { status: 502 });
  }
}
