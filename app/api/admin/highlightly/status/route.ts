import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { getHighlightlyStatus } from "@/lib/highlightly";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  return NextResponse.json(await getHighlightlyStatus());
}
