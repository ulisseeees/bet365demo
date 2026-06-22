"use client";

import { create } from "zustand";
import { correlationError } from "@/lib/bet-validation";
import { clampMoney, uid } from "@/lib/utils";
import type { AccountSnapshot, Bet, BetSelection, BetStatus, HomeBanner, LiveMatchSnapshot, LoyaltyLevel, Match, Mission, Promotion, ReceiptData, Sport, ToastMessage, Transaction } from "@/lib/types";

interface BetStore {
  activeUserId: string | null;
  accountLoading: boolean;
  balance: number;
  bonus: number;
  cashback: number;
  freeBet: number;
  xp: number;
  level: LoyaltyLevel;
  promotions: Promotion[];
  missions: Mission[];
  banners: HomeBanner[];
  bets: Bet[];
  transactions: Transaction[];
  matches: Match[];
  liveTracking: Record<string, LiveMatchSnapshot>;
  betSlip: BetSelection[];
  stake: number;
  useFreeBet: boolean;
  selectedSport: Sport;
  toast: ToastMessage | null;
  lastReceipt: ReceiptData | null;
  activateAccount: (userId: string) => Promise<void>;
  hydrateAccount: () => Promise<void>;
  hydrateLiveTracking: () => Promise<void>;
  deactivateAccount: () => void;
  setSelectedSport: (sport: Sport) => void;
  setStake: (stake: number) => void;
  setUseFreeBet: (enabled: boolean) => void;
  toggleSelection: (match: Match, marketId: string, optionId: string) => void;
  removeSelection: (id: string) => void;
  clearBetSlip: () => void;
  placeBet: () => Promise<boolean>;
  deposit: (amount: number) => Promise<ReceiptData | null>;
  withdraw: (amount: number, pixKey: string) => Promise<ReceiptData | null>;
  cashOut: (id: string) => Promise<boolean>;
  claimCashback: () => Promise<boolean>;
  settleBet: (id: string, status: Extract<BetStatus, "green" | "red" | "void">) => Promise<void>;
  setBalance: (amount: number) => void;
  setLiveMatches: (matches: Match[]) => void;
  upsertLiveMatch: (match: Match) => void;
  showToast: (title: string, message: string, tone?: ToastMessage["tone"]) => void;
  dismissToast: () => void;
  clearReceipt: () => void;
}

const emptyAccount: AccountSnapshot = { balance: 0, bonus: 0, cashback: 0, freeBet: 0, xp: 0, level: "Bronze", bets: [], transactions: [], promotions: [], missions: [], banners: [] };

function accountState(account: AccountSnapshot) {
  return {
    balance: account.balance,
    bonus: account.bonus,
    cashback: account.cashback,
    freeBet: account.freeBet,
    xp: account.xp,
    level: account.level,
    promotions: account.promotions,
    missions: account.missions,
    banners: account.banners,
    bets: account.bets,
    transactions: account.transactions,
  };
}

async function requestAccount(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = await response.json() as { account?: AccountSnapshot; receipt?: ReceiptData; error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Não foi possível atualizar a conta");
  return payload;
}

function legacyAccount(userId: string): Partial<AccountSnapshot> | null {
  try {
    const raw = window.localStorage.getItem("arenaodds-accounts-v2");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { accounts?: Record<string, Partial<AccountSnapshot>> } };
    return parsed.state?.accounts?.[userId] ?? null;
  } catch {
    return null;
  }
}

