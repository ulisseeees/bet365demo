"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Gift, Layers3, LoaderCircle, LockKeyhole, Sparkles, Trash2, TrendingUp, X } from "lucide-react";
import { useMemo, useState } from "react";
import { brl, formatOdd } from "@/lib/utils";
import { useBetStore } from "@/store/useBetStore";

export function BetSlip({ mobile = false, onClose }: { mobile?: boolean; onClose?: () => void }) {
  const selections = useBetStore((state) => state.betSlip);
  const stake = useBetStore((state) => state.stake);
  const balance = useBetStore((state) => state.balance);
  const freeBet = useBetStore((state) => state.freeBet);
  const useFreeBet = useBetStore((state) => state.useFreeBet);
  const promotions = useBetStore((state) => state.promotions);
  const remove = useBetStore((state) => state.removeSelection);
  const clear = useBetStore((state) => state.clearBetSlip);
  const setStake = useBetStore((state) => state.setStake);
  const setUseFreeBet = useBetStore((state) => state.setUseFreeBet);
  const placeBet = useBetStore((state) => state.placeBet);
  const [submitting, setSubmitting] = useState(false);
  const totalOdd = selections.reduce((total, selection) => total * selection.odd, 1);
  const selectionsByMatch = useMemo(() => selections.reduce<Record<string, number>>((counts, selection) => ({ ...counts, [selection.matchId]: (counts[selection.matchId] ?? 0) + 1 }), {}), [selections]);
  const boostPercent = useMemo(() => {
    const promo = promotions.find((item) => item.type === "accumulator_boost");
    const tiers = Array.isArray(promo?.config.tiers) ? promo.config.tiers as Array<{ minOdd: number; minSelections: number; percent: number }> : [];
    return tiers.reduce((best, tier) => totalOdd >= tier.minOdd && selections.length >= tier.minSelections ? Math.max(best, tier.percent) : best, 0);
  }, [promotions, selections.length, totalOdd]);
  const baseReturn = useFreeBet ? Math.max(0, stake * totalOdd - stake) : stake * totalOdd;
  const potentialReturn = baseReturn * (1 + boostPercent / 100);
  const available = useFreeBet ? freeBet : balance;

  const submit = async () => {
    setSubmitting(true);
    const success = await placeBet();
    setSubmitting(false);
    if (success) onClose?.();
  };

  return (
    <aside className={`bet-slip bet-slip-pro ${mobile ? "bet-slip-mobile" : ""}`}>
      <div className="panel-heading bet-slip-heading">
        <div><span className="panel-icon"><Layers3 size={18} /></span><span><strong>Bilhete de aposta</strong><small>{selections.length > 1 ? `Múltipla • ${selections.length} seleções` : `${selections.length} ${selections.length === 1 ? "seleção" : "seleções"}`}</small></span></div>
        <div>{selections.length > 0 && <button className="clear-btn" onClick={clear}><Trash2 size={14} /> Limpar</button>}{mobile && <button className="icon-btn slip-close" onClick={onClose} aria-label="Fechar bilhete"><X size={19} /></button>}</div>
      </div>

      <div className="bet-slip-content">
        {selections.length === 0 ? <div className="empty-slip"><div className="empty-slip-icon"><Layers3 size={29} /></div><strong>Seu bilhete está vazio</strong><span>Abra um evento e toque em uma odd para começar.</span>{mobile && <button className="btn btn-secondary" onClick={onClose}>Explorar jogos</button>}</div> : <>
          <div className="bet-slip-scroll">
            <div className="selection-list">{selections.map((selection, index) => <motion.div className="selection-card pro" key={selection.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} layout><span className="selection-index">{index + 1}</span><div><small>{selection.marketName}</small><strong>{selection.selectionLabel}</strong><span>{selection.matchLabel}</span>{selectionsByMatch[selection.matchId] > 1 && <em className="same-game-tag">{selectionsByMatch[selection.matchId]} seleções neste jogo</em>}</div><b>{formatOdd(selection.odd)}</b><button onClick={() => remove(selection.id)} aria-label={`Remover ${selection.selectionLabel}`}><X size={15} /></button></motion.div>)}</div>

            {selections.length > 1 && <div className="smart-multiple-note"><LockKeyhole size={14} /><span><strong>Múltipla inteligente</strong>Você pode combinar mercados do mesmo jogo. Apenas seleções repetidas ou impossíveis são bloqueadas.</span></div>}

            {freeBet > 0 && <button className={`freebet-toggle ${useFreeBet ? "active" : ""}`} onClick={() => setUseFreeBet(!useFreeBet)}><span><Gift size={17} /><span><strong>Usar Free Bet</strong><small>Disponível: {brl(freeBet)}</small></span></span><i><b /></i></button>}

            <div className="stake-section"><div className="stake-label-row"><label htmlFor={mobile ? "stake-mobile" : "stake-desktop"}>Valor da aposta</label><small>Disponível: {brl(available)}</small></div><div className={`money-input ${stake > available ? "input-error" : ""}`}><span>R$</span><input id={mobile ? "stake-mobile" : "stake-desktop"} type="number" inputMode="decimal" min="0.01" step="0.01" value={stake || ""} onChange={(event) => setStake(Number(event.target.value))} /></div><div className="stake-chips">{[10, 25, 50, 100].map((value) => <button key={value} onClick={() => setStake(value)}>R$ {value}</button>)}</div></div>

            {boostPercent > 0 && <motion.div className="bet-boost-banner" initial={{ scale: .96 }} animate={{ scale: 1 }}><Sparkles size={17} /><span><strong>Boost de +{boostPercent}% ativado</strong><small>Seu retorno aumentou {brl(potentialReturn - baseReturn)}</small></span><TrendingUp size={17} /></motion.div>}
          </div>

          <div className="bet-slip-checkout">
            <div className="bet-summary"><div><span>Odd total</span><strong>{formatOdd(totalOdd)}</strong></div>{boostPercent > 0 && <div className="desktop-summary-row"><span>Retorno base</span><strong>{brl(baseReturn)}</strong></div>}<div className="return-row"><span>Retorno potencial</span><strong className="accent-text">{brl(potentialReturn)}</strong></div><div className="desktop-summary-row"><span>{useFreeBet ? "Free Bet restante" : "Saldo após aposta"}</span><strong>{brl(Math.max(available - stake, 0))}</strong></div></div>
            <motion.button whileTap={{ scale: 0.98 }} className="btn btn-primary btn-bet" onClick={submit} disabled={stake <= 0 || stake > available || submitting}>{submitting ? <LoaderCircle className="spin" size={18} /> : <CheckCircle2 size={18} />} {submitting ? "Confirmando..." : `Apostar ${brl(stake)}`}</motion.button>
            <div className="simulation-note"><LockKeyhole size={14} /><span>Odds validadas novamente antes da confirmação.</span></div>
          </div>
        </>}
      </div>
    </aside>
  );
}
