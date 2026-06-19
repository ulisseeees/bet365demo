import { NextResponse } from "next/server";
import { placeAccountBet } from "@/lib/account-service";
import { currentUser } from "@/lib/session";
import type { BetSelection } from "@/lib/types";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada" }, { status: 401 });
  const body = await request.json().catch(() => null) as { selections?: BetSelection[]; stake?: number; useFreeBet?: boolean } | null;
  try {
    const account = await placeAccountBet(user, body?.selections ?? [], Number(body?.stake), Boolean(body?.useFreeBet));
    return NextResponse.json({ account });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao registrar aposta" }, { status: 400 });
  }
}