export const useBetStore = create<BetStore>((set, get) => ({
  activeUserId: null,
  accountLoading: false,
  ...emptyAccount,
  matches: [],
  liveTracking: {},
  betSlip: [],
  stake: 25,
  useFreeBet: false,
  selectedSport: "Todos",
  toast: null,
  lastReceipt: null,

  activateAccount: async (userId) => {
    set({ activeUserId: userId, accountLoading: true, ...emptyAccount, liveTracking: {}, betSlip: [], useFreeBet: false, lastReceipt: null });
    try {
      const legacy = legacyAccount(userId);
      const payload = legacy
        ? await requestAccount("/api/account/import-legacy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(legacy) })
        : await requestAccount("/api/account");
      if (payload.account) set({ ...accountState(payload.account), accountLoading: false });
      else set({ accountLoading: false });
    } catch (error) {
      set({ accountLoading: false });
      get().showToast("Falha ao sincronizar", error instanceof Error ? error.message : "Não foi possível carregar seus dados.", "danger");
    }
  },
  hydrateAccount: async () => {
    if (!get().activeUserId) return;
    try {
      const payload = await requestAccount("/api/account");
      if (payload.account) set(accountState(payload.account));
    } catch (error) {
      get().showToast("Falha ao atualizar", error instanceof Error ? error.message : "Tente novamente.", "danger");
    }
  },
  hydrateLiveTracking: async () => {
    if (!get().activeUserId || !get().bets.some((bet) => bet.status === "pending")) {
      set({ liveTracking: {} });
      return;
    }
    try {
      const response = await fetch("/api/account/live-tracking", { cache: "no-store" });
      const payload = await response.json() as { matches?: LiveMatchSnapshot[]; settled?: number };
      if (response.ok) {
        set({ liveTracking: Object.fromEntries((payload.matches ?? []).map((match) => [match.matchId, match])) });
        if ((payload.settled ?? 0) > 0) await get().hydrateAccount();
      }
    } catch {
      // O histórico continua funcional se o provedor ao vivo estiver momentaneamente indisponível.
    }
  },
  deactivateAccount: () => set({ activeUserId: null, accountLoading: false, ...emptyAccount, liveTracking: {}, betSlip: [], stake: 25, useFreeBet: false, lastReceipt: null }),
  setSelectedSport: (selectedSport) => set({ selectedSport }),
  setStake: (stake) => set({ stake: clampMoney(stake) }),
  setUseFreeBet: (useFreeBet) => set({ useFreeBet }),

  toggleSelection: (match, marketId, optionId) => {
    const market = match.markets.find((item) => item.id === marketId);
    const option = market?.options.find((item) => item.id === optionId);
    if (!market || !option) return;
    const id = `${match.id}:${marketId}:${optionId}`;
    const current = get().betSlip;
    if (current.some((item) => item.id === id)) {
      set({ betSlip: current.filter((item) => item.id !== id) });
      return;
    }
    const withoutSameMarket = current.filter((item) => !(item.matchId === match.id && item.marketId === marketId));
    const next = [...withoutSameMarket, { id, matchId: match.id, marketId, optionId, matchLabel: `${match.home} × ${match.away}`, marketName: market.name, selectionLabel: option.label, odd: option.price }];
    const correlation = correlationError(next);
    if (correlation) {
      get().showToast("Seleções relacionadas", correlation, "danger");
      return;
    }
    set({ betSlip: next });
  },
  removeSelection: (id) => set({ betSlip: get().betSlip.filter((item) => item.id !== id) }),
  clearBetSlip: () => set({ betSlip: [] }),

  placeBet: async () => {
    const { balance, freeBet, betSlip, stake, useFreeBet } = get();
    if (!betSlip.length) {
      get().showToast("Boletim vazio", "Escolha ao menos uma odd para continuar.", "info");
      return false;
    }
    if (stake <= 0 || stake > (useFreeBet ? freeBet : balance)) {
      get().showToast(useFreeBet ? "Free Bet insuficiente" : "Saldo insuficiente", "Ajuste o valor da aposta para continuar.", "danger");
      return false;
    }
    try {
      const payload = await requestAccount("/api/account/bets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selections: betSlip, stake, useFreeBet }) });
      if (payload.account) set({ ...accountState(payload.account), betSlip: [], useFreeBet: false });
      get().showToast("Aposta confirmada", "Seu bilhete foi salvo no banco e já aparece no histórico.", "success");
      return true;
    } catch (error) {
      get().showToast("Aposta recusada", error instanceof Error ? error.message : "Revise o bilhete.", "danger");
      return false;
    }
  },
  deposit: async (amount) => {
    try {
      const payload = await requestAccount("/api/account/deposit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount }) });
      if (payload.account) set({ ...accountState(payload.account), lastReceipt: payload.receipt ?? null });
      get().showToast("Saldo atualizado", "O depósito foi salvo na sua conta.", "success");
      return payload.receipt ?? null;
    } catch (error) {
      get().showToast("Depósito não concluído", error instanceof Error ? error.message : "Tente novamente.", "danger");
      return null;
    }
  },
  withdraw: async (amount, pixKey) => {
    try {
      const payload = await requestAccount("/api/account/withdraw", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount, pixKey }) });
      if (payload.account) set({ ...accountState(payload.account), lastReceipt: payload.receipt ?? null });
      get().showToast("Saque aprovado", "A movimentação foi salva na sua conta.", "success");
      return payload.receipt ?? null;
    } catch (error) {
      get().showToast("Saque não concluído", error instanceof Error ? error.message : "Tente novamente.", "danger");
      return null;
    }
  },
  cashOut: async (id) => {
    try {
      const payload = await requestAccount(`/api/account/bets/${encodeURIComponent(id)}/cashout`, { method: "POST" });
      if (payload.account) set(accountState(payload.account));
      get().showToast("Cash out realizado", "O valor foi creditado no saldo.", "success");
      return true;
    } catch (error) {
      get().showToast("Cash out indisponível", error instanceof Error ? error.message : "Tente novamente.", "danger");
      return false;
    }
  },
  claimCashback: async () => {
    try {
      const payload = await requestAccount("/api/account/cashback/claim", { method: "POST" });
      if (payload.account) set(accountState(payload.account));
      get().showToast("Cashback resgatado", "O valor entrou no saldo disponível.", "success");
      return true;
    } catch (error) {
      get().showToast("Cashback indisponível", error instanceof Error ? error.message : "Tente novamente.", "danger");
      return false;
    }
  },
  settleBet: async (id, status) => {
    const response = await fetch(`/api/admin/bets/${encodeURIComponent(id)}/settle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (response.ok) await get().hydrateAccount();
  },
  setBalance: (balance) => set({ balance: clampMoney(balance) }),
  setLiveMatches: (matches) => set({ matches }),
  upsertLiveMatch: (match) => set((state) => ({ matches: [match, ...state.matches.filter((item) => item.id !== match.id)] })),
  showToast: (title, message, tone = "info") => set({ toast: { id: uid("TOAST"), title, message, tone } }),
  dismissToast: () => set({ toast: null }),
  clearReceipt: () => set({ lastReceipt: null }),
}));
