import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { listUsers } from "@/lib/account-service";

export async function GET() {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  return NextResponse.json({ users: await listUsers() });
}
