"use client";

import { CircleDollarSign, LoaderCircle, RefreshCw, ShieldAlert, Sparkles, Users, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Bet } from "@/lib/types";
import { useBetStore } from "@/store/useBetStore";
import { brl } from "@/lib/utils";

interface AdminUser { id: string; name: string; email: string; role: string; balance: number; bonus: number; cashback: number; freeBet: number; xp: number; level: string }

export function AdminOperations() {
  const matches = useBetStore((state) => state.matches);
  const showToast = useBetStore((state) => state.showToast);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [bets, setBets] = useState<Bet[]>([]);
  const [userId, setUserId] = useState("");
  const [balance, setBalance] = useState(0);
  const [matchId, setMatchId] = useState("");
  const [marketId, setMarketId] = useState("");
  const [optionId, setOptionId] = useState("");
  const [boostedPrice, setBoostedPrice] = useState(0);
  const [loading, setLoading] = useState(false);
  const selectedMatch = matches.find((item) => item.id === matchId);
  const selectedMarket = selectedMatch?.markets.find((item) => item.id === marketId);
  const selectedOption = selectedMarket?.options.find((item) => item.id === optionId);
  const adminMatches = useMemo(() => matches.filter((item) => item.status !== "finished").slice(0, 150), [matches]);

  const load = useCallback(async () => {
    const [usersResponse, betsResponse] = await Promise.all([fetch("/api/admin/users", { cache: "no-store" }), fetch("/api/admin/bets", { cache: "no-store" })]);
    const usersPayload = await usersResponse.json() as { users?: AdminUser[] };
    const betsPayload = await betsResponse.json() as { bets?: Bet[] };
    setUsers(usersPayload.users ?? []);
    setBets(betsPayload.bets ?? []);
    setUserId((current) => current || usersPayload.users?.[0]?.id || "");
    setBalance((current) => current || usersPayload.users?.[0]?.balance || 0);
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) load().catch(() => undefined); });
    return () => { active = false; };
  }, [load]);

  const adjustBalance = async () => {
    setLoading(true);
    const response = await fetch("/api/admin/users/balance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, amount: balance }) });
    const payload = await response.json() as { error?: string };
    setLoading(false);
    if (!response.ok) return showToast("Falha no ajuste", payload.error ?? "Tente novamente.", "danger");
    showToast("Saldo atualizado", "A alteração foi persistida no Postgres.", "success");
    await load();
  };

  const settle = async (betId: string, status: "green" | "red" | "void") => {
    const response = await fetch(`/api/admin/bets/${encodeURIComponent(betId)}/settle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) return showToast("Falha na liquidação", payload.error ?? "Tente novamente.", "danger");
    showToast("Aposta liquidada", `Status manual aplicado: ${status}.`, "success");
    await load();
  };

  const updateResults = async () => {
    setLoading(true);
    const response = await fetch("/api/admin/results/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: true }) });
    const payload = await response.json() as { result?: { updated: number; settled: number; manual: number; requestsSpent: number }; error?: string };
    setLoading(false);
    if (!response.ok) return showToast("Falha na atualização", payload.error ?? "Tente novamente.", "danger");
    showToast("Resultados verificados", `${payload.result?.updated ?? 0} jogos • ${payload.result?.settled ?? 0} liquidações • ${payload.result?.requestsSpent ?? 0} chamadas.`, "success");
    await load();
  };

  const saveSuperOdd = async () => {
    if (!selectedOption) return;
    setLoading(true);
    const response = await fetch("/api/admin/promotions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "super-odd", matchId, marketId, optionId, boostedPrice }) });
    const payload = await response.json() as { error?: string };
    setLoading(false);
    if (!response.ok) return showToast("Super Odd recusada", payload.error ?? "Revise os valores.", "danger");
    showToast("Super Odd ativada", `${selectedOption.label}: ${selectedOption.price.toFixed(2)} → ${boostedPrice.toFixed(2)}`, "success");
  };

  return (
    <>
      <div className="admin-grid admin-operations-grid">
        <section className="admin-card"><div className="admin-card-title"><span><Users size={19} /></span><div><h3>Contas no Postgres</h3><small>Carteira persistente por usuário</small></div></div><label className="field-label">Usuário</label><select className="text-input" value={userId} onChange={(event) => { const next = users.find((item) => item.id === event.target.value); setUserId(event.target.value); setBalance(next?.balance ?? 0); }}>{users.map((item) => <option value={item.id} key={item.id}>{item.name} • {item.level} • {brl(item.balance)}</option>)}</select><label className="field-label">Novo saldo</label><div className="money-input large"><span>R$</span><input type="number" value={balance} onChange={(event) => setBalance(Number(event.target.value))} /></div><button className="btn btn-primary full-width" disabled={!userId || loading} onClick={adjustBalance}><CircleDollarSign size={16} /> Salvar no banco</button></section>
        <section className="admin-card"><div className="admin-card-title"><span><Sparkles size={19} /></span><div><h3>Criar Super Odd</h3><small>Boost configurado e validado no servidor</small></div></div><div className="super-odd-form"><select className="text-input" value={matchId} onChange={(event) => { setMatchId(event.target.value); setMarketId(""); setOptionId(""); }}><option value="">Selecione o jogo</option>{adminMatches.map((item) => <option value={item.id} key={item.id}>{item.home} × {item.away}</option>)}</select><select className="text-input" value={marketId} disabled={!selectedMatch} onChange={(event) => { setMarketId(event.target.value); setOptionId(""); }}><option value="">Selecione o mercado</option>{selectedMatch?.markets.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><select className="text-input" value={optionId} disabled={!selectedMarket} onChange={(event) => { const option = selectedMarket?.options.find((item) => item.id === event.target.value); setOptionId(event.target.value); setBoostedPrice(option ? Number((option.price + .2).toFixed(2)) : 0); }}><option value="">Selecione a odd</option>{selectedMarket?.options.map((item) => <option value={item.id} key={item.id}>{item.label} • {item.price.toFixed(2)}</option>)}</select><div className="money-input"><span>Odd</span><input type="number" step="0.01" value={boostedPrice || ""} onChange={(event) => setBoostedPrice(Number(event.target.value))} /></div><button className="btn btn-primary" disabled={!selectedOption || boostedPrice <= selectedOption.price || loading} onClick={saveSuperOdd}><Zap size={16} /> Ativar Super Odd</button></div></section>
      </div>
      <section className="admin-card settlement-card"><div className="admin-card-title"><span><ShieldAlert size={19} /></span><div><h3>Liquidação e contingência</h3><small>Automático primeiro; intervenção manual somente em exceções</small></div><span className="count-pill">{bets.length} pendentes</span></div><div className="admin-result-actions"><p>O atualizador consulta apenas jogos acompanhados e respeita o intervalo configurado.</p><button className="btn btn-secondary" onClick={updateResults} disabled={loading}>{loading ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />} Atualizar acompanhados agora</button></div><div className="settlement-list">{bets.map((bet) => <div className="settlement-row" key={bet.id}><div><strong>{bet.userName} • {bet.id}</strong><span>{bet.selections.map((item) => `${item.selectionLabel} (${item.result ?? "pending"})`).join(" + ")}</span></div><b>Odd {bet.totalOdd.toFixed(2)}</b><div><button className="settle-green" onClick={() => settle(bet.id, "green")}>Green</button><button className="settle-red" onClick={() => settle(bet.id, "red")}>Red</button><button className="settle-void" onClick={() => settle(bet.id, "void")}>Anular</button></div></div>)}{!bets.length && <div className="empty-history">Nenhuma aposta pendente exige atenção.</div>}</div></section>
    </>
  );
}
