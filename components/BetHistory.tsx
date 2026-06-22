"use client";

import { motion } from "framer-motion";
import { CalendarDays, ChevronDown, LoaderCircle, ReceiptText, WalletCards } from "lucide-react";
import { useState } from "react";
import type { BetStatus } from "@/lib/types";
import { brl, dateTime, formatOdd } from "@/lib/utils";
import { useBetStore } from "@/store/useBetStore";
import { LiveMatchCenter } from "./LiveMatchCenter";
import { StatusBadge } from "./StatusBadge";

export function BetHistory() {
  const bets = useBetStore((state) => state.bets);
  const liveTracking = useBetStore((state) => state.liveTracking);
  const cashOut = useBetStore((state) => state.cashOut);
  const [filter, setFilter] = useState<"all" | BetStatus>("all");
  const [expanded, setExpanded] = useState<string | null>(bets[0]?.id ?? null);
  const [loadingCashout, setLoadingCashout] = useState<string | null>(null);
  const visible = filter === "all" ? bets : bets.filter((bet) => bet.status === filter);
  return (
    <section className="history-panel">
      <div className="section-heading compact"><div><span className="eyebrow">SEUS PALPITES</span><h2>Histórico de apostas</h2></div><div className="filter-tabs">{(["all", "pending", "green", "red", "void", "cashout"] as const).map((status) => <button key={status} className={filter === status ? "active" : ""} onClick={() => setFilter(status)}>{status === "all" ? "Todas" : status === "pending" ? "Pendentes" : status === "void" ? "Anuladas" : status === "cashout" ? "Cash out" : status}</button>)}</div></div>
      <div className="bet-history-list">
        {visible.map((bet) => (
          <motion.article layout className={`bet-history-card bet-${bet.status}`} key={bet.id}>
            <button className="bet-history-summary" onClick={() => setExpanded(expanded === bet.id ? null : bet.id)}>
              <span className="bet-receipt-icon"><ReceiptText size={19} /></span>
              <span><strong>{bet.selections.length > 1 ? `Múltipla com ${bet.selections.length} seleções` : bet.selections[0]?.matchLabel}</strong><small><CalendarDays size={13} /> {dateTime(bet.placedAt)} • {bet.id}</small></span>
              <span className="bet-metrics"><small>Stake <b>{brl(bet.stake)}</b></small><small>Odd <b>{formatOdd(bet.totalOdd)}</b></small><small>Retorno <b>{brl(bet.potentialReturn)}</b></small></span>
              <StatusBadge status={bet.status} pulse={bet.status === "pending"} />
              <ChevronDown size={17} className={expanded === bet.id ? "rotate" : ""} />
            </button>
            {expanded === bet.id && <motion.div className="bet-selections-detail" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
              {bet.selections.map((selection) => <div key={selection.id}><span><strong>{selection.selectionLabel}</strong><small>{selection.matchLabel} • {selection.marketName}</small></span><b>{selection.currentOdd && selection.currentOdd !== selection.odd ? <><del>{formatOdd(selection.odd)}</del> {formatOdd(selection.currentOdd)}</> : formatOdd(selection.odd)}</b></div>)}
              {bet.status === "pending" && [...new Set(bet.selections.map((selection) => selection.matchId))].map((matchId) => liveTracking[matchId] ? <LiveMatchCenter key={matchId} snapshot={liveTracking[matchId]} /> : null)}
              {bet.status === "pending" && <div className="cashout-row"><span><WalletCards size={18} /><span><strong>Cash out ao vivo</strong><small>A oferta acompanha placar, relógio, eventos e as odds disponíveis.</small></span></span><button className="btn btn-primary" disabled={loadingCashout === bet.id} onClick={async () => { setLoadingCashout(bet.id); await cashOut(bet.id); setLoadingCashout(null); }}>{loadingCashout === bet.id ? <LoaderCircle className="spin" size={15} /> : <WalletCards size={15} />} Fazer cash out</button></div>}
            </motion.div>}
          </motion.article>
        ))}
        {!visible.length && <div className="empty-history">Nenhuma aposta encontrada.</div>}
      </div>
    </section>
  );
}
