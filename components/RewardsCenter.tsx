"use client";

import { Crown, Gift, Gem, Rocket, Sparkles, Star, Ticket, TrendingUp, WalletCards } from "lucide-react";
import { motion } from "framer-motion";
import { useBetStore } from "@/store/useBetStore";
import { brl } from "@/lib/utils";
import type { LoyaltyLevel } from "@/lib/types";

const levels: Array<{ name: LoyaltyLevel; min: number; icon: typeof Star }> = [
  { name: "Bronze", min: 0, icon: Star },
  { name: "Prata", min: 250, icon: Sparkles },
  { name: "Ouro", min: 1000, icon: Crown },
  { name: "Platina", min: 2500, icon: Rocket },
  { name: "Diamante", min: 5000, icon: Gem },
];

export function RewardsCenter() {
  const level = useBetStore((state) => state.level);
  const xp = useBetStore((state) => state.xp);
  const cashback = useBetStore((state) => state.cashback);
  const freeBet = useBetStore((state) => state.freeBet);
  const promotions = useBetStore((state) => state.promotions);
  const claimCashback = useBetStore((state) => state.claimCashback);
  const currentIndex = levels.findIndex((item) => item.name === level);
  const next = levels[currentIndex + 1];
  const currentMin = levels[currentIndex]?.min ?? 0;
  const progress = next ? Math.min(100, ((xp - currentMin) / (next.min - currentMin)) * 100) : 100;
  const accumulator = promotions.find((item) => item.type === "accumulator_boost");
  const tiers = Array.isArray(accumulator?.config.tiers) ? accumulator.config.tiers as Array<{ minOdd: number; minSelections: number; percent: number }> : [];

  return (
    <div className="rewards-page">
      <section className="rewards-hero"><div><span className="rewards-crown"><Crown size={30} /></span><span><small>ARENA CLUB</small><h1>Nível {level}</h1><p>{next ? `${next.min - xp} XP para chegar ao nível ${next.name}` : "Você alcançou o nível máximo da Arena."}</p></span></div><div className="level-progress"><span><b>{xp} XP</b><small>{next ? `${next.min} XP` : "Máximo"}</small></span><i><b style={{ width: `${progress}%` }} /></i></div></section>

      <div className="reward-balance-grid">
        <motion.section whileHover={{ y: -3 }}><span className="reward-icon cashback"><WalletCards size={23} /></span><div><small>CASHBACK DISPONÍVEL</small><strong>{brl(cashback)}</strong><p>Acumulado conforme seu nível.</p></div><button className="btn btn-primary" disabled={cashback <= 0} onClick={() => claimCashback()}>Resgatar</button></motion.section>
        <motion.section whileHover={{ y: -3 }}><span className="reward-icon freebet"><Ticket size={23} /></span><div><small>SALDO DE FREE BET</small><strong>{brl(freeBet)}</strong><p>Ative a opção no boletim para usar.</p></div><span className="reward-ready"><Gift size={14} /> Pronto para usar</span></motion.section>
      </div>

      <section className="boost-program"><div className="boost-program-title"><span><TrendingUp size={21} /></span><div><small>MÚLTIPLAS AUMENTADAS</small><h2>Boost automático de retorno</h2><p>O bônus é aplicado somente a seleções independentes e aparece no bilhete antes da confirmação.</p></div></div><div className="boost-tier-grid">{tiers.map((tier) => <div key={`${tier.minOdd}-${tier.percent}`}><strong>+{tier.percent}%</strong><span>Odd {tier.minOdd}+</span><small>{tier.minSelections}+ seleções</small></div>)}</div></section>

      <section className="level-roadmap"><div className="section-heading compact"><div><span className="eyebrow">PROGRESSÃO</span><h2>Níveis do Arena Club</h2></div></div><div>{levels.map((item, index) => { const Icon = item.icon; return <article className={`${item.name === level ? "current" : ""} ${xp >= item.min ? "unlocked" : ""}`} key={item.name}><span><Icon size={19} /></span><strong>{item.name}</strong><small>{item.min} XP</small>{item.name === level && <em>Nível atual</em>}{index > currentIndex && <em>Bloqueado</em>}</article>; })}</div></section>
    </div>
  );
}
