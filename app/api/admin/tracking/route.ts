import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { listTrackedMatches, setMatchTracking } from "@/lib/result-service";

export async function GET() {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  return NextResponse.json({ matches: await listTrackedMatches() });
}

export async function POST(request: Request) {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  const body = await request.json().catch(() => null) as { matchId?: string; enabled?: boolean; intervalSeconds?: number } | null;
  if (!body?.matchId) return NextResponse.json({ error: "Selecione um jogo" }, { status: 400 });
  try {
    return NextResponse.json({ match: await setMatchTracking(body.matchId, body.enabled !== false, Number(body.intervalSeconds ?? 300)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao configurar acompanhamento" }, { status: 400 });
  }
}
