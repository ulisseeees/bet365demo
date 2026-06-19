import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { setUserBalance } from "@/lib/account-service";

export async function POST(request: Request) {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  const body = await request.json().catch(() => null) as { userId?: string; amount?: number } | null;
  try {
    await setUserBalance(body?.userId ?? "", Number(body?.amount));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao ajustar saldo" }, { status: 400 });
  }
}
