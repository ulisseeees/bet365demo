import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { ensureDatabaseSchema } from "@/lib/database";
import { uid } from "@/lib/utils";

export async function GET() {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  await ensureDatabaseSchema();
  const { rows } = await sql`SELECT * FROM missions ORDER BY created_at DESC`;
  return NextResponse.json({ missions: rows });
}

export async function POST(request: Request) {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  await ensureDatabaseSchema();
  const body = await request.json().catch(() => null) as { action?: string; id?: string; title?: string; description?: string; target?: number; reward?: number; minOdd?: number; competitionTerms?: string; active?: boolean; endsAt?: string | null } | null;
  try {
    if (body?.action === "delete" && body.id) {
      await sql`DELETE FROM missions WHERE id = ${body.id}`;
      return NextResponse.json({ ok: true });
    }
    if (body?.action === "toggle" && body.id) {
      await sql`UPDATE missions SET active = ${Boolean(body.active)} WHERE id = ${body.id}`;
      return NextResponse.json({ ok: true });
    }
    const title = body?.title?.trim();
    const description = body?.description?.trim();
    const target = Number(body?.target);
    const reward = Number(body?.reward);
    const minOdd = Number(body?.minOdd ?? 2);
    if (!title || !description || !Number.isFinite(target) || target <= 0 || !Number.isFinite(reward) || reward < 0 || !Number.isFinite(minOdd) || minOdd < 1.01) throw new Error("Preencha os dados da missão corretamente");
    const terms = (body?.competitionTerms ?? "world cup,copa do mundo").split(",").map((term) => term.trim()).filter(Boolean);
    const id = body?.id ?? uid("MISSION");
    await sql`
      INSERT INTO missions (id, type, title, description, target, reward, config, active, ends_at)
      VALUES (${id}, 'world_cup_stake', ${title}, ${description}, ${target}, ${reward}, ${JSON.stringify({ minOdd, competitionTerms: terms })}::jsonb, TRUE, ${body?.endsAt || null})
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, target = EXCLUDED.target,
        reward = EXCLUDED.reward, config = EXCLUDED.config, ends_at = EXCLUDED.ends_at, active = TRUE
    `;
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao salvar missão" }, { status: 400 });
  }
}
