import { NextResponse } from "next/server";
import { claimCashback } from "@/lib/account-service";
import { currentUser } from "@/lib/session";

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada" }, { status: 401 });
  try {
    return NextResponse.json({ account: await claimCashback(user) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao resgatar cashback" }, { status: 400 });
  }
}
