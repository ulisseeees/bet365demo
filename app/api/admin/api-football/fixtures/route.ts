import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { searchApiFootballFixtures } from "@/lib/api-football";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  const date = request.nextUrl.searchParams.get("date") ?? "";
  const force = request.nextUrl.searchParams.get("force") === "true";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Informe uma data válida" }, { status: 400 });
  try {
    return NextResponse.json(await searchApiFootballFixtures(date, force));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao buscar partidas" }, { status: 502 });
  }
}
