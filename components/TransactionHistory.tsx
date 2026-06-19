"use client";

import { ArrowDownToLine, ArrowUpFromLine, CircleDollarSign, Filter, Gift, RotateCcw, SlidersHorizontal, Ticket, Trophy, WalletCards } from "lucide-react";
import { useState } from "react";
import type { TransactionType } from "@/lib/types";
import { brl, dateTime } from "@/lib/utils";
import { useBetStore } from "@/store/useBetStore";
import { StatusBadge } from "./StatusBadge";

const iconMap = {
  deposit: ArrowDownToLine,
  withdrawal: ArrowUpFromLine,
  bet: CircleDollarSign,
  win: Trophy,
  loss: CircleDollarSign,
  refund: RotateCcw,
  admin: SlidersHorizontal,
  cashback: Gift,
  cashout: WalletCards,
  bonus: Gift,
  freebet: Ticket,
};

export function TransactionHistory() {
  const transactions = useBetStore((state) => state.transactions);
  const [filter, setFilter] = useState<"all" | TransactionType>("all");
  const visible = filter === "all" ? transactions : transactions.filter((transaction) => transaction.type === filter);
  return (
    <section className="history-panel">
      <div className="section-heading compact"><div><span className="eyebrow">MOVIMENTAÇÕES</span><h2>Histórico financeiro</h2></div><div className="history-filter"><Filter size={15} /><select value={filter} onChange={(event) => setFilter(event.target.value as "all" | TransactionType)}><option value="all">Todos os tipos</option><option value="deposit">Depósitos</option><option value="withdrawal">Saques</option><option value="bet">Apostas</option><option value="win">Ganhos</option><option value="loss">Perdas</option></select></div></div>
      <div className="transaction-list">
        {visible.map((transaction) => {
          const Icon = iconMap[transaction.type];
          return <article className="transaction-row" key={transaction.id}><span className={`transaction-icon transaction-${transaction.type}`}><Icon size={18} /></span><div><strong>{transaction.description}</strong><span>{dateTime(transaction.createdAt)} • {transaction.id}</span></div><StatusBadge status="approved" /><b className={transaction.amount >= 0 ? "positive" : "negative"}>{transaction.amount >= 0 ? "+" : ""}{brl(transaction.amount)}</b></article>;
        })}
        {!visible.length && <div className="empty-history">Nenhuma movimentação deste tipo.</div>}
      </div>
    </section>
  );
}
