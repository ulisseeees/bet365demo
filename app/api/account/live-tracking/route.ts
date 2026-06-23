import { NextResponse } from "next/server";
import { updateHighlightlyLiveResults, updateTrackedResults, userPendingMatchIds } from "@/lib/result-service";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada" }, { status: 401 });
  try {
    const matchIds = await userPendingMatchIds(user.id);
    const result = await updateHighlightlyLiveResults({ userId: user.id, matchIds });
    const providers = await updateTrackedResults({ matchIds });
    return NextResponse.json({ matches: result.snapshots, settled: result.settled + providers.settled, evaluated: result.evaluated + providers.evaluated, manual: result.manual + providers.manual, providers: { tracked: providers.tracked, updated: providers.updated, requestsSpent: providers.requestsSpent } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Acompanhamento ao vivo indisponível" }, { status: 502 });
  }
}
