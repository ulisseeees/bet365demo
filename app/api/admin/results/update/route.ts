import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { updateTrackedResults } from "@/lib/result-service";

export async function POST(request: Request) {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  const body = await request.json().catch(() => null) as { matchIds?: string[]; force?: boolean } | null;
  try {
    return NextResponse.json({ result: await updateTrackedResults({ matchIds: body?.matchIds?.slice(0, 30), force: body?.force !== false }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao atualizar resultados" }, { status: 502 });
  }
}
