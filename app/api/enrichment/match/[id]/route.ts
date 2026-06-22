import { NextResponse } from "next/server";
import { getCombinedFeed } from "@/lib/feed";
import { currentUser } from "@/lib/session";
import { getMatchEnrichment } from "@/lib/thesportsdb";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada" }, { status: 401 });
  try {
    const id = (await context.params).id;
    const { matches } = await getCombinedFeed();
    const match = matches.find((item) => item.id === id);
    if (!match) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 });
    const result = await getMatchEnrichment(match);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400" } });
  } catch (error) {
    return NextResponse.json({ enrichment: null, error: error instanceof Error ? error.message : "Enriquecimento indisponível" }, { status: 502 });
  }
}
