import { NextResponse } from "next/server";
import { updateHighlightlyLiveResults } from "@/lib/result-service";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada" }, { status: 401 });
  try {
    const result = await updateHighlightlyLiveResults(user.id);
    return NextResponse.json({ matches: result.snapshots, settled: result.settled, evaluated: result.evaluated, manual: result.manual });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Acompanhamento ao vivo indisponível" }, { status: 502 });
  }
}
