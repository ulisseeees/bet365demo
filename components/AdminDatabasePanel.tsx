"use client";

import { Cloud, Download, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useBetStore } from "@/store/useBetStore";

interface Counts { users: number; wallets: number; bets: number; transactions: number; imported_matches: number; provider_caches: number }

export function AdminDatabasePanel() {
  const showToast = useBetStore((state) => state.showToast);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { const response = await fetch("/api/admin/database/status", { cache: "no-store" }); const payload = await response.json() as { connected?: boolean; counts?: Counts }; setConnected(Boolean(payload.connected)); setCounts(payload.counts ?? null); setLoading(false); }, []);
  useEffect(() => { let active = true; queueMicrotask(() => { if (active) load().catch(() => setLoading(false)); }); return () => { active = false; }; }, [load]);
  const migrate = async () => { setLoading(true); const response = await fetch("/api/admin/database/migrate", { method: "POST" }); const payload = await response.json() as { apiFootballMatches?: number; oddsApiMatches?: number; error?: string }; if (!response.ok) showToast("Migração falhou", payload.error ?? "Verifique a conexão.", "danger"); else showToast("Migração concluída", `${payload.apiFootballMatches ?? 0} jogos API-Football e ${payload.oddsApiMatches ?? 0} jogos Odds API salvos.`, "success"); await load(); };
  return <section className="admin-card database-center"><div className="admin-card-title"><span><Cloud size={19} /></span><div><h3>Central do banco</h3><small>Neon Postgres • persistência e backup</small></div><span className={`db-health ${connected ? "online" : "offline"}`}><i /> {loading ? "Verificando" : connected ? "Conectado" : "Indisponível"}</span></div><div className="database-counts"><div><strong>{counts?.users ?? "—"}</strong><small>usuários</small></div><div><strong>{counts?.wallets ?? "—"}</strong><small>carteiras</small></div><div><strong>{counts?.bets ?? "—"}</strong><small>apostas</small></div><div><strong>{counts?.transactions ?? "—"}</strong><small>transações</small></div><div><strong>{counts?.imported_matches ?? "—"}</strong><small>jogos importados</small></div><div><strong>{counts?.provider_caches ?? "—"}</strong><small>caches das APIs</small></div></div><div className="database-actions"><span><ShieldCheck size={14} /> Senhas nunca entram no arquivo de backup.</span><button className="btn btn-secondary" disabled={loading} onClick={migrate}>{loading ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />} Migrar caches locais</button><a className="btn btn-primary" href="/api/admin/database/export"><Download size={15} /> Exportar backup</a></div></section>;
}
