"use client";

import { motion } from "framer-motion";

interface OddsButtonProps {
  label: string;
  price: number;
  selected: boolean;
  onClick: () => void;
}

export function OddsButton({ label, price, selected, onClick }: OddsButtonProps) {
  return (
    <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} className={`odds-button ${selected ? "selected" : ""}`} onClick={onClick} aria-pressed={selected}>
      <span>{label}</span><strong>{price.toFixed(2)}</strong>
    </motion.button>
  );
}
