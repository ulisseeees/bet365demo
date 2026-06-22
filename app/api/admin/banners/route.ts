import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { ensureDatabaseSchema } from "@/lib/database";
import { uid } from "@/lib/utils";

export async function GET() {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  await ensureDatabaseSchema();
  const { rows } = await sql`SELECT * FROM home_banners ORDER BY sort_order, created_at`;
  return NextResponse.json({ banners: rows });
}

export async function POST(request: Request) {
  if (!await isAdminRequest()) return NextResponse.json({ error: "Acesso restrito" }, { status: 401 });
  await ensureDatabaseSchema();
  const body = await request.json().catch(() => null) as { action?: string; id?: string; kind?: string; title?: string; subtitle?: string; ctaLabel?: string; tone?: string; sortOrder?: number; active?: boolean } | null;
  try {
    if (body?.action === "delete" && body.id) {
      await sql`DELETE FROM home_banners WHERE id = ${body.id}`;
      return NextResponse.json({ ok: true });
    }
    if (body?.action === "toggle" && body.id) {
      await sql`UPDATE home_banners SET active = ${Boolean(body.active)}, updated_at = CURRENT_TIMESTAMP WHERE id = ${body.id}`;
      return NextResponse.json({ ok: true });
    }
    const title = body?.title?.trim();
    const subtitle = body?.subtitle?.trim();
    const cta = body?.ctaLabel?.trim() || "Ver oferta";
    const allowedKinds = new Set(["super_odd", "vip", "cashback", "mission", "custom"]);
    const allowedTones = new Set(["orange", "gold", "cyan", "violet", "green"]);
    const kind = allowedKinds.has(body?.kind ?? "") ? body!.kind! : "custom";
    const tone = allowedTones.has(body?.tone ?? "") ? body!.tone! : "orange";
    if (!title || !subtitle) throw new Error("Informe título e descrição do banner");
    const id = body?.id ?? uid("BANNER");
    await sql`
      INSERT INTO home_banners (id, kind, title, subtitle, cta_label, tone, sort_order, active)
      VALUES (${id}, ${kind}, ${title}, ${subtitle}, ${cta}, ${tone}, ${Math.round(Number(body?.sortOrder ?? 0))}, TRUE)
      ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, title = EXCLUDED.title, subtitle = EXCLUDED.subtitle,
        cta_label = EXCLUDED.cta_label, tone = EXCLUDED.tone, sort_order = EXCLUDED.sort_order, active = TRUE, updated_at = CURRENT_TIMESTAMP
    `;
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao salvar banner" }, { status: 400 });
  }
}
