"use client";

import { ArrowLeft, BarChart3, BellRing, Clock3, LoaderCircle, Radio, RefreshCw, Search, ShieldCheck, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { Match } from "@/lib/types";
import { useBetStore } from "@/store/useBetStore";
import { OddsButton } from "./OddsButton";
import { LiveMatchCenter } from "./LiveMatchCenter";
import { StatusBadge } from "./StatusBadge";

type Category = "Principais" | "Gols" | "Jogadores" | "Escanteios" | "Cartões" | "1º Tempo" | "Handicaps" | "Especiais";
const categories: Category[] = ["Principais", "Gols", "Jogadores", "Escanteios", "Cartões", "1º Tempo", "Handicaps", "Especiais"];

function normalizeMarketName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function categoryOf(name: string): Category {
  const normalized = normalizeMarketName(name);
  if (/jogador|player|goalscorer|goal scorer|scorer|marcador|finaliz|chute|shot|assist|passe|pass|desarme|tackle/.test(normalized)) return "Jogadores";
  if (/escanteio|corner/.test(normalized)) return "Escanteios";
  if (/cartao|card|booking|expuls/.test(normalized)) return "Cartões";
  if (/1[ºo°]? tempo|primeiro tempo|first half|1st half|half time|\bht\b|\bh1\b/.test(normalized)) return "1º Tempo";
  if (/handicap|spread|linha asiatica|asian/.test(normalized)) return "Handicaps";
  if (/gol|goal|total|marcam|both teams|placar|score|par\/impar|odd\/even/.test(normalized)) return "Gols";
  if (/resultado|result|moneyline|vencedor|winner|dupla chance|double chance|empate anula|draw no bet|qualifica|classifica/.test(normalized)) return "Principais";
  return "Especiais";
}

export function EventDetail({ match, isAdmin, onBack, onMatchUpdate }: { match: Match; isAdmin: boolean; onBack: () => void; onMatchUpdate: (match: Match) => void }) {
  const selected = useBetStore((state) => state.betSlip);
  const liveSnapshot = useBetStore((state) => state.liveTracking[match.id]);
  const toggleSelection = useBetStore((state) => state.toggleSelection);
  const hydrateAccount = useBetStore((state) => state.hydrateAccount);
  const showToast = useBetStore((state) => state.showToast);
  const [category, setCategory] = useState<Category>("Principais");
  const [search, setSearch] = useState("");
  const [tracking, setTracking] = useState(Boolean(match.tracking?.enabled));
  const [processing, setProcessing] = useState<"track" | "refresh" | null>(null);
  const counts = useMemo(() => categories.reduce<Record<Category, number>>((result, item) => ({ ...result, [item]: match.markets.filter((market) => categoryOf(market.name) === item).length }), { Principais: 0, Gols: 0, Jogadores: 0, Escanteios: 0, Cartões: 0, "1º Tempo": 0, Handicaps: 0, Especiais: 0 }), [match.markets]);
  const visibleMarkets = useMemo(() => match.markets.filter((market) => categoryOf(market.name) === category && market.name.toLowerCase().includes(search.trim().toLowerCase())), [match.markets, category, search]);

  const toggleTracking = async () => {
    setProcessing("track");
    try {
      const response = await fetch("/api/admin/tracking", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matchId: match.id, enabled: !tracking, intervalSeconds: 60 }) });
      const payload = await response.json() as { match?: Match; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Falha ao alterar acompanhamento");
      setTracking(!tracking);
      if (payload.match) onMatchUpdate(payload.match);
      showToast(!tracking ? "Acompanhamento ativado" : "Acompanhamento pausado", !tracking ? "O resultado será consultado somente enquanto necessário." : "Nenhum crédito será gasto com este jogo.", "success");
    } catch (error) {
      showToast("Não foi possível alterar", error instanceof Error ? error.message : "Tente novamente.", "danger");
    } finally { setProcessing(null); }
  };

  const refreshResult = async () => {
    setProcessing("refresh");
    try {
      const response = await fetch("/api/admin/results/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matchIds: [match.id], force: true }) });
      const payload = await response.json() as { result?: { settled: number; requestsSpent: number }; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Falha ao atualizar resultado");
      if ((payload.result?.settled ?? 0) > 0) await hydrateAccount();
      const liveResponse = await fetch("/api/live", { cache: "no-store" });
      const livePayload = await liveResponse.json() as { matches?: Match[] };
      const updated = livePayload.matches?.find((item) => item.id === match.id);
      if (updated) onMatchUpdate(updated);
      showToast("Resultado verificado", `${payload.result?.settled ?? 0} aposta(s) liquidada(s) • ${payload.result?.requestsSpent ?? 0} chamada(s).`, "success");
    } catch (error) {
      showToast("Atualização indisponível", error instanceof Error ? error.message : "Tente novamente.", "danger");
    } finally { setProcessing(null); }
  };

  return (
    <div className="event-detail-page">
      <button className="event-back" onClick={onBack}><ArrowLeft size={17} /> Voltar aos eventos</button>
      <section className="event-score-hero">
        <div className="event-score-top"><span>{match.country} • {match.league}</span><div><StatusBadge status={match.status} pulse={match.status === "live"} />{tracking && <span className="tracking-badge"><BellRing size={13} /> Acompanhando</span>}</div></div>
        <div className="event-score-main">
          <div className="event-team home"><span>{match.homeCode}</span><strong>{match.home}</strong></div>
          <div className="event-score-center">{match.score ? <strong>{match.score[0]} <small>×</small> {match.score[1]}</strong> : <strong><small>VS</small></strong>}<span>{match.status === "live" ? <><Radio size={13} /> {match.minute ?? 0}&apos;</> : <><Clock3 size={13} /> {match.kickoff}</>}</span></div>
          <div className="event-team away"><span>{match.awayCode}</span><strong>{match.away}</strong></div>
        </div>
        <div className="event-hero-actions"><span><ShieldCheck size={14} /> {match.markets.length} mercados verificados</span>{isAdmin && <><button className={tracking ? "btn btn-primary" : "btn btn-secondary"} onClick={toggleTracking} disabled={Boolean(processing)}>{processing === "track" ? <LoaderCircle className="spin" size={15} /> : <BellRing size={15} />} {tracking ? "Desativar acompanhamento" : "Acompanhar ao vivo"}</button><button className="btn btn-secondary" onClick={refreshResult} disabled={Boolean(processing) || !tracking}>{processing === "refresh" ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />} Atualizar resultado</button></>}</div>
      </section>
      {liveSnapshot && <LiveMatchCenter snapshot={liveSnapshot} />}
      <div className="event-market-toolbar"><div className="event-category-tabs">{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}<span>{counts[item]}</span></button>)}</div><label><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar mercado..." /></label></div>
      <div className="event-market-list">
        {visibleMarkets.map((market) => <section className="event-market-card" key={market.id}><div><span><BarChart3 size={15} /></span><strong>{market.name}</strong>{market.options.some((option) => option.boosted) && <em><Sparkles size={12} /> Super Odds</em>}</div><div className={`event-odds-grid ${market.options.length > 4 ? "many" : ""}`}>{market.options.map((option) => <OddsButton key={option.id} label={option.label} price={option.price} selected={selected.some((item) => item.id === `${match.id}:${market.id}:${option.id}`)} onClick={() => toggleSelection(match, market.id, option.id)} boosted={option.boosted} originalPrice={option.originalPrice} />)}</div></section>)}
        {!visibleMarkets.length && <div className="empty-history">Nenhum mercado nesta categoria.</div>}
      </div>
    </div>
  );
}
