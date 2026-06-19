"use client";

import { AnimatePresence, motion } from "framer-motion";
import { FlaskConical, Gift, History, Home, Layers3, Radio, ShieldCheck, WalletCards } from "lucide-react";
import { ReactNode, useState } from "react";
import { BetSlip } from "./BetSlip";
import { Header, type ViewName } from "./Header";
import { SidebarSports } from "./SidebarSports";
import type { AuthUser } from "@/lib/types";

interface AppLayoutProps {
  children: ReactNode;
  activeView: ViewName;
  onNavigate: (view: ViewName) => void;
  onDeposit: () => void;
  onWithdraw: () => void;
  user: AuthUser;
  onLogout: () => void;
}

export function AppLayout({ children, activeView, onNavigate, onDeposit, onWithdraw, user, onLogout }: AppLayoutProps) {
  const [mobileSports, setMobileSports] = useState(false);
  const [mobileSlip, setMobileSlip] = useState(false);
  return (
    <div className="app-shell">
      <Header activeView={activeView} onNavigate={onNavigate} onDeposit={onDeposit} onWithdraw={onWithdraw} onMenu={() => setMobileSports(true)} user={user} onLogout={onLogout} />
      <div className="app-columns">
        <div className="desktop-sidebar"><SidebarSports /></div>
        <main className="main-content">{children}
          <footer className="site-footer"><FlaskConical size={15} /> Ambiente sandbox local. A plataforma não processa apostas, pagamentos, saques ou prêmios em dinheiro real.</footer>
        </main>
        <div className="desktop-betslip"><BetSlip /></div>
      </div>
      <nav className="mobile-nav">
        <button className={activeView === "home" ? "active" : ""} onClick={() => onNavigate("home")}><Home size={20} /><span>Início</span></button>
        <button className={activeView === "scores" ? "active" : ""} onClick={() => onNavigate("scores")}><Radio size={20} /><span>Placar</span></button>
        <button className={activeView === "history" ? "active" : ""} onClick={() => onNavigate("history")}><History size={20} /><span>Apostas</span></button>
        <button className="bet-slip-fab" onClick={() => setMobileSlip(true)}><Layers3 size={22} /><span>Boletim</span></button>
        <button className={activeView === "rewards" ? "active" : ""} onClick={() => onNavigate("rewards")}><Gift size={20} /><span>Bônus</span></button>
        <button className={activeView === "wallet" ? "active" : ""} onClick={() => onNavigate("wallet")}><WalletCards size={20} /><span>Carteira</span></button>
        {user.role === "admin" && <button className={activeView === "admin" ? "active" : ""} onClick={() => onNavigate("admin")}><ShieldCheck size={20} /><span>Admin</span></button>}
      </nav>
      <AnimatePresence>
        {mobileSports && <motion.div className="mobile-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileSports(false)}><motion.div initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} onClick={(event) => event.stopPropagation()}><SidebarSports mobile onClose={() => setMobileSports(false)} /></motion.div></motion.div>}
        {mobileSlip && <motion.div className="mobile-overlay align-bottom" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileSlip(false)}><motion.div className="bottom-sheet" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} onClick={(event) => event.stopPropagation()}><span className="sheet-handle" /><BetSlip mobile onClose={() => setMobileSlip(false)} /></motion.div></motion.div>}
      </AnimatePresence>
    </div>
  );
}
