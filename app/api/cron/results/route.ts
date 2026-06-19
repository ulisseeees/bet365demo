import { NextResponse } from "next/server";
import { updateTrackedResults } from "@/lib/result-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, result: await updateTrackedResults() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Falha no acompanhamento" }, { status: 500 });
  }
}
