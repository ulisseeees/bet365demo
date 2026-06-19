"use client";

import { Copy, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useBetStore } from "@/store/useBetStore";

export const FAKE_QR_VALUE = "ARENAODDS_PIX_SANDBOX_LOCAL";
export const FAKE_PIX_CODE = "000201-SBX-PIX-LOCAL-SEM-VALOR-FINANCEIRO";

export function FakeQRCode() {
  const showToast = useBetStore((state) => state.showToast);
  const copy = async () => {
    await navigator.clipboard.writeText(FAKE_PIX_CODE);
    showToast("Código Pix copiado", "Código sandbox copiado para a área de transferência.", "info");
  };

  return (
    <div className="fake-qr-wrap">
      <div className="qr-demo-tag"><QrCode size={14} /> PIX • SANDBOX</div>
      <div className="qr-surface"><QRCodeSVG value={FAKE_QR_VALUE} size={178} level="M" bgColor="#ffffff" fgColor="#10131f" /></div>
      <strong>QR Code Pix</strong>
      <span>Código sandbox não pagável.</span>
      <div className="fake-code"><code>{FAKE_PIX_CODE}</code><button onClick={copy} aria-label="Copiar código Pix"><Copy size={16} /></button></div>
      <button className="btn btn-secondary full-width" onClick={copy}><Copy size={16} /> Copiar código Pix</button>
    </div>
  );
}
