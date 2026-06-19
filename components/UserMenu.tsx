"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, CircleUserRound, History, LogOut, Settings } from "lucide-react";
import { useState } from "react";
import type { AuthUser } from "@/lib/types";

export function UserMenu({ user, onNavigate, onLogout }: { user: AuthUser; onNavigate: (view: "history" | "admin") => void; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="user-menu-wrap">
      <button className="user-menu-trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="avatar">{user.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>
        <span className="user-copy"><strong>{user.name}</strong><small>{user.role === "admin" ? "Administrador" : "Minha conta"}</small></span>
        <ChevronDown size={15} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="user-menu-popover" initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.97 }}>
            <div className="popover-account"><CircleUserRound size={16} /><span><strong>{user.name}</strong><small>{user.email}</small></span></div>
            <button onClick={() => { onNavigate("history"); setOpen(false); }}><History size={17} /> Histórico</button>
            {user.role === "admin" && <button onClick={() => { onNavigate("admin"); setOpen(false); }}><Settings size={17} /> Painel administrativo</button>}
            <button disabled><CircleUserRound size={17} /> Dados da conta</button>
            <button className="muted-action" onClick={onLogout}><LogOut size={17} /> Sair</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
