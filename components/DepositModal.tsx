"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ChevronLeft, LoaderCircle, LockKeyhole, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import type { ReceiptData } from "@/lib/types";
import { brl } from "@/lib/utils";
import { useBetStore } from "@/store/useBetStore";
import { FakeQRCode } from "./FakeQRCode";
import { TransactionReceipt } from "./TransactionReceipt";

type Stage = "amount" | "qr" | "processing" | "success";

export function DepositModal({ onClose }: { onClose: () => void }) {
  const [amount, setAmount] = useState(100);
  const [stage, setStage] = useState<Stage>("amount");
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const deposit = useBetStore((state) => state.deposit);

  const simulateApproval = () => {
    setStage("processing");
    window.setTimeout(async () => {
      const nextReceipt = await deposit(amount);
      if (nextReceipt) {
        setReceipt(nextReceipt);
        setStage("success");
      } else {
        setStage("qr");
      }
    }, 1450);
  };

  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.currentTarget === event.target && stage !== "processing") onClose(); }}>
      <motion.div className="modal-shell" initial={{ opacity: 0, y: 28, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.97 }}>
        {stage !== "success" && (
          <div className="modal-header">
            <div>{stage === "qr" && <button className="icon-btn" onClick={() => setStage("amount")}><ChevronLeft size={19} /></button>}<span className="modal-icon"><LockKeyhole size={20} /></span><span><small>CARTEIRA</small><h2>Depositar</h2></span></div>
            <button className="icon-btn" onClick={onClose} disabled={stage === "processing"}><X size={19} /></button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {stage === "amount" && (
            <motion.div key="amount" className="modal-content" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
              <div className="demo-alert"><ShieldCheck size={17} /><span><strong>Pagamento seguro</strong>Confirmação automática no ambiente sandbox local.</span></div>
              <label className="field-label">Escolha o valor</label>
              <div className="amount-grid">{[20, 50, 100, 250, 500].map((value) => <button key={value} className={amount === value ? "selected" : ""} onClick={() => setAmount(value)}>{brl(value)}</button>)}</div>
              <label className="field-label" htmlFor="custom-deposit">Ou informe outro valor</label>
              <div className="money-input large"><span>R$</span><input id="custom-deposit" type="number" min="1" value={amount || ""} onChange={(event) => setAmount(Number(event.target.value))} /></div>
              <div className="payment-method"><span className="pix-demo-logo">PIX</span><span><strong>Pix</strong><small>Aprovação instantânea • sandbox</small></span><CheckCircle2 size={19} /></div>
              <button className="btn btn-primary full-width modal-main-button" disabled={amount <= 0} onClick={() => setStage("qr")}>Continuar para pagamento</button>
            </motion.div>
          )}
          {stage === "qr" && (
            <motion.div key="qr" className="modal-content qr-step" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}>
              <div className="deposit-amount-line"><span>Valor do depósito</span><strong>{brl(amount)}</strong></div>
              <FakeQRCode />
              <button className="btn btn-primary full-width modal-main-button" onClick={simulateApproval}>Confirmar pagamento</button>
            </motion.div>
          )}
          {stage === "processing" && (
            <motion.div key="processing" className="processing-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="processing-orbit"><LoaderCircle size={38} /></div><h3>Verificando pagamento...</h3><span>Aguarde enquanto confirmamos a operação.</span>
            </motion.div>
          )}
          {stage === "success" && receipt && (
            <motion.div key="success" className="success-stage" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
              <div className="mini-confetti" aria-hidden="true">{Array.from({ length: 12 }).map((_, index) => <i key={index} style={{ "--i": index } as React.CSSProperties} />)}</div>
              <TransactionReceipt receipt={receipt} inline onClose={onClose} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
