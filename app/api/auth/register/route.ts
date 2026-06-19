import { NextResponse } from "next/server";
import { createSessionToken, registerUser, sessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: string; email?: string; password?: string };
    if (!body.name || body.name.trim().length < 2) return NextResponse.json({ error: "Informe seu nome." }, { status: 400 });
    if (!body.email || !/^\S+@\S+\.\S+$/.test(body.email)) return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
    if (!body.password || body.password.length < 8) return NextResponse.json({ error: "A senha precisa ter pelo menos 8 caracteres." }, { status: 400 });
    const user = await registerUser(body.name, body.email, body.password);
    const response = NextResponse.json({ user }, { status: 201 });
    response.cookies.set(sessionCookie.name, createSessionToken(user), sessionCookie.options);
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível criar a conta." }, { status: 400 });
  }
}
