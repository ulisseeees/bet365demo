import { sql } from "@vercel/postgres";
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { ensureDatabaseSchema } from "@/lib/database";

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  await ensureDatabaseSchema();
  const id = (await context.params).id;
  const { rows } = await sql`SELECT id, email, role FROM users WHERE id = ${id} LIMIT 1`;
  const user = rows[0];
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  if (user.role === "admin" || !String(user.email).endsWith("@local.invalid")) return NextResponse.json({ error: "Exclusão permitida somente para contas técnicas locais" }, { status: 403 });
  await sql`DELETE FROM users WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
