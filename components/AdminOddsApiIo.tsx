"use client";

import { DatabaseZap, LoaderCircle, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import type { Match } from "@/lib/types";
import { useBetStore } from "@/store/useBetStore";

interface Quota { limit: number | null; remaining: number | null; resetAt: string | null }

export function AdminOddsApiIo() {
  const setLiveMatches = useBetStore((state) => state.setLiveMatches);
  const showToast = useBetStore((state) => state.showToast);
  const [configured, setConfigured] = useState(false);
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [bookmakersConfigured, setBookmakersConfigured] = useState(0);
  const [matches, setMatches] = useState(0);
  const [sports, setSports] = useState<string[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [estimatedRequests, setEstimatedRequests] = useState(0);
  const [quota, setQuota] = useState<Quota>({ limit: null, remaining: null, resetAt: null });
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/odds-api-io/status", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { configured?: boolean; keyConfigured?: boolean; bookmakersConfigured?: number; matches?: number; sports?: string[]; updatedAt?: string | null; stale?: boolean; lastError?: string | null; estimatedRefreshRequests?: number; quota?: Quota; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Falha ao consultar a Odds-API.io");
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        setConfigured(payload.configured ?? false);
        setKeyConfigured(payload.keyConfigured ?? false);
        setBookmakersConfigured(payload.bookmakersConfigured ?? 0);
        setMatches(payload.matches ?? 0);
        setSports(payload.sports ?? []);
        setUpdatedAt(payload.updatedAt ?? null);
        setStale(payload.stale ?? false);
        setLastError(payload.lastError ?? null);
        setEstimatedRequests(payload.estimatedRefreshRequests ?? 0);
        if (payload.quota) setQuota(payload.quota);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Falha ao consultar a Odds-API.io"); });
    return () => { active = false; };
  }, []);

  const refresh = async () => {
    if (!window.confirm(`Atualizar a Odds-API.io agora? Serão usadas até ${estimatedRequests} requisições em lote.`)) return;
    setRefreshing(true);
    setError("");
    try {
      const response = await fetch("/api/admin/odds-api-io/refresh", { method: "POST" });
      const payload = await response.json() as { matches?: Match[]; quota?: Quota; updatedAt?: string; error?: string };
      if (!response.ok || !payload.matches) throw new Error(payload.error ?? "Falha ao atualizar a Odds-API.io");
      const combinedResponse = await fetch("/api/live", { cache: "no-store" });
      const combined = await combinedResponse.json() as { matches?: Match[] };
      setLiveMatches(combined.matches ?? payload.matches);
      setMatches(payload.matches.length);
      setUpdatedAt(payload.updatedAt ?? new Date().toISOString());
      setStale(false);
      setLastError(null);
      if (payload.quota) setQuota(payload.quota);
      showToast("Terceira API atualizada", `${payload.matches.length} jogos da Odds-API.io entraram no feed combinado.`, "success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao atualizar a Odds-API.io");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section className="admin-card admin-odds-importer">
      <div className="admin-card-title">
        <span><DatabaseZap size={19} /></span>
        <div><h3>Odds-API.io</h3><small>Terceira fonte • lotes de 10 eventos • HTTP no plano free</small></div>
        <span className="quota-pill"><Zap size={12} /> {quota.remaining ?? "—"}{quota.limit ? ` / ${quota.limit}` : ""} req/h</span>
      </div>
      <div className="api-football-cache-bar">
        <span><ShieldCheck size={16} /><strong>{matches}</strong> jogos protegidos no cache</span>
        <small>{updatedAt ? `Atualizado em ${new Date(updatedAt).toLocaleString("pt-BR")} • ${sports.join(", ")}` : `Aguardando configuração • ${sports.join(", ")}`}</small>
        <button className="btn btn-secondary" onClick={refresh} disabled={!configured || refreshing}>{refreshing ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />} Atualizar • até {estimatedRequests} requisições</button>
      </div>
      {!keyConfigured && <div className="api-quota-warning">Adicione ODDS_API_IO_KEY no .env.local e nas variáveis de ambiente da Vercel.</div>}
      {keyConfigured && bookmakersConfigured === 0 && <div className="api-quota-warning">Configure ODDS_API_IO_BOOKMAKERS com até 2 nomes selecionados na sua conta, separados por vírgula.</div>}
      {stale && <div className="api-quota-warning">Cache expirado ou parcial. {lastError ? `Última tentativa: ${lastError}` : "O próximo acesso tentará atualizar novamente."}</div>}
      {error && <div className="auth-error">{error}</div>}
    </section>
  );
}
