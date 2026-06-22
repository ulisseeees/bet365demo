import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { getApiFootballFeed } from "@/lib/api-football";
import { ensurePendingMatchTracking, updateTrackedResults } from "@/lib/result-service";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  await ensurePendingMatchTracking();
  const result = await getApiFootballFeed(true);
  if (!result.matches.length) return NextResponse.json({ error: result.error ?? "Nenhum jogo com odds encontrado" }, { status: 502 });
  if (result.stale && result.error) return NextResponse.json(result, { status: 502 });
  const settlement = await updateTrackedResults({ force: true });
  return NextResponse.json({ ...result, settlement });
}
