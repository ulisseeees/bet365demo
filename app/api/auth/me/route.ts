import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sessionCookie, verifySessionToken } from "@/lib/auth";

export async function GET() {
  const cookieStore = await cookies();
  const user = verifySessionToken(cookieStore.get(sessionCookie.name)?.value);
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({ user });
}
