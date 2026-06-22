"use client";

import { motion } from "framer-motion";
import { formatOdd } from "@/lib/utils";

interface OddsButtonProps {
  label: string;
  price: number;
  selected: boolean;
  onClick: () => void;
  boosted?: boolean;
  originalPrice?: number;
}

export function OddsButton({ label, price, selected, onClick, boosted, originalPrice }: OddsButtonProps) {
  return (
    <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} className={`odds-button ${selected ? "selected" : ""} ${boosted ? "boosted" : ""}`} onClick={onClick} aria-pressed={selected}>
      <span>{label}</span><strong>{boosted && originalPrice ? <del>{formatOdd(originalPrice)}</del> : null}{formatOdd(price)}</strong>
    </motion.button>
  );
}
