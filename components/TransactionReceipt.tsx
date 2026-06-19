"use client";

import { CheckCircle2, Copy, FileCheck2, FlaskConical, X } from "lucide-react";
import type { ReceiptData } from "@/lib/types";
import { brl, dateTime } from "@/lib/utils";
import { useBetStore } from "@/store/useBetStore";

export function TransactionReceipt({ receipt, onClose, inline = false }: { receipt: ReceiptData; onClose?: () => void; inline?: boolean }) {
  const showToast = useBetStore((state) => state.showToast);
  const copyId = async () => {
    await navigator.clipboard.writeText(receipt.id);
    showToast("ID copiado", "Identificador copiado para a área de transferência.", "info");
  };
  return (
    <div className={`receipt ${inline ? "receipt-inline" : ""}`}>
      <div className="receipt-top">
        <div className="receipt-check"><CheckCircle2 size={28} /></div>
        {onClose && <button className="icon-btn receipt-close" onClick={onClose}><X size={18} /></button>}
        <small>COMPROVANTE DA OPERAÇÃO</small>
        <h3>{receipt.type} aprovado</h3>
        <strong className="receipt-value">{brl(receipt.amount)}</strong>
      </div>
      <div className="receipt-details">
        <div><span>Identificador</span><strong>{receipt.id}<button onClick={copyId}><Copy size={13} /></button></strong></div>
        <div><span>Data e hora</span><strong>{dateTime(receipt.createdAt)}</strong></div>
        <div><span>Tipo</span><strong>{receipt.type}</strong></div>
        <div><span>Status</span><strong className="receipt-approved"><FileCheck2 size={14} /> {receipt.status}</strong></div>
        {receipt.pixKey && <div><span>Chave informada</span><strong>{receipt.pixKey}</strong></div>}
      </div>
      <p><FlaskConical size={15} /> Comprovante emitido no ambiente sandbox local, sem validade financeira.</p>
      {onClose && <button className="btn btn-primary full-width" onClick={onClose}>Concluir</button>}
    </div>
  );
}
