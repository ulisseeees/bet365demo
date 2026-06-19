import { NextResponse } from "next/server";
import { authenticateUser, createSessionToken, sessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string; password?: string };
    if (!body.email || !body.password) return NextResponse.json({ error: "Informe e-mail e senha." }, { status: 400 });
    const user = await authenticateUser(body.email, body.password);
    if (!user) return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
    const response = NextResponse.json({ user });
    response.cookies.set(sessionCookie.name, createSessionToken(user), sessionCookie.options);
    return response;
  } catch {
    return NextResponse.json({ error: "Não foi possível entrar agora." }, { status: 500 });
  }
}
