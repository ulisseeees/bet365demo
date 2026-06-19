"use client";

import { Bell, ChevronRight, Menu, Plus, WalletCards } from "lucide-react";
import { BalanceCounter } from "./BalanceCounter";
import { UserMenu } from "./UserMenu";
import { useBetStore } from "@/store/useBetStore";
import type { AuthUser } from "@/lib/types";

export type ViewName = "home" | "scores" | "history" | "wallet" | "admin";

interface HeaderProps {
  activeView: ViewName;
  onNavigate: (view: ViewName) => void;
  onDeposit: () => void;
  onWithdraw: () => void;
  onMenu: () => void;
  user: AuthUser;
  onLogout: () => void;
}

export function Header({ activeView, onNavigate, onDeposit, onWithdraw, onMenu, user, onLogout }: HeaderProps) {
  const balance = useBetStore((state) => state.balance);
  return (
    <header className="topbar">
      <div className="brand-wrap">
        <button className="icon-btn mobile-only" onClick={onMenu} aria-label="Abrir esportes"><Menu size={21} /></button>
        <button className="brand" onClick={() => onNavigate("home")}>
          <span className="brand-mark"><span>A</span></span>
          <span><strong>ArenaOdds</strong></span>
        </button>
      </div>
      <nav className="main-nav" aria-label="Principal">
        <button className={activeView === "home" ? "active" : ""} onClick={() => onNavigate("home")}>Eventos</button>
        <button className={activeView === "scores" ? "active" : ""} onClick={() => onNavigate("scores")}>Placar ao vivo</button>
        <button className={activeView === "history" ? "active" : ""} onClick={() => onNavigate("history")}>Minhas apostas</button>
        <button className={activeView === "wallet" ? "active" : ""} onClick={() => onNavigate("wallet")}>Carteira</button>
        {user.role === "admin" && <button className={activeView === "admin" ? "active" : ""} onClick={() => onNavigate("admin")}>Admin</button>}
      </nav>
      <div className="header-actions">
        <button className="icon-btn desktop-only" aria-label="Notificações"><Bell size={19} /><span className="notification-dot" /></button>
        <button className="balance-chip" onClick={() => onNavigate("wallet")}>
          <WalletCards size={18} />
          <span><small>Saldo disponível</small><strong><BalanceCounter value={balance} /></strong></span>
          <ChevronRight size={14} />
        </button>
        <button className="btn btn-secondary desktop-only" onClick={onWithdraw}>Sacar</button>
        <button className="btn btn-primary" onClick={onDeposit}><Plus size={17} /> Depositar</button>
        <div className="desktop-only"><UserMenu user={user} onNavigate={(view) => onNavigate(view)} onLogout={onLogout} /></div>
      </div>
    </header>
  );
}
