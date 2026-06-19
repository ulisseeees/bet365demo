import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sessionCookie, verifySessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const user = verifySessionToken(cookieStore.get(sessionCookie.name)?.value);

  if (!user) {
    return NextResponse.json({ configured: false, error: "Não autenticado" }, { status: 401 });
  }

  return NextResponse.json({
    configured: Boolean(process.env.API_FOOTBALL_KEY),
    sport: "football",
    widgetVersion: "3.1.0",
    cacheSeconds: 60,
  });
}
