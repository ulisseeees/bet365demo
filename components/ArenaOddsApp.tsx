"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Activity, ArrowRight, BarChart3, CircleDot, Clock3, Flame, Radio, RefreshCw, Search, ShieldCheck, Sparkles, Trophy, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AuthUser, Match } from "@/lib/types";
import { useBetStore } from "@/store/useBetStore";
import { AdminPanel } from "./AdminPanel";
import { ApiSportsWidgets } from "./ApiSportsWidgets";
import { AnimatedToast } from "./AnimatedToast";
import { AppLayout } from "./AppLayout";
import { BetHistory } from "./BetHistory";
import { DepositModal } from "./DepositModal";
import type { ViewName } from "./Header";
import { MatchCard } from "./MatchCard";
import { StatusBadge } from "./StatusBadge";
import { TransactionHistory } from "./TransactionHistory";
import { WalletCard } from "./WalletCard";
import { WithdrawModal } from "./WithdrawModal";
import { AuthScreen } from "./AuthScreen";
import { EventDetail } from "./EventDetail";
import { RewardsCenter } from "./RewardsCenter";
import { HomePromotions } from "./HomePromotions";

type MatchFilter = "all" | "live" | "upcoming";

export function ArenaOddsApp() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState<ViewName>("home");
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [matchFilter, setMatchFilter] = useState<MatchFilter>("all");
  const [syncing, setSyncing] = useState(true);
  const [dataMode, setDataMode] = useState<"loading" | "api" | "unavailable">("loading");
  const [feedMessage, setFeedMessage] = useState("Conectando aos provedores de odds...");
  const [feedCacheSeconds, setFeedCacheSeconds] = useState(3600);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [eventSearch, setEventSearch] = useState("");
  const matches = useBetStore((state) => state.matches);
  const selectedSport = useBetStore((state) => state.selectedSport);
  const setLiveMatches = useBetStore((state) => state.setLiveMatches);
  const bets = useBetStore((state) => state.bets);
  const activateAccount = useBetStore((state) => state.activateAccount);
  const deactivateAccount = useBetStore((state) => state.deactivateAccount);
  const hydrateAccount = useBetStore((state) => state.hydrateAccount);

  useEffect(() => {
    window.localStorage.removeItem("arenaodds-sim-v1");
  }, []);

  useEffect(() => {
    let alive = true;
    const sync = async () => {
      try {
        const response = await fetch("/api/live", { cache: "no-store" });
        const payload = await response.json() as { mode: "api" | "unavailable"; matches?: Match[]; message?: string; meta?: { cacheSeconds?: number } };
        if (!alive) return;
        setDataMode(payload.mode);
        setLiveMatches(payload.matches ?? []);
        setFeedMessage(payload.message ?? "Eventos e mercados recebidos dos provedores de odds.");
        if (payload.meta?.cacheSeconds) setFeedCacheSeconds(payload.meta.cacheSeconds);
      } catch {
        if (alive) {
          setDataMode("unavailable");
          setLiveMatches([]);
          setFeedMessage("Não foi possível conectar aos provedores de odds agora.");
        }
      } finally {
        if (alive) setSyncing(false);
      }
    };
    sync();
    const interval = window.setInterval(sync, 60000);
    return () => { alive = false; window.clearInterval(interval); };
  }, [setLiveMatches]);

  const visibleMatches = useMemo(() => {
    const query = eventSearch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    return matches.filter((match) => {
      const searchable = `${match.home} ${match.away} ${match.league} ${match.country} ${match.sport}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      return (selectedSport === "Todos" || match.sport === selectedSport)
        && (matchFilter === "all" || match.status === matchFilter)
        && (!query || searchable.includes(query));
    }).sort((a, b) => Number(b.status === "live") - Number(a.status === "live"));
  }, [matches, selectedSport, matchFilter, eventSearch]);
  const selectedMatch = selectedMatchId ? matches.find((match) => match.id === selectedMatchId) ?? null : null;
  const pendingCount = bets.filter((bet) => bet.status === "pending").length;
  const totalMarkets = matches.reduce((total, match) => total + match.markets.length, 0);
  const refreshLabel = feedCacheSeconds < 60 ? `${feedCacheSeconds}s` : `${Math.round(feedCacheSeconds / 60)} min`;

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ user: AuthUser }> : { user: null })
      .then((payload) => {
        if (!alive) return;
        if (payload.user) activateAccount(payload.user.id);
        setUser(payload.user);
      })
      .finally(() => { if (alive) setAuthLoading(false); });
    return () => { alive = false; };
  }, [activateAccount]);

  useEffect(() => {
    if (!user) return;
    const interval = window.setInterval(() => hydrateAccount(), 60000);
    return () => window.clearInterval(interval);
  }, [user, hydrateAccount]);

  const authenticated = (nextUser: AuthUser) => {
    activateAccount(nextUser.id);
    setUser(nextUser);
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    deactivateAccount();
    setUser(null);
    setSelectedMatchId(null);
    setView("home");
  };

  if (authLoading) return <div className="auth-loading"><span className="brand-mark"><span>A</span></span><div className="auth-spinner" /></div>;
  if (!user) return <AuthScreen onAuthenticated={authenticated} />;

  return (
    <AppLayout activeView={view} onNavigate={(nextView) => { setView(nextView === "admin" && user.role !== "admin" ? "home" : nextView); if (nextView !== "event") setSelectedMatchId(null); }} onDeposit={() => setDepositOpen(true)} onWithdraw={() => setWithdrawOpen(true)} user={user} onLogout={logout}>
      <AnimatePresence mode="wait">
        {view === "home" && (
          <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <section className="hero-grid">
              <div className="hero-card">
                <div className="hero-glow" />
                <span className="hero-kicker"><Sparkles size={15} /> SPORTSBOOK LAB</span>
                <h1>O estádio é seu.<br /><em>O risco não existe.</em></h1>
                <p>Explore odds, monte múltiplas e acompanhe todos os seus palpites em um só lugar.</p>
                <div className="hero-actions"><button className="btn btn-primary" onClick={() => document.getElementById("events")?.scrollIntoView({ behavior: "smooth" })}>Ver eventos <ArrowRight size={17} /></button><span><ShieldCheck size={17} /> Acesso protegido</span></div>
                <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
              </div>
              <div className="hero-side">
                <div className="signal-card"><div><span className="signal-icon"><Radio size={20} /></span><span><small>Sinal de dados</small><strong>{dataMode === "api" ? "Feed multi-API conectado" : dataMode === "loading" ? "Conectando..." : "Provedores indisponíveis"}</strong></span></div>{syncing ? <RefreshCw size={17} className="spin" /> : <StatusBadge status={dataMode === "api" ? "api" : "offline"} />}</div>
                <div className="mini-stat-grid"><div><span><Flame size={18} /></span><strong>{matches.filter((item) => item.status === "live").length}</strong><small>jogos ao vivo</small></div><div><span><CircleDot size={18} /></span><strong>{totalMarkets}</strong><small>mercados reais</small></div><div><span><Activity size={18} /></span><strong>{refreshLabel}</strong><small>cache da API</small></div><div><span><Trophy size={18} /></span><strong>{pendingCount}</strong><small>palpites pendentes</small></div></div>
              </div>
            </section>

            <HomePromotions matches={matches} onOpenMatch={(match) => { setSelectedMatchId(match.id); setView("event"); window.scrollTo({ top: 0, behavior: "smooth" }); }} onOpenRewards={() => setView("rewards")} />

            <section className="content-grid" id="events">
              <div className="events-column">
                <label className="event-search"><Search size={18} /><span><small>BUSCAR EVENTO</small><input value={eventSearch} onChange={(event) => setEventSearch(event.target.value)} placeholder="Digite time, seleção, liga ou competição..." /></span>{eventSearch && <button onClick={() => setEventSearch("")} aria-label="Limpar pesquisa"><X size={16} /></button>}</label>
                <div className="section-heading"><div><span className="eyebrow">ARENA DE EVENTOS</span><h2>Jogos com odds reais</h2><p>{dataMode === "api" ? feedMessage : `Nenhum jogo fictício é exibido. ${feedMessage}`}</p></div><div className="event-tabs"><button className={matchFilter === "all" ? "active" : ""} onClick={() => setMatchFilter("all")}><BarChart3 size={15} /> Todos</button><button className={matchFilter === "live" ? "active" : ""} onClick={() => setMatchFilter("live")}><Radio size={15} /> Ao vivo</button><button className={matchFilter === "upcoming" ? "active" : ""} onClick={() => setMatchFilter("upcoming")}><Clock3 size={15} /> Próximos</button></div></div>
                {syncing && <div className="sync-skeleton"><span /><span /><span /></div>}
                <div className="match-list">{visibleMatches.map((match, index) => <MatchCard key={match.id} match={match} index={index} onOpen={(item) => { setSelectedMatchId(item.id); setView("event"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />)}</div>
                {!visibleMatches.length && <div className="empty-history">{dataMode === "unavailable" ? feedMessage : eventSearch ? `Nenhum evento encontrado para “${eventSearch}”.` : "Nenhum evento real encontrado neste filtro."}</div>}
              </div>
              <aside className="home-rail">
                <WalletCard onDeposit={() => setDepositOpen(true)} onWithdraw={() => setWithdrawOpen(true)} onHistory={() => setView("history")} />
                <section className="leaderboard-card"><div className="rail-title"><span><Users size={18} /></span><div><strong>Ranking da Arena</strong><small>Destaques da semana</small></div></div>{[["ML", "Mestre da Linha", "+R$ 842"], ["GO", "Green Observer", "+R$ 615"], ["AP", "Analista Prime", "+R$ 489"], ["JD", user.name, "+R$ 312"]].map((rankingUser, index) => <div className={`leader-row ${index === 3 ? "current" : ""}`} key={rankingUser[1]}><b>{index + 1}</b><span className="rank-avatar">{rankingUser[0]}</span><span><strong>{rankingUser[1]}</strong><small>Performance semanal</small></span><em>{rankingUser[2]}</em></div>)}</section>
                <section className="insight-card"><span className="insight-icon"><Sparkles size={20} /></span><div><small>INSIGHT</small><strong>Mercado mais explorado</strong><p>Resultado da partida concentra 48% dos palpites de hoje.</p></div></section>
              </aside>
            </section>
          </motion.div>
        )}
        {view === "scores" && <motion.div key="scores" className="page-stack" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><div className="page-title"><span className="eyebrow">FEED OFICIAL API-SPORTS</span><h1>Placar ao vivo</h1><p>Partidas, resultados, estatísticas e classificações em tempo real.</p></div><ApiSportsWidgets /></motion.div>}
        {view === "event" && selectedMatch && <motion.div key={`event-${selectedMatch.id}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><EventDetail match={selectedMatch} isAdmin={user.role === "admin"} onBack={() => { setSelectedMatchId(null); setView("home"); }} onMatchUpdate={(updated) => { useBetStore.getState().upsertLiveMatch(updated); setSelectedMatchId(updated.id); }} /></motion.div>}
        {view === "history" && <motion.div key="history" className="page-stack" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><div className="page-title"><span className="eyebrow">CENTRAL DO JOGADOR</span><h1>Apostas e movimentações</h1><p>Acompanhe todos os resultados e movimentações da sua conta.</p></div><BetHistory /><TransactionHistory /></motion.div>}
        {view === "rewards" && <motion.div key="rewards" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><RewardsCenter /></motion.div>}
        {view === "wallet" && <motion.div key="wallet" className="page-stack" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><div className="page-title"><span className="eyebrow">CARTEIRA</span><h1>Meu saldo</h1><p>Gerencie depósitos, saques, bônus e movimentações.</p></div><WalletCard expanded onDeposit={() => setDepositOpen(true)} onWithdraw={() => setWithdrawOpen(true)} onHistory={() => setView("history")} /><TransactionHistory /></motion.div>}
        {view === "admin" && user.role === "admin" && <motion.div key="admin" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><AdminPanel /></motion.div>}
      </AnimatePresence>
      <AnimatedToast />
      <AnimatePresence>{depositOpen && <DepositModal onClose={() => setDepositOpen(false)} />}{withdrawOpen && <WithdrawModal onClose={() => setWithdrawOpen(false)} />}</AnimatePresence>
    </AppLayout>
  );
}
