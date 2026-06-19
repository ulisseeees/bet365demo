import { NextResponse } from "next/server";
import { importLegacyAccount } from "@/lib/account-service";
import { currentUser } from "@/lib/session";
import type { AccountSnapshot } from "@/lib/types";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada" }, { status: 401 });
  const body = await request.json().catch(() => null) as Partial<AccountSnapshot> | null;
  try {
    return NextResponse.json({ account: await importLegacyAccount(user, body ?? {}) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao importar dados locais" }, { status: 400 });
  }
}
