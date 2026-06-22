"use client";

import { Activity, Radio, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import { useEffect, useState } from "react";

interface Status {
  configured: boolean;
  tracked: number;
  resolved: number;
  live: number;
  quota: { remaining: number | null; limit: number | null };
  liveCacheSeconds: number;
}

export function AdminHighlightlyStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => fetch("/api/admin/highlightly/status", { cache: "no-store" }).then((response) => response.json()).then((payload) => { if (active) setStatus(payload as Status); }).catch(() => undefined);
    load();
    const interval = window.setInterval(load, 30000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);
  return <section className="admin-card highlightly-admin-card"><div className="admin-card-title"><span><Radio size={19} /></span><div><h3>Acompanhamento ao vivo</h3><small>Highlightly • somente partidas apostadas</small></div><span className="quota-pill"><Zap size={12} /> {status?.quota.remaining ?? "—"} / {status?.quota.limit ?? "—"}</span></div><div className="admin-feed-stats"><div><Activity size={18} /><span><strong>{status?.tracked ?? 0}</strong><small>jogos com aposta pendente</small></span></div><div><ShieldCheck size={18} /><span><strong>{status?.resolved ?? 0}</strong><small>IDs sincronizados</small></span></div><div><Radio size={18} /><span><strong>{status?.live ?? 0}</strong><small>partidas ao vivo</small></span></div><div><RefreshCw size={18} /><span><strong>{status ? `${status.liveCacheSeconds}s` : "—"}</strong><small>cache mínimo por jogo</small></span></div></div>{status && !status.configured && <div className="api-quota-warning">HIGHLIGHTLY_API_KEY não está configurada neste ambiente.</div>}<p className="admin-feed-note">Sem apostas pendentes, nenhuma chamada é realizada. Com várias partidas simultâneas, o intervalo aumenta automaticamente para proteger a cota diária.</p></section>;
}
