"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, FlaskConical, LoaderCircle, ShieldAlert, WalletCards, X } from "lucide-react";
import { useState } from "react";
import type { ReceiptData } from "@/lib/types";
import { useBetStore } from "@/store/useBetStore";
import { BalanceCounter } from "./BalanceCounter";
import { TransactionReceipt } from "./TransactionReceipt";

type Stage = "form" | "processing" | "success";

export function WithdrawModal({ onClose }: { onClose: () => void }) {
  const balance = useBetStore((state) => state.balance);
  const withdraw = useBetStore((state) => state.withdraw);
  const [amount, setAmount] = useState(100);
  const [pixKey, setPixKey] = useState("usuario@exemplo.com");
  const [stage, setStage] = useState<Stage>("form");
  const [timeline, setTimeline] = useState(0);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const process = () => {
    if (amount <= 0 || amount > balance || !pixKey.trim()) return;
    setStage("processing");
    setTimeline(1);
    window.setTimeout(() => setTimeline(2), 650);
    window.setTimeout(async () => {
      setTimeline(3);
      const next = await withdraw(amount, pixKey);
      if (next) { setReceipt(next); window.setTimeout(() => setStage("success"), 500); }
      else setStage("form");
    }, 1350);
  };

  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.currentTarget === event.target && stage !== "processing") onClose(); }}>
      <motion.div className="modal-shell" initial={{ opacity: 0, y: 28, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.97 }}>
        {stage !== "success" && <div className="modal-header"><div><span className="modal-icon withdraw"><WalletCards size={20} /></span><span><small>CARTEIRA</small><h2>Sacar</h2></span></div><button className="icon-btn" onClick={onClose} disabled={stage === "processing"}><X size={19} /></button></div>}
        <AnimatePresence mode="wait">
          {stage === "form" && (
            <motion.div key="form" className="modal-content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="demo-alert warning"><ShieldAlert size={17} /><span><strong>Importante</strong>Operação processada somente no sandbox local.</span></div>
              <div className="available-balance"><span>Saldo disponível</span><strong><BalanceCounter value={balance} /></strong></div>
              <label className="field-label" htmlFor="withdraw-value">Valor do saque</label>
              <div className={`money-input large ${amount > balance ? "input-error" : ""}`}><span>R$</span><input id="withdraw-value" type="number" min="1" value={amount || ""} onChange={(event) => setAmount(Number(event.target.value))} /></div>
              {amount > balance && <small className="error-copy">O valor supera o saldo disponível.</small>}
              <label className="field-label" htmlFor="pix-key">Chave Pix</label>
              <input className="text-input" id="pix-key" value={pixKey} onChange={(event) => setPixKey(event.target.value)} placeholder="E-mail, CPF, telefone ou chave aleatória" />
              <p className="field-hint"><FlaskConical size={13} /> A chave permanece somente neste ambiente local.</p>
              <button className="btn btn-primary full-width modal-main-button" disabled={amount <= 0 || amount > balance || !pixKey.trim()} onClick={process}>Solicitar saque</button>
            </motion.div>
          )}
          {stage === "processing" && (
            <motion.div key="processing" className="withdraw-processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="processing-orbit"><LoaderCircle size={36} /></div>
              <h3>Processando solicitação</h3>
              <div className="process-timeline">
                {["Solicitação recebida", "Analisando saldo", "Saque aprovado"].map((label, index) => <div className={timeline >= index + 1 ? "done" : ""} key={label}><span>{timeline >= index + 1 ? <Check size={14} /> : index + 1}</span><strong>{label}</strong></div>)}
              </div>
            </motion.div>
          )}
          {stage === "success" && receipt && <motion.div key="success" className="success-stage" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}><TransactionReceipt receipt={receipt} inline onClose={onClose} /></motion.div>}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
