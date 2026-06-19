import { NextResponse } from "next/server";
import { getAccountSnapshot } from "@/lib/account-service";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada" }, { status: 401 });
  try {
    return NextResponse.json({ account: await getAccountSnapshot(user) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao carregar a conta" }, { status: 500 });
  }
}
