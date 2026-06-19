"use client";

import { motion } from "framer-motion";
import { Activity, CircleDollarSign, Database, FlaskConical, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useBetStore } from "@/store/useBetStore";
import { StatusBadge } from "./StatusBadge";
import { AdminApiFootballImporter } from "./AdminApiFootballImporter";
import { AdminOddsImporter } from "./AdminOddsImporter";

export function AdminPanel() {
  const balance = useBetStore((state) => state.balance);
  const setBalance = useBetStore((state) => state.setBalance);
  const matches = useBetStore((state) => state.matches);
  const bets = useBetStore((state) => state.bets);
  const settle = useBetStore((state) => state.settleBet);
  const [balanceInput, setBalanceInput] = useState(balance);
  const pending = bets.filter((bet) => bet.status === "pending");
  const marketCount = matches.reduce((total, match) => total + match.markets.length, 0);

  return (
    <div className="admin-page">
      <div className="admin-banner"><span><ShieldCheck size={25} /></span><div><small>ÁREA RESTRITA</small><h1>Painel administrativo</h1><p>Gerencie saldo, acompanhe o feed real e liquide apostas.</p></div><StatusBadge status="approved" /></div>
      <div className="admin-grid">
        <section className="admin-card">
          <div className="admin-card-title"><span><CircleDollarSign size={19} /></span><div><h3>Saldo do usuário</h3><small>Ajuste administrativo</small></div></div>
          <label className="field-label" htmlFor="admin-balance">Novo saldo</label>
          <div className="money-input large"><span>R$</span><input id="admin-balance" type="number" value={balanceInput} onChange={(event) => setBalanceInput(Number(event.target.value))} /></div>
          <button className="btn btn-primary full-width" onClick={() => setBalance(balanceInput)}>Salvar ajuste</button>
        </section>
        <section className="admin-card">
          <div className="admin-card-title"><span><Database size={19} /></span><div><h3>Feed combinado</h3><small>API-Football + The Odds API</small></div></div>
          <div className="admin-feed-stats">
            <div><Activity size={18} /><span><strong>{matches.length}</strong><small>eventos carregados</small></span></div>
            <div><SlidersHorizontal size={18} /><span><strong>{marketCount}</strong><small>mercados disponíveis</small></span></div>
          </div>
          <p className="admin-feed-note">A criação manual de partidas foi removida. Esta tela agora reflete exclusivamente os dados recebidos da API.</p>
        </section>
      </div>
      <AdminApiFootballImporter />
      <AdminOddsImporter />
      <section className="admin-card settlement-card">
        <div className="admin-card-title"><span><SlidersHorizontal size={19} /></span><div><h3>Liquidação manual de apostas</h3><small>Marque Green, Red ou anulação</small></div><span className="count-pill">{pending.length} pendentes</span></div>
        <div className="settlement-list">
          {pending.map((bet) => <motion.div layout className="settlement-row" key={bet.id}><div><strong>{bet.id}</strong><span>{bet.selections.map((item) => item.selectionLabel).join(" + ")}</span></div><b>Odd {bet.totalOdd.toFixed(2)}</b><div><button className="settle-green" onClick={() => settle(bet.id, "green")}>Green</button><button className="settle-red" onClick={() => settle(bet.id, "red")}>Red</button><button className="settle-void" onClick={() => settle(bet.id, "void")}>Anular</button></div></motion.div>)}
          {!pending.length && <div className="empty-history"><FlaskConical size={20} /> Não há apostas pendentes para liquidar.</div>}
        </div>
      </section>
    </div>
  );
}
