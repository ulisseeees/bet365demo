"use client";

import { ArrowDownToLine, ArrowUpFromLine, CircleDollarSign, Gift, History, ShieldCheck, TrendingDown, TrendingUp, WalletCards } from "lucide-react";
import { motion } from "framer-motion";
import { useBetStore } from "@/store/useBetStore";
import { brl } from "@/lib/utils";
import { BalanceCounter } from "./BalanceCounter";
import { StatusBadge } from "./StatusBadge";

interface WalletCardProps {
  onDeposit: () => void;
  onWithdraw: () => void;
  onHistory: () => void;
  expanded?: boolean;
}

export function WalletCard({ onDeposit, onWithdraw, onHistory, expanded = false }: WalletCardProps) {
  const balance = useBetStore((state) => state.balance);
  const bonus = useBetStore((state) => state.bonus);
  const cashback = useBetStore((state) => state.cashback);
  const freeBet = useBetStore((state) => state.freeBet);
  const level = useBetStore((state) => state.level);
  const bets = useBetStore((state) => state.bets);
  const totalStaked = bets.reduce((sum, bet) => sum + bet.stake, 0);
  const totalWon = bets.filter((bet) => bet.status === "green").reduce((sum, bet) => sum + bet.potentialReturn, 0);
  const totalLost = bets.filter((bet) => bet.status === "red").reduce((sum, bet) => sum + bet.stake, 0);

  return (
    <motion.section className={`wallet-card ${expanded ? "wallet-card-expanded" : ""}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
      <div className="wallet-head">
        <div><span className="wallet-icon"><WalletCards size={24} /></span><span><small>Saldo disponível</small><strong><BalanceCounter value={balance} /></strong></span></div>
        <StatusBadge status="approved" />
      </div>
      <div className="bonus-row"><span><Gift size={15} /> Bônus • {level}</span><strong>{brl(bonus)}</strong></div>
      <div className="wallet-reward-row"><span>Cashback <b>{brl(cashback)}</b></span><span>Free Bet <b>{brl(freeBet)}</b></span></div>
      <div className="wallet-stats">
        <div><span className="stat-icon violet"><CircleDollarSign size={17} /></span><span>Total apostado<small>{brl(totalStaked)}</small></span></div>
        <div><span className="stat-icon green"><TrendingUp size={17} /></span><span>Total ganho<small>{brl(totalWon)}</small></span></div>
        <div><span className="stat-icon red"><TrendingDown size={17} /></span><span>Total perdido<small>{brl(totalLost)}</small></span></div>
      </div>
      <div className="wallet-actions">
        <button className="btn btn-primary" onClick={onDeposit}><ArrowDownToLine size={17} /> Depositar</button>
        <button className="btn btn-secondary" onClick={onWithdraw}><ArrowUpFromLine size={17} /> Sacar</button>
        <button className="btn btn-ghost" onClick={onHistory}><History size={17} /> Histórico</button>
      </div>
      <p className="wallet-disclaimer"><ShieldCheck size={14} /> Operações protegidas no ambiente local sandbox.</p>
    </motion.section>
  );
}
