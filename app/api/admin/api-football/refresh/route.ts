import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { getApiFootballFeed } from "@/lib/api-football";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  const result = await getApiFootballFeed(true);
  if (!result.matches.length) return NextResponse.json({ error: result.error ?? "Nenhum jogo com odds encontrado" }, { status: 502 });
  return NextResponse.json(result);
}
