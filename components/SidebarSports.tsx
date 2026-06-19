"use client";

import { motion } from "framer-motion";
import { Activity, CircleDot, Gamepad2, Goal, Swords, Trophy, X } from "lucide-react";
import type { Sport } from "@/lib/types";
import { useBetStore } from "@/store/useBetStore";

const sports: { name: Sport; icon: React.ElementType }[] = [
  { name: "Todos", icon: Trophy },
  { name: "Futebol", icon: Goal },
  { name: "Basquete", icon: CircleDot },
  { name: "Tênis", icon: Activity },
  { name: "MMA", icon: Swords },
  { name: "eSports", icon: Gamepad2 },
];

export function SidebarSports({ mobile = false, onClose }: { mobile?: boolean; onClose?: () => void }) {
  const selected = useBetStore((state) => state.selectedSport);
  const setSelected = useBetStore((state) => state.setSelectedSport);
  const matches = useBetStore((state) => state.matches);
  return (
    <aside className={`sports-sidebar ${mobile ? "sports-sidebar-mobile" : ""}`}>
      <div className="sidebar-title"><span>Explorar esportes</span>{mobile && <button className="icon-btn" onClick={onClose}><X size={18} /></button>}</div>
      <div className="sport-list">
        {sports.map(({ name, icon: Icon }) => {
          const count = name === "Todos" ? matches.length : matches.filter((match) => match.sport === name).length;
          return (
            <motion.button key={name} whileTap={{ scale: 0.97 }} className={selected === name ? "active" : ""} onClick={() => { setSelected(name); onClose?.(); }}>
              <span className="sport-icon"><Icon size={19} /></span><span>{name}</span><small>{count}</small>
            </motion.button>
          );
        })}
      </div>
      <div className="sidebar-section">
        <div className="sidebar-title"><span>Ligas populares</span></div>
        {["Brasileirão — Série A", "Premier League", "La Liga", "Champions League"].map((league, index) => (
          <button className="league-link" key={league}><span className={`league-dot dot-${index + 1}`} />{league}</button>
        ))}
      </div>
      <div className="responsible-card">
        <FlaskConicalIcon />
        <strong>Central de suporte</strong>
        <span>Consulte regras, mercados e informações da sua conta.</span>
      </div>
    </aside>
  );
}

function FlaskConicalIcon() {
  return <div className="safe-icon">24H</div>;
}
