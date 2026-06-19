import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { getOddsApiEvents } from "@/lib/the-odds-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  const sport = request.nextUrl.searchParams.get("sport") ?? "";
  if (!/^[a-z0-9_]+$/.test(sport)) return NextResponse.json({ error: "Esporte inválido" }, { status: 400 });
  try {
    const result = await getOddsApiEvents(sport);
    return NextResponse.json({ events: result.data, quota: result.quota });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar eventos" }, { status: 502 });
  }
}
