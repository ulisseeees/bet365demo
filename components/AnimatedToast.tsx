"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useEffect } from "react";
import { useBetStore } from "@/store/useBetStore";

export function AnimatedToast() {
  const toast = useBetStore((state) => state.toast);
  const dismiss = useBetStore((state) => state.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(dismiss, 4200);
    return () => window.clearTimeout(timer);
  }, [toast, dismiss]);

  const Icon = toast?.tone === "success" ? CheckCircle2 : toast?.tone === "danger" ? AlertCircle : Info;

  return (
    <AnimatePresence>
      {toast && (
        <motion.div className={`toast toast-${toast.tone}`} initial={{ opacity: 0, y: -22, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -15, scale: 0.96 }} role="status">
          <Icon size={20} />
          <div><strong>{toast.title}</strong><span>{toast.message}</span></div>
          <button onClick={dismiss} aria-label="Fechar notificação"><X size={16} /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
