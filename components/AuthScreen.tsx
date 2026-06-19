"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { FormEvent, useState } from "react";
import type { AuthUser } from "@/lib/types";

type AuthMode = "login" | "register";

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "register" ? { name, email, password } : { email, password }),
      });
      const payload = await response.json() as { user?: AuthUser; error?: string };
      if (!response.ok || !payload.user) throw new Error(payload.error || "Não foi possível continuar.");
      onAuthenticated(payload.user);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível continuar.");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError("");
  };

  return (
    <main className="auth-page">
      <div className="auth-ambient auth-ambient-one" /><div className="auth-ambient auth-ambient-two" />
      <section className="auth-brand-panel">
        <div className="auth-logo"><span className="brand-mark"><span>A</span></span><strong>ArenaOdds</strong></div>
        <div className="auth-pitch">
          <span className="hero-kicker"><Sparkles size={15} /> SUA ARENA ESPORTIVA</span>
          <h1>Todos os jogos.<br /><em>Todas as emoções.</em></h1>
          <p>Acompanhe eventos, explore mercados e gerencie seus palpites em uma experiência rápida e completa.</p>
        </div>
        <div className="auth-features">
          <div><ShieldCheck size={18} /><span><strong>Acesso protegido</strong><small>Sessão segura via cookie HttpOnly</small></span></div>
          <div><LockKeyhole size={18} /><span><strong>Dados locais</strong><small>Contas armazenadas apenas neste projeto</small></span></div>
        </div>
        <p className="auth-sandbox-note">Projeto local em ambiente sandbox. Operações financeiras não são processadas.</p>
      </section>

      <section className="auth-form-side">
        <motion.div className="auth-card" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <div className="auth-mobile-logo"><span className="brand-mark"><span>A</span></span><strong>ArenaOdds</strong></div>
          <div className="auth-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>Entrar</button><button className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")}>Criar conta</button></div>
          <AnimatePresence mode="wait">
            <motion.div key={mode} initial={{ opacity: 0, x: mode === "login" ? -8 : 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
              <div className="auth-heading"><small>{mode === "login" ? "BEM-VINDO DE VOLTA" : "COMECE AGORA"}</small><h2>{mode === "login" ? "Acesse sua conta" : "Crie sua conta"}</h2><p>{mode === "login" ? "Entre para acompanhar seus jogos e apostas." : "Leva menos de um minuto para entrar na arena."}</p></div>
              <form className="auth-form" onSubmit={submit}>
                {mode === "register" && <label><span>Nome completo</span><div className="auth-input"><UserRound size={17} /><input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Seu nome" required /></div></label>}
                <label><span>E-mail</span><div className="auth-input"><Mail size={17} /><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" required /></div></label>
                <label><span>Senha</span><div className="auth-input"><LockKeyhole size={17} /><input type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 8 caracteres" required minLength={8} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
                {error && <div className="auth-error">{error}</div>}
                <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>{loading ? <span className="auth-spinner" /> : <>{mode === "login" ? "Entrar na Arena" : "Criar minha conta"}<ArrowRight size={17} /></>}</button>
              </form>
              {mode === "login" && <button className="admin-access-helper" onClick={() => { setEmail("admin@arenaodds.local"); setPassword("ArenaAdmin#2026"); }}><ShieldCheck size={15} /><span><strong>Acesso administrativo local</strong><small>Preencher credenciais padrão</small></span><ArrowRight size={14} /></button>}
            </motion.div>
          </AnimatePresence>
          <p className="auth-terms">Ao continuar, você confirma que este projeto será usado somente em ambiente local.</p>
        </motion.div>
      </section>
    </main>
  );
}
