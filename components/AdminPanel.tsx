"use client";

import { Activity, Database, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useBetStore } from "@/store/useBetStore";
import { StatusBadge } from "./StatusBadge";
import { AdminApiFootballImporter } from "./AdminApiFootballImporter";
import { AdminOddsImporter } from "./AdminOddsImporter";
import { AdminOddsApiIo } from "./AdminOddsApiIo";
import { AdminOperations } from "./AdminOperations";
import { AdminDatabasePanel } from "./AdminDatabasePanel";
import { AdminHighlightlyStatus } from "./AdminHighlightlyStatus";
import { AdminGrowthManager } from "./AdminGrowthManager";

export function AdminPanel() {
  const matches = useBetStore((state) => state.matches);
  const marketCount = matches.reduce((total, match) => total + match.markets.length, 0);

  return (
    <div className="admin-page">
      <div className="admin-banner"><span><ShieldCheck size={25} /></span><div><small>ÁREA RESTRITA</small><h1>Painel administrativo</h1><p>Gerencie saldo, acompanhe o feed real e liquide apostas.</p></div><StatusBadge status="approved" /></div>
      <div className="admin-grid feed-admin-grid">
        <section className="admin-card">
          <div className="admin-card-title"><span><Database size={19} /></span><div><h3>Feed combinado</h3><small>API-Football + The Odds API + Odds-API.io</small></div></div>
          <div className="admin-feed-stats">
            <div><Activity size={18} /><span><strong>{matches.length}</strong><small>eventos carregados</small></span></div>
            <div><SlidersHorizontal size={18} /><span><strong>{marketCount}</strong><small>mercados disponíveis</small></span></div>
          </div>
          <p className="admin-feed-note">A criação manual de partidas foi removida. Esta tela agora reflete exclusivamente os dados recebidos da API.</p>
        </section>
      </div>
      <AdminDatabasePanel />
      <AdminHighlightlyStatus />
      <AdminGrowthManager />
      <AdminApiFootballImporter />
      <AdminOddsImporter />
      <AdminOddsApiIo />
      <AdminOperations />
    </div>
  );
}
