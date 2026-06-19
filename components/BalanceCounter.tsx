"use client";

import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect } from "react";

export function BalanceCounter({ value, compact = false }: { value: number; compact?: boolean }) {
  const motionValue = useMotionValue(value);
  const formatted = useTransform(motionValue, (latest) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: compact ? 0 : 2,
    }).format(latest),
  );

  useEffect(() => {
    const control = animate(motionValue, value, { duration: 0.65, ease: "easeOut" });
    return control.stop;
  }, [motionValue, value]);

  return <motion.span>{formatted}</motion.span>;
}
