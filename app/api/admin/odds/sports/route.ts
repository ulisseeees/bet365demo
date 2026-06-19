import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { getOddsApiSports } from "@/lib/the-odds-api";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  try {
    const result = await getOddsApiSports();
    const supportedGroups = new Set(["Soccer", "Basketball", "Tennis", "Mixed Martial Arts"]);
    const sports = result.data.filter((sport) => sport.active && supportedGroups.has(sport.group)).sort((left, right) => left.title.localeCompare(right.title));
    return NextResponse.json({ sports, quota: result.quota });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar esportes" }, { status: 502 });
  }
}
