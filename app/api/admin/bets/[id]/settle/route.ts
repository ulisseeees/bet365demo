import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { settleBet } from "@/lib/account-service";
import type { BetStatus } from "@/lib/types";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  const body = await request.json().catch(() => null) as { status?: BetStatus } | null;
  if (!body?.status || !["green", "red", "void"].includes(body.status)) return NextResponse.json({ error: "Status inválido" }, { status: 400 });
  try {
    return NextResponse.json({ result: await settleBet((await context.params).id, body.status as "green" | "red" | "void") });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao liquidar aposta" }, { status: 400 });
  }
}
