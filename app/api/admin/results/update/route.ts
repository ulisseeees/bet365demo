import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { updateHighlightlyLiveResults, updateTrackedResults } from "@/lib/result-service";

export async function POST(request: Request) {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  const body = await request.json().catch(() => null) as { matchIds?: string[]; force?: boolean } | null;
  try {
    const matchIds = body?.matchIds?.slice(0, 30);
    const force = body?.force !== false;
    const [highlightly, providers] = await Promise.all([
      updateHighlightlyLiveResults({ matchIds, force }),
      updateTrackedResults({ matchIds, force }),
    ]);
    return NextResponse.json({
      result: {
        tracked: providers.tracked + highlightly.snapshots.length,
        updated: providers.updated + highlightly.snapshots.filter((snapshot) => snapshot.lastUpdatedAt).length,
        evaluated: providers.evaluated + highlightly.evaluated,
        settled: providers.settled + highlightly.settled,
        manual: providers.manual + highlightly.manual,
        requestsSpent: providers.requestsSpent,
      },
      highlightly: { tracked: highlightly.snapshots.length, evaluated: highlightly.evaluated, settled: highlightly.settled, manual: highlightly.manual },
      providers,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao atualizar resultados" }, { status: 502 });
  }
}
