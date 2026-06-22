"use client";

import { ArrowRight, Crown, Gift, Sparkles, Target, Trophy } from "lucide-react";
import { motion } from "framer-motion";
import type { Match } from "@/lib/types";
import { brl, formatOdd } from "@/lib/utils";
import { useBetStore } from "@/store/useBetStore";

export function HomePromotions({ matches, onOpenMatch, onOpenRewards }: { matches: Match[]; onOpenMatch: (match: Match) => void; onOpenRewards: () => void }) {
  const missions = useBetStore((state) => state.missions);
  const level = useBetStore((state) => state.level);
  const cashback = useBetStore((state) => state.cashback);
  const banners = useBetStore((state) => state.banners);
  const boosted = matches.flatMap((match) => match.markets.flatMap((market) => market.options.filter((option) => option.boosted).map((option) => ({ match, market, option })))).at(0);
  const mission = missions[0];
  const progress = mission ? Math.min(100, (mission.progress / mission.target) * 100) : 0;
  const superBanner = banners.find((banner) => banner.kind === "super_odd");
  const vipBanner = banners.find((banner) => banner.kind === "vip" || banner.kind === "cashback");
  const missionBanner = banners.find((banner) => banner.kind === "mission");
  const customBanners = banners.filter((banner) => banner.kind === "custom");

  return (
    <section className="promo-showcase" aria-label="Ofertas em destaque">
      <motion.article className={`promo-banner super-odd-promo promo-tone-${superBanner?.tone ?? "orange"}`} whileHover={{ y: -3 }}>
        <span className="promo-icon"><Sparkles size={24} /></span>
        <div><small>{superBanner?.title ?? (boosted ? "SUPER ODD ATIVA" : "MÚLTIPLA TURBO")}</small><h3>{boosted ? boosted.option.label : "Retorno turbinado"}</h3><p>{boosted ? `${boosted.match.home} × ${boosted.match.away}` : superBanner?.subtitle ?? "Monte sua múltipla e desbloqueie boosts progressivos."}</p></div>
        {boosted && <strong className="promo-price"><del>{formatOdd(boosted.option.originalPrice ?? boosted.option.price)}</del>{formatOdd(boosted.option.price)}</strong>}
        <button onClick={() => boosted ? onOpenMatch(boosted.match) : onOpenRewards()}>{superBanner?.ctaLabel ?? (boosted ? "Ver mercado" : "Ver vantagens")} <ArrowRight size={15} /></button>
      </motion.article>

      <motion.article className={`promo-banner vip-promo promo-tone-${vipBanner?.tone ?? "gold"}`} whileHover={{ y: -3 }}>
        <span className="promo-icon"><Crown size={24} /></span>
        <div><small>{vipBanner?.title ?? "ARENA CLUB"}</small><h3>Seu nível: {level}</h3><p>{vipBanner?.subtitle ?? "Cashback, Free Bets e benefícios que crescem com você."}</p></div>
        <strong className="promo-highlight">{brl(cashback)}<small>cashback</small></strong>
        <button onClick={onOpenRewards}>{vipBanner?.ctaLabel ?? "Abrir clube"} <ArrowRight size={15} /></button>
      </motion.article>

      <motion.article className={`promo-banner mission-promo promo-tone-${missionBanner?.tone ?? "cyan"}`} whileHover={{ y: -3 }}>
        <span className="promo-icon">{mission?.completed ? <Trophy size={24} /> : <Target size={24} />}</span>
        <div><small>{missionBanner?.title ?? "MISSÃO DA SEMANA"}</small><h3>{mission?.title ?? "Rota da Copa"}</h3><p>{mission?.completed ? "Missão concluída. A Free Bet já entrou na conta." : mission?.description ?? missionBanner?.subtitle ?? "Aposte na Copa e conquiste uma Free Bet."}</p></div>
        <div className="mission-mini-progress"><span><b style={{ width: `${progress}%` }} /></span><small>{mission ? `${brl(mission.progress)} de ${brl(mission.target)}` : "Carregando progresso"}</small></div>
        <button onClick={onOpenRewards}>{mission?.completed ? <Gift size={14} /> : null} {missionBanner?.ctaLabel ?? "Ver missão"} <ArrowRight size={15} /></button>
      </motion.article>
      {customBanners.map((banner) => <motion.article key={banner.id} className={`promo-banner custom-promo promo-tone-${banner.tone}`} whileHover={{ y: -3 }}>
        <span className="promo-icon"><Gift size={24} /></span>
        <div><small>OFERTA</small><h3>{banner.title}</h3><p>{banner.subtitle}</p></div>
        <button onClick={onOpenRewards}>{banner.ctaLabel} <ArrowRight size={15} /></button>
      </motion.article>)}
    </section>
  );
}
