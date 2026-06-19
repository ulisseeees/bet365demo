import { NextRequest, NextResponse } from "next/server";
import { cashoutQuote, executeCashout } from "@/lib/account-service";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada" }, { status: 401 });
  try {
    return NextResponse.json({ quote: await cashoutQuote(user, (await context.params).id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cash out indisponível" }, { status: 400 });
  }
}

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada" }, { status: 401 });
  try {
    return NextResponse.json({ account: await executeCashout(user, (await context.params).id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cash out indisponível" }, { status: 400 });
  }
}
