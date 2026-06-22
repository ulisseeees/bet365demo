import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { getOddsApiIoFeed } from "@/lib/odds-api-io";
import { ensurePendingMatchTracking, updateTrackedResults } from "@/lib/result-service";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  try {
    await ensurePendingMatchTracking();
    const result = await getOddsApiIoFeed(true);
    if (result.stale && result.error) return NextResponse.json(result, { status: 502 });
    const settlement = await updateTrackedResults({ force: true });
    return NextResponse.json({ ...result, settlement });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao atualizar a Odds-API.io" }, { status: 502 });
  }
}
