"use client";

import { motion } from "framer-motion";
import { ArrowRight, BarChart3, Clock3, Radio, Shield } from "lucide-react";
import type { Match } from "@/lib/types";
import { useBetStore } from "@/store/useBetStore";
import { OddsButton } from "./OddsButton";
import { StatusBadge } from "./StatusBadge";

function previewPriority(name: string) {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const priorities = [
    /resultado|moneyline|vencedor|match winner|1x2/,
    /total.*gol|gol.*total|over.*under|mais.*menos/,
    /ambas.*marcam|both teams.*score|btts/,
    /dupla chance|double chance/,
    /handicap|spread/,
  ];
  const index = priorities.findIndex((pattern) => pattern.test(normalized));
  return index === -1 ? priorities.length : index;
}

export function MatchCard({ match, index = 0, onOpen }: { match: Match; index?: number; onOpen?: (match: Match) => void }) {
  const selected = useBetStore((state) => state.betSlip);
  const toggleSelection = useBetStore((state) => state.toggleSelection);
  const previewCount = 3;
  const markets = [...match.markets].sort((left, right) => previewPriority(left.name) - previewPriority(right.name)).slice(0, previewCount);
  const hiddenMarketCount = Math.max(0, match.markets.length - previewCount);
  const providerLabel = match.source === "merged" ? "Múltiplas fontes" : match.source === "the-odds-api" ? "The Odds API" : match.source === "odds-api-io" ? "Odds-API.io" : "API-Football";

  return (
    <motion.article className={`match-card ${match.status === "live" ? "match-live" : ""}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.045, 0.3) }}>
      <div className="match-topline">
        <div><span className="country-flag">{match.country.slice(0, 2).toUpperCase()}</span><strong>{match.league}</strong><span>• {match.country}</span></div>
        <div className="match-badges"><StatusBadge status={match.status} pulse={match.status === "live"} /><span className="provider-chip">{providerLabel}</span><StatusBadge status="api" /></div>
      </div>
      <div className="match-body">
        <div className="match-info">
          <div className="match-time">{match.status === "live" ? <><Radio size={14} /> {match.minute !== undefined ? `${match.minute}'` : "AO VIVO"}</> : <><Clock3 size={14} /> {match.kickoff}</>}</div>
          <div className="teams">
            <div className="team-row"><span className="team-badge">{match.homeCode.slice(0, 3)}</span><strong>{match.home}</strong>{match.score && <b>{match.score[0]}</b>}</div>
            <div className="team-row"><span className="team-badge alt">{match.awayCode.slice(0, 3)}</span><strong>{match.away}</strong>{match.score && <b>{match.score[1]}</b>}</div>
          </div>
        </div>
        <div className="market-area">
            {markets.map((market) => (
              <motion.div className="market-row" key={market.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <span className="market-name">{market.name}</span>
                <div className={`odds-grid ${market.options.length === 2 ? "odds-2" : market.options.length === 3 ? "odds-3" : "odds-many"}`}>
                  {market.options.map((option) => (
                    <OddsButton key={option.id} label={option.label} price={option.price} selected={selected.some((item) => item.id === `${match.id}:${market.id}:${option.id}`)} onClick={() => toggleSelection(match, market.id, option.id)} boosted={option.boosted} originalPrice={option.originalPrice} />
                  ))}
                </div>
              </motion.div>
            ))}
        </div>
        <div className="match-tools">
          <button className="icon-btn" aria-label="Estatísticas"><BarChart3 size={17} /></button>
          <button className="more-markets" onClick={() => onOpen?.(match)}>{hiddenMarketCount > 0 ? `Abrir +${hiddenMarketCount} mercados` : "Abrir evento"}<ArrowRight size={15} /></button>
        </div>
      </div>
      {match.status === "live" && <div className="live-progress"><span style={{ width: `${Math.min(match.minute ?? 0, 90) / 0.9}%` }} /></div>}
      <div className="match-safety"><Shield size={12} /> Odds sujeitas a atualização</div>
    </motion.article>
  );
}
