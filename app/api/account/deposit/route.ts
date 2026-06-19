import { NextResponse } from "next/server";
import { depositToAccount } from "@/lib/account-service";
import { currentUser } from "@/lib/session";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada" }, { status: 401 });
  const body = await request.json().catch(() => null) as { amount?: number } | null;
  try {
    return NextResponse.json(await depositToAccount(user, Number(body?.amount)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha no depósito" }, { status: 400 });
  }
}
