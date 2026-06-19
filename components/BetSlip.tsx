"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Layers3, ShieldCheck, Trash2, X } from "lucide-react";
import { brl } from "@/lib/utils";
import { useBetStore } from "@/store/useBetStore";

export function BetSlip({ mobile = false, onClose }: { mobile?: boolean; onClose?: () => void }) {
  const selections = useBetStore((state) => state.betSlip);
  const stake = useBetStore((state) => state.stake);
  const balance = useBetStore((state) => state.balance);
  const remove = useBetStore((state) => state.removeSelection);
  const clear = useBetStore((state) => state.clearBetSlip);
  const setStake = useBetStore((state) => state.setStake);
  const placeBet = useBetStore((state) => state.placeBet);
  const totalOdd = selections.reduce((total, selection) => total * selection.odd, 1);
  const potentialReturn = stake * totalOdd;

  return (
    <aside className={`bet-slip ${mobile ? "bet-slip-mobile" : ""}`}>
      <div className="panel-heading bet-slip-heading">
        <div><span className="panel-icon"><Layers3 size={18} /></span><span><strong>Boletim</strong><small>{selections.length} {selections.length === 1 ? "seleção" : "seleções"}</small></span></div>
        <div>{selections.length > 0 && <button className="clear-btn" onClick={clear}><Trash2 size={14} /> Limpar</button>}{mobile && <button className="icon-btn" onClick={onClose}><X size={18} /></button>}</div>
      </div>

      <div className="bet-slip-content">
        {selections.length === 0 ? (
          <div className="empty-slip">
            <div className="empty-slip-icon"><Layers3 size={29} /></div>
            <strong>Seu boletim está vazio</strong>
            <span>Clique em uma odd para adicionar sua primeira seleção.</span>
          </div>
        ) : (
          <div className="selection-list">
            {selections.map((selection, index) => (
              <motion.div className="selection-card" key={selection.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                <span className="selection-index">{index + 1}</span>
                <div><strong>{selection.selectionLabel}</strong><span>{selection.matchLabel}</span><small>{selection.marketName}</small></div>
                <b>{selection.odd.toFixed(2)}</b>
                <button onClick={() => remove(selection.id)} aria-label="Remover seleção"><X size={14} /></button>
              </motion.div>
            ))}
          </div>
        )}

        <div className="stake-section">
          <label htmlFor={mobile ? "stake-mobile" : "stake-desktop"}>Valor da aposta</label>
          <div className="money-input"><span>R$</span><input id={mobile ? "stake-mobile" : "stake-desktop"} type="number" min="1" step="1" value={stake || ""} onChange={(event) => setStake(Number(event.target.value))} /></div>
          <div className="stake-chips">{[10, 25, 50, 100].map((value) => <button key={value} onClick={() => setStake(value)}>+{value}</button>)}</div>
        </div>

        <div className="bet-summary">
          <div><span>Odd total</span><strong>{selections.length ? totalOdd.toFixed(2) : "—"}</strong></div>
          <div><span>Retorno potencial</span><strong className="accent-text">{selections.length ? brl(potentialReturn) : brl(0)}</strong></div>
          <div><span>Saldo após aposta</span><strong>{brl(Math.max(balance - stake, 0))}</strong></div>
        </div>

        <motion.button whileTap={{ scale: 0.98 }} className="btn btn-primary btn-bet" onClick={() => { if (placeBet()) onClose?.(); }} disabled={!selections.length}>
          <CheckCircle2 size={18} /> Confirmar aposta
        </motion.button>
        <div className="simulation-note"><ShieldCheck size={14} /><span>Revise suas seleções antes de confirmar.</span></div>
      </div>
    </aside>
  );
}
