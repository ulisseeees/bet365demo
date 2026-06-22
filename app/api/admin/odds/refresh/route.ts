import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { getAutomaticOddsFeed } from "@/lib/the-odds-api";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  try {
    const result = await getAutomaticOddsFeed(true);
    if (result.stale && result.error) return NextResponse.json(result, { status: 502 });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao atualizar a The Odds API" }, { status: 502 });
  }
}
