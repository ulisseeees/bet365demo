"use client";

import { motion } from "framer-motion";
import { CalendarDays, ChevronDown, LoaderCircle, ReceiptText, WalletCards } from "lucide-react";
import { useState } from "react";
import type { BetStatus } from "@/lib/types";
import { brl, dateTime } from "@/lib/utils";
import { useBetStore } from "@/store/useBetStore";
import { StatusBadge } from "./StatusBadge";

export function BetHistory() {
  const bets = useBetStore((state) => state.bets);
  const cashOut = useBetStore((state) => state.cashOut);
  const [filter, setFilter] = useState<"all" | BetStatus>("all");
  const [expanded, setExpanded] = useState<string | null>(bets[0]?.id ?? null);
  const [quotes, setQuotes] = useState<Record<string, number>>({});
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
              <span className="bet-metrics"><small>Stake <b>{brl(bet.stake)}</b></small><small>Odd <b>{bet.totalOdd.toFixed(2)}</b></small><small>Retorno <b>{brl(bet.potentialReturn)}</b></small></span>
              <StatusBadge status={bet.status} pulse={bet.status === "pending"} />
              <ChevronDown size={17} className={expanded === bet.id ? "rotate" : ""} />
            </button>
            {expanded === bet.id && <motion.div className="bet-selections-detail" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>{bet.selections.map((selection) => <div key={selection.id}><span><strong>{selection.selectionLabel}</strong><small>{selection.matchLabel} • {selection.marketName}</small></span><b>{selection.currentOdd && selection.currentOdd !== selection.odd ? <><del>{selection.odd.toFixed(2)}</del> {selection.currentOdd.toFixed(2)}</> : selection.odd.toFixed(2)}</b></div>)}{bet.status === "pending" && <div className="cashout-row"><span><WalletCards size={18} /><span><strong>Cash out dinâmico</strong><small>{quotes[bet.id] ? `Oferta válida por alguns segundos: ${brl(quotes[bet.id])}` : "Calculado pelas odds atuais e andamento dos jogos."}</small></span></span>{quotes[bet.id] ? <button className="btn btn-primary" disabled={loadingCashout === bet.id} onClick={async () => { setLoadingCashout(bet.id); await cashOut(bet.id); setLoadingCashout(null); }}>{loadingCashout === bet.id ? <LoaderCircle className="spin" size={15} /> : <WalletCards size={15} />} Aceitar {brl(quotes[bet.id])}</button> : <button className="btn btn-secondary" disabled={loadingCashout === bet.id} onClick={async () => { setLoadingCashout(bet.id); const response = await fetch(`/api/account/bets/${encodeURIComponent(bet.id)}/cashout`, { cache: "no-store" }); const payload = await response.json() as { quote?: { value: number } }; if (payload.quote) setQuotes((current) => ({ ...current, [bet.id]: payload.quote!.value })); setLoadingCashout(null); }}>{loadingCashout === bet.id ? <LoaderCircle className="spin" size={15} /> : <WalletCards size={15} />} Calcular oferta</button>}</div>}</motion.div>}
          </motion.article>
        ))}
        {!visible.length && <div className="empty-history">Nenhuma aposta encontrada.</div>}
      </div>
    </section>
  );
}
