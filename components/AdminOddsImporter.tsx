"use client";

import { DatabaseZap, LoaderCircle, RefreshCw, Search, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Match } from "@/lib/types";
import { useBetStore } from "@/store/useBetStore";

interface SportOption { key: string; title: string; group: string }
interface EventOption { id: string; commence_time: string; home_team: string; away_team: string; sport_title: string }
interface Quota { remaining: number | null; used: number | null; last: number | null }

const featuredMarkets = ["h2h", "spreads", "totals"];

const marketLabel = (market: string) => ({
  h2h: "Resultado",
  spreads: "Handicap",
  totals: "Total",
  btts: "Ambas marcam",
  draw_no_bet: "Empate anula",
  alternate_spreads: "Handicaps alternativos",
  alternate_totals: "Totais alternativos",
  team_totals: "Totais por equipe",
}[market] ?? market.replaceAll("_", " "));

export function AdminOddsImporter() {
  const upsertLiveMatch = useBetStore((state) => state.upsertLiveMatch);
  const setLiveMatches = useBetStore((state) => state.setLiveMatches);
  const showToast = useBetStore((state) => state.showToast);
  const [sports, setSports] = useState<SportOption[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [sport, setSport] = useState("");
  const [eventId, setEventId] = useState("");
  const [search, setSearch] = useState("");
  const [availableMarkets, setAvailableMarkets] = useState<string[]>(featuredMarkets);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>(featuredMarkets);
  const [quota, setQuota] = useState<Quota>({ remaining: null, used: null, last: null });
  const [loading, setLoading] = useState(true);
  const [feedMatches, setFeedMatches] = useState(0);
  const [feedUpdatedAt, setFeedUpdatedAt] = useState<string | null>(null);
  const [feedStale, setFeedStale] = useState(false);
  const [estimatedRefreshCost, setEstimatedRefreshCost] = useState(0);
  const [refreshingFeed, setRefreshingFeed] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/odds/sports", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { sports?: SportOption[]; quota?: Quota; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Falha ao carregar esportes");
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        const options = payload.sports ?? [];
        setSports(options);
        if (payload.quota) setQuota(payload.quota);
        setSport(options.find((item) => item.key === "soccer_fifa_world_cup")?.key ?? options[0]?.key ?? "");
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Falha ao carregar esportes"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/odds/status", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { matches?: number; updatedAt?: string | null; stale?: boolean; quota?: Quota; estimatedRefreshCost?: number; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Falha ao consultar o feed");
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        setFeedMatches(payload.matches ?? 0);
        setFeedUpdatedAt(payload.updatedAt ?? null);
        setFeedStale(payload.stale ?? false);
        setEstimatedRefreshCost(payload.estimatedRefreshCost ?? 0);
        if (payload.quota) setQuota(payload.quota);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Falha ao consultar o feed"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!sport) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      setEventId("");
      setAvailableMarkets(featuredMarkets);
      setSelectedMarkets(featuredMarkets);
    });
    fetch(`/api/admin/odds/events?sport=${encodeURIComponent(sport)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { events?: EventOption[]; quota?: Quota; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Falha ao carregar eventos");
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        setEvents(payload.events ?? []);
        if (payload.quota) setQuota(payload.quota);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Falha ao carregar eventos"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sport]);

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return events;
    return events.filter((event) => `${event.home_team} ${event.away_team}`.toLowerCase().includes(query));
  }, [events, search]);
  const estimatedCost = selectedMarkets.length;
  const selectedEvent = events.find((event) => event.id === eventId);

  const discoverMarkets = async () => {
    if (!eventId) return;
    setDiscovering(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/odds/markets?sport=${encodeURIComponent(sport)}&event=${encodeURIComponent(eventId)}`, { cache: "no-store" });
      const payload = await response.json() as { markets?: string[]; quota?: Quota; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Falha ao descobrir mercados");
      const markets = payload.markets?.length ? payload.markets : featuredMarkets;
      setAvailableMarkets(markets);
      setSelectedMarkets(featuredMarkets.filter((market) => markets.includes(market)));
      if (payload.quota) setQuota(payload.quota);
      showToast("Mercados encontrados", `${markets.length} mercados disponíveis para este jogo.`, "success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao descobrir mercados");
    } finally {
      setDiscovering(false);
    }
  };

  const importEvent = async () => {
    if (!eventId || !selectedMarkets.length) return;
    setImporting(true);
    setError("");
    try {
      const response = await fetch("/api/admin/odds/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport, eventId, markets: selectedMarkets }),
      });
      const payload = await response.json() as { match?: Match; quota?: Quota; error?: string };
      if (!response.ok || !payload.match) throw new Error(payload.error ?? "Falha ao importar evento");
      upsertLiveMatch(payload.match);
      if (payload.quota) setQuota(payload.quota);
      showToast("Jogo importado", `${payload.match.home} × ${payload.match.away} já está na página de eventos.`, "success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao importar evento");
    } finally {
      setImporting(false);
    }
  };

  const refreshAutomaticFeed = async () => {
    if (!window.confirm(`Atualizar todas as competições da The Odds API agora? Custo máximo estimado: ${estimatedRefreshCost} créditos.`)) return;
    setRefreshingFeed(true);
    setError("");
    try {
      const response = await fetch("/api/admin/odds/refresh", { method: "POST" });
      const payload = await response.json() as { matches?: Match[]; quota?: Quota; updatedAt?: string | null; error?: string };
      if (!response.ok || !payload.matches) throw new Error(payload.error ?? "Falha ao atualizar a The Odds API");
      const combinedResponse = await fetch("/api/live", { cache: "no-store" });
      const combined = await combinedResponse.json() as { matches?: Match[] };
      setLiveMatches(combined.matches ?? payload.matches);
      setFeedMatches(payload.matches.length);
      setFeedUpdatedAt(payload.updatedAt ?? new Date().toISOString());
      setFeedStale(false);
      if (payload.quota) setQuota(payload.quota);
      showToast("The Odds API atualizada", `${payload.matches.length} jogos foram renovados e protegidos pelo cache diário.`, "success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao atualizar a The Odds API");
    } finally {
      setRefreshingFeed(false);
    }
  };

  const toggleMarket = (market: string) => setSelectedMarkets((current) => current.includes(market) ? current.filter((item) => item !== market) : [...current, market]);

  return (
    <section className="admin-card admin-odds-importer">
      <div className="admin-card-title"><span><DatabaseZap size={19} /></span><div><h3>Importar jogo sob demanda</h3><small>The Odds API • eventos gratuitos, odds cobradas por mercado</small></div><span className="quota-pill"><Zap size={12} /> {quota.remaining ?? "—"} créditos</span></div>
      <div className="api-football-cache-bar">
        <span><ShieldCheck size={16} /><strong>{feedMatches}</strong> jogos no cache automático</span>
        <small>{feedUpdatedAt ? `Atualizado em ${new Date(feedUpdatedAt).toLocaleString("pt-BR")}` : "O primeiro carregamento criará o cache"}</small>
        <button className="btn btn-secondary" onClick={refreshAutomaticFeed} disabled={refreshingFeed || (quota.remaining !== null && estimatedRefreshCost > quota.remaining)}>{refreshingFeed ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />} Atualizar tudo • até {estimatedRefreshCost} créditos</button>
      </div>
      {feedStale && <div className="api-quota-warning">O cache automático expirou ou teve atualização parcial. O site tenta novamente com intervalo de segurança para não repetir cobranças.</div>}
      <div className="odds-import-grid">
        <label><span>Esporte ou competição</span><select className="text-input" value={sport} onChange={(event) => setSport(event.target.value)} disabled={loading}>{sports.map((item) => <option key={item.key} value={item.key}>{item.title}</option>)}</select></label>
        <label><span>Buscar confronto</span><div className="admin-search-input"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Brasil, Argentina, Flamengo..." /></div></label>
        <label className="event-select-field"><span>Jogo</span><select className="text-input" value={eventId} onChange={(event) => setEventId(event.target.value)} disabled={loading || !filteredEvents.length}><option value="">Selecione um jogo ({filteredEvents.length})</option>{filteredEvents.map((item) => <option key={item.id} value={item.id}>{new Date(item.commence_time).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} • {item.home_team} × {item.away_team}</option>)}</select></label>
      </div>

      {selectedEvent && <div className="selected-admin-event"><Sparkles size={18} /><span><strong>{selectedEvent.home_team} × {selectedEvent.away_team}</strong><small>{selectedEvent.sport_title}</small></span><button className="btn btn-secondary" onClick={discoverMarkets} disabled={discovering}>{discovering ? <LoaderCircle className="spin" size={15} /> : <DatabaseZap size={15} />} Descobrir mercados • 1 crédito</button></div>}

      {eventId && <div className="market-picker"><div className="market-picker-head"><span><strong>{selectedMarkets.length}</strong> de {availableMarkets.length} mercados selecionados</span><button onClick={() => setSelectedMarkets(selectedMarkets.length === availableMarkets.length ? [] : availableMarkets)}>{selectedMarkets.length === availableMarkets.length ? "Limpar" : "Selecionar todos"}</button></div><div className="market-check-grid">{availableMarkets.map((market) => <label key={market} className={selectedMarkets.includes(market) ? "checked" : ""}><input type="checkbox" checked={selectedMarkets.includes(market)} onChange={() => toggleMarket(market)} /><span>{marketLabel(market)}</span></label>)}</div></div>}

      {error && <div className="auth-error">{error}</div>}
      <div className="import-cost-row"><span>Custo máximo estimado: <strong>{estimatedCost} créditos</strong>. O custo real considera apenas mercados retornados.</span><button className="btn btn-primary" onClick={importEvent} disabled={!eventId || !selectedMarkets.length || importing || (quota.remaining !== null && estimatedCost > quota.remaining)}>{importing ? <LoaderCircle className="spin" size={16} /> : <Zap size={16} />} Importar jogo com odds</button></div>
    </section>
  );
}
