"use client";

import { CalendarDays, DatabaseZap, LoaderCircle, RefreshCw, Search, ShieldCheck, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Match } from "@/lib/types";
import { useBetStore } from "@/store/useBetStore";

interface FixtureOption {
  id: number;
  date: string;
  status: string;
  league: string;
  country: string;
  home: string;
  away: string;
}

interface MarketOption { id: string; name: string; options: number }
interface Quota { dailyLimit: number | null; dailyRemaining: number | null; minuteLimit: number | null; minuteRemaining: number | null }

const localDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export function AdminApiFootballImporter() {
  const setLiveMatches = useBetStore((state) => state.setLiveMatches);
  const upsertLiveMatch = useBetStore((state) => state.upsertLiveMatch);
  const showToast = useBetStore((state) => state.showToast);
  const [date, setDate] = useState(localDate);
  const [fixtures, setFixtures] = useState<FixtureOption[]>([]);
  const [fixtureId, setFixtureId] = useState(0);
  const [search, setSearch] = useState("");
  const [markets, setMarkets] = useState<MarketOption[]>([]);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [quota, setQuota] = useState<Quota>({ dailyLimit: null, dailyRemaining: null, minuteLimit: null, minuteRemaining: null });
  const [cachedGames, setCachedGames] = useState(0);
  const [cacheUpdatedAt, setCacheUpdatedAt] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [searching, setSearching] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [importing, setImporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSearchCost, setLastSearchCost] = useState<number | null>(null);
  const [lastOddsCost, setLastOddsCost] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/api-football/status", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { matches?: number; updatedAt?: string | null; quota?: Quota; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Falha ao consultar o cache");
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        setCachedGames(payload.matches ?? 0);
        setCacheUpdatedAt(payload.updatedAt ?? null);
        if (payload.quota) setQuota(payload.quota);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Falha ao consultar o cache"); })
      .finally(() => { if (active) setLoadingStatus(false); });
    return () => { active = false; };
  }, []);

  const filteredFixtures = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return fixtures;
    return fixtures.filter((fixture) => `${fixture.home} ${fixture.away} ${fixture.league} ${fixture.country}`.toLowerCase().includes(query));
  }, [fixtures, search]);
  const selectedFixture = fixtures.find((fixture) => fixture.id === fixtureId);

  const findFixtures = async () => {
    setSearching(true);
    setError("");
    setFixtureId(0);
    setMarkets([]);
    setSelectedMarkets([]);
    try {
      const response = await fetch(`/api/admin/api-football/fixtures?date=${encodeURIComponent(date)}`, { cache: "no-store" });
      const payload = await response.json() as { fixtures?: FixtureOption[]; quota?: Quota; requestsSpent?: number; cached?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Falha ao buscar partidas");
      setFixtures(payload.fixtures ?? []);
      setLastSearchCost(payload.requestsSpent ?? null);
      if (payload.quota) setQuota(payload.quota);
      showToast("Busca concluída", `${payload.fixtures?.length ?? 0} partidas encontradas${payload.cached ? " no cache local" : " na API-Football"}.`, "success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao buscar partidas");
    } finally {
      setSearching(false);
    }
  };

  const discoverMarkets = async () => {
    if (!fixtureId) return;
    setDiscovering(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/api-football/markets?date=${encodeURIComponent(date)}&fixture=${fixtureId}`, { cache: "no-store" });
      const payload = await response.json() as { markets?: MarketOption[]; quota?: Quota; requestsSpent?: number; cached?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Falha ao consultar odds");
      const available = payload.markets ?? [];
      setMarkets(available);
      setSelectedMarkets(available.map((market) => market.id));
      setLastOddsCost(payload.requestsSpent ?? null);
      if (payload.quota) setQuota(payload.quota);
      showToast("Odds carregadas", `${available.length} mercados encontrados${payload.cached ? " no cache local" : " na API-Football"}.`, "success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao consultar odds");
    } finally {
      setDiscovering(false);
    }
  };

  const importFixture = async () => {
    if (!fixtureId || !selectedMarkets.length) return;
    setImporting(true);
    setError("");
    try {
      const response = await fetch("/api/admin/api-football/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtureId, markets: selectedMarkets }),
      });
      const payload = await response.json() as { match?: Match; error?: string };
      if (!response.ok || !payload.match) throw new Error(payload.error ?? "Falha ao importar partida");
      upsertLiveMatch(payload.match);
      showToast("Jogo publicado", `${payload.match.home} × ${payload.match.away} entrou no feed sem nova chamada à API.`, "success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao importar partida");
    } finally {
      setImporting(false);
    }
  };

  const refreshAutomaticFeed = async () => {
    if (!window.confirm("Atualizar o feed da API-Football agora? Esta ação pode consumir até 3 chamadas.")) return;
    setRefreshing(true);
    setError("");
    try {
      const response = await fetch("/api/admin/api-football/refresh", { method: "POST" });
      const payload = await response.json() as { matches?: Match[]; meta?: { quota?: Quota; requestsSpent?: number }; updatedAt?: string; error?: string };
      if (!response.ok || !payload.matches) throw new Error(payload.error ?? "Falha ao atualizar o feed");
      const combinedResponse = await fetch("/api/live", { cache: "no-store" });
      const combined = await combinedResponse.json() as { matches?: Match[] };
      setLiveMatches(combined.matches ?? payload.matches);
      setCachedGames(payload.matches.length);
      setCacheUpdatedAt(payload.updatedAt ?? new Date().toISOString());
      if (payload.meta?.quota) setQuota(payload.meta.quota);
      showToast("Feed atualizado", `${payload.matches.length} jogos da API-Football preservados no cache por 24 horas.`, "success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao atualizar o feed");
    } finally {
      setRefreshing(false);
    }
  };

  const toggleMarket = (marketId: string) => setSelectedMarkets((current) => current.includes(marketId) ? current.filter((item) => item !== marketId) : [...current, marketId]);

  return (
    <section className="admin-card admin-odds-importer api-football-importer">
      <div className="admin-card-title">
        <span><DatabaseZap size={19} /></span>
        <div><h3>Gerenciar API-Football</h3><small>Busca e odds sob demanda com cache persistente</small></div>
        <span className="quota-pill"><Zap size={12} /> {quota.dailyRemaining ?? "—"}{quota.dailyLimit ? ` / ${quota.dailyLimit}` : ""} chamadas</span>
      </div>

      <div className="api-football-cache-bar">
        <span><ShieldCheck size={16} /><strong>{loadingStatus ? "…" : cachedGames}</strong> jogos protegidos no cache</span>
        <small>{cacheUpdatedAt ? `Atualizado em ${new Date(cacheUpdatedAt).toLocaleString("pt-BR")}` : "O primeiro carregamento criará o cache"}</small>
        <button className="btn btn-secondary" onClick={refreshAutomaticFeed} disabled={refreshing || (quota.dailyRemaining !== null && quota.dailyRemaining < 3)}>{refreshing ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />} Atualizar feed • até 3 chamadas</button>
      </div>

      {quota.dailyRemaining !== null && quota.dailyRemaining < 10 && <div className="api-quota-warning">Limite baixo: restam {quota.dailyRemaining} chamadas hoje. O cache mantém os jogos atuais sem novo consumo.</div>}

      <div className="football-search-grid">
        <label><span>Data das partidas</span><div className="admin-search-input"><CalendarDays size={15} /><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div></label>
        <label><span>Filtrar confronto ou liga</span><div className="admin-search-input"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Brasil, Copa, Flamengo..." /></div></label>
        <button className="btn btn-secondary" onClick={findFixtures} disabled={searching || quota.dailyRemaining === 0}>{searching ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />} Buscar jogos • até 1 chamada</button>
      </div>

      {!!fixtures.length && <label className="football-fixture-select"><span>Jogo encontrado</span><select className="text-input" value={fixtureId} onChange={(event) => { setFixtureId(Number(event.target.value)); setMarkets([]); setSelectedMarkets([]); }}><option value={0}>Selecione um jogo ({filteredFixtures.length})</option>{filteredFixtures.map((fixture) => <option key={fixture.id} value={fixture.id}>{new Date(fixture.date).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} • {fixture.home} × {fixture.away} • {fixture.league}</option>)}</select></label>}

      {selectedFixture && <div className="selected-admin-event"><DatabaseZap size={18} /><span><strong>{selectedFixture.home} × {selectedFixture.away}</strong><small>{selectedFixture.league} • {selectedFixture.country}</small></span><button className="btn btn-secondary" onClick={discoverMarkets} disabled={discovering || quota.dailyRemaining === 0}>{discovering ? <LoaderCircle className="spin" size={15} /> : <DatabaseZap size={15} />} Consultar odds • até 1 chamada</button></div>}

      {!!markets.length && <div className="market-picker"><div className="market-picker-head"><span><strong>{selectedMarkets.length}</strong> de {markets.length} mercados selecionados</span><button onClick={() => setSelectedMarkets(selectedMarkets.length === markets.length ? [] : markets.map((market) => market.id))}>{selectedMarkets.length === markets.length ? "Limpar" : "Selecionar todos"}</button></div><div className="market-check-grid">{markets.map((market) => <label key={market.id} className={selectedMarkets.includes(market.id) ? "checked" : ""}><input type="checkbox" checked={selectedMarkets.includes(market.id)} onChange={() => toggleMarket(market.id)} /><span>{market.name}<small>{market.options} opções</small></span></label>)}</div></div>}

      {error && <div className="auth-error">{error}</div>}
      <div className="import-cost-row"><span>Última busca: <strong>{lastSearchCost ?? "—"} chamada(s)</strong> • Odds: <strong>{lastOddsCost ?? "—"} chamada(s)</strong> • Publicar: <strong>0 chamadas</strong></span><button className="btn btn-primary" onClick={importFixture} disabled={!fixtureId || !selectedMarkets.length || importing}>{importing ? <LoaderCircle className="spin" size={16} /> : <Zap size={16} />} Publicar jogo no feed</button></div>
    </section>
  );
}
