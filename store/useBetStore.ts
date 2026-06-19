"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clampMoney, uid } from "@/lib/utils";
import type { Bet, BetSelection, BetStatus, Match, ReceiptData, Sport, ToastMessage, Transaction } from "@/lib/types";

interface AccountSnapshot {
  balance: number;
  bonus: number;
  bets: Bet[];
  transactions: Transaction[];
}

interface BetStore extends AccountSnapshot {
  activeUserId: string | null;
  accounts: Record<string, AccountSnapshot>;
  matches: Match[];
  betSlip: BetSelection[];
  stake: number;
  selectedSport: Sport;
  toast: ToastMessage | null;
  lastReceipt: ReceiptData | null;
  activateAccount: (userId: string) => void;
  deactivateAccount: () => void;
  setSelectedSport: (sport: Sport) => void;
  setStake: (stake: number) => void;
  toggleSelection: (match: Match, marketId: string, optionId: string) => void;
  removeSelection: (id: string) => void;
  clearBetSlip: () => void;
  placeBet: () => boolean;
  deposit: (amount: number) => ReceiptData;
  withdraw: (amount: number, pixKey: string) => ReceiptData | null;
  settleBet: (id: string, status: Extract<BetStatus, "green" | "red" | "void">) => void;
  setBalance: (amount: number) => void;
  setLiveMatches: (matches: Match[]) => void;
  upsertLiveMatch: (match: Match) => void;
  showToast: (title: string, message: string, tone?: ToastMessage["tone"]) => void;
  dismissToast: () => void;
  clearReceipt: () => void;
}

const emptyAccount = (): AccountSnapshot => ({ balance: 0, bonus: 0, bets: [], transactions: [] });

function accountUpdate(state: BetStore, patch: Partial<AccountSnapshot>) {
  const next: AccountSnapshot = {
    balance: patch.balance ?? state.balance,
    bonus: patch.bonus ?? state.bonus,
    bets: patch.bets ?? state.bets,
    transactions: patch.transactions ?? state.transactions,
  };
  return {
    ...patch,
    accounts: state.activeUserId ? { ...state.accounts, [state.activeUserId]: next } : state.accounts,
  };
}

export const useBetStore = create<BetStore>()(
  persist(
    (set, get) => ({
      ...emptyAccount(),
      activeUserId: null,
      accounts: {},
      matches: [],
      betSlip: [],
      stake: 25,
      selectedSport: "Todos",
      toast: null,
      lastReceipt: null,

      activateAccount: (userId) => set((state) => {
        const account = state.accounts[userId] ?? emptyAccount();
        return {
          activeUserId: userId,
          accounts: state.accounts[userId] ? state.accounts : { ...state.accounts, [userId]: account },
          ...account,
          betSlip: [],
          stake: 25,
          lastReceipt: null,
        };
      }),
      deactivateAccount: () => set({ activeUserId: null, ...emptyAccount(), betSlip: [], stake: 25, lastReceipt: null }),
      setSelectedSport: (selectedSport) => set({ selectedSport }),
      setStake: (stake) => set({ stake: clampMoney(stake) }),

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
        set({ betSlip: [...withoutSameMarket, {
          id,
          matchId: match.id,
          marketId,
          optionId,
          matchLabel: `${match.home} × ${match.away}`,
          marketName: market.name,
          selectionLabel: option.label,
          odd: option.price,
        }] });
      },

      removeSelection: (id) => set({ betSlip: get().betSlip.filter((item) => item.id !== id) }),
      clearBetSlip: () => set({ betSlip: [] }),

      placeBet: () => {
        const { balance, betSlip, stake } = get();
        if (!betSlip.length) {
          get().showToast("Boletim vazio", "Escolha ao menos uma odd para continuar.", "info");
          return false;
        }
        if (stake <= 0 || stake > balance) {
          get().showToast("Saldo insuficiente", "Ajuste o valor da aposta para continuar.", "danger");
          return false;
        }
        const totalOdd = Number(betSlip.reduce((total, item) => total * item.odd, 1).toFixed(2));
        const id = uid("BET");
        const placedAt = new Date().toISOString();
        const bet: Bet = { id, selections: betSlip, stake, totalOdd, potentialReturn: clampMoney(stake * totalOdd), status: "pending", placedAt };
        const transaction: Transaction = { id: uid("TRX"), type: "bet", description: `Aposta ${id}`, amount: -stake, status: "approved", createdAt: placedAt };
        set((state) => accountUpdate(state, { balance: clampMoney(state.balance - stake), bets: [bet, ...state.bets], transactions: [transaction, ...state.transactions] }));
        set({ betSlip: [] });
        get().showToast("Aposta confirmada", "Seu palpite foi adicionado ao histórico como pendente.", "success");
        return true;
      },

      deposit: (amount) => {
        const receipt: ReceiptData = { id: uid("DEP"), type: "Depósito", amount, createdAt: new Date().toISOString(), status: "Aprovado" };
        const transaction: Transaction = { id: receipt.id, type: "deposit", description: "Depósito", amount, status: "approved", createdAt: receipt.createdAt };
        set((state) => accountUpdate(state, { balance: clampMoney(state.balance + amount), transactions: [transaction, ...state.transactions] }));
        set({ lastReceipt: receipt });
        get().showToast("Saldo atualizado", "O depósito foi aprovado com sucesso.", "success");
        return receipt;
      },

      withdraw: (amount, pixKey) => {
        if (amount <= 0 || amount > get().balance) {
          get().showToast("Saldo insuficiente", "Informe um valor disponível na sua carteira.", "danger");
          return null;
        }
        const receipt: ReceiptData = { id: uid("SAQ"), type: "Saque", amount, createdAt: new Date().toISOString(), status: "Aprovado", pixKey };
        const transaction: Transaction = { id: receipt.id, type: "withdrawal", description: "Saque", amount: -amount, status: "approved", createdAt: receipt.createdAt };
        set((state) => accountUpdate(state, { balance: clampMoney(state.balance - amount), transactions: [transaction, ...state.transactions] }));
        set({ lastReceipt: receipt });
        get().showToast("Saque aprovado", "A solicitação foi concluída no ambiente local.", "success");
        return receipt;
      },

      settleBet: (id, status) => {
        const bet = get().bets.find((item) => item.id === id);
        if (!bet || bet.status !== "pending") return;
        const credit = status === "green" ? bet.potentialReturn : status === "void" ? bet.stake : 0;
        const type: Transaction["type"] = status === "green" ? "win" : status === "void" ? "refund" : "loss";
        const label = status === "green" ? "Ganho" : status === "void" ? "Reembolso" : "Perda";
        const transaction: Transaction = { id: uid("TRX"), type, description: `${label} ${id}`, amount: status === "red" ? -bet.stake : credit, status: "approved", createdAt: new Date().toISOString() };
        set((state) => accountUpdate(state, {
          balance: clampMoney(state.balance + credit),
          bets: state.bets.map((item) => item.id === id ? { ...item, status } : item),
          transactions: [transaction, ...state.transactions],
        }));
        get().showToast(status === "green" ? "Green!" : status === "red" ? "Aposta encerrada em red" : "Aposta anulada", status === "green" ? "O retorno foi creditado na carteira." : "Resultado atualizado com sucesso.", status === "green" ? "success" : status === "red" ? "danger" : "info");
      },

      setBalance: (amount) => {
        const next = clampMoney(amount);
        const delta = next - get().balance;
        const transaction: Transaction = { id: uid("ADM"), type: "admin", description: "Ajuste administrativo", amount: delta, status: "approved", createdAt: new Date().toISOString() };
        set((state) => accountUpdate(state, { balance: next, transactions: [transaction, ...state.transactions] }));
        get().showToast("Saldo ajustado", "Alteração registrada pelo administrador.", "info");
      },

      setLiveMatches: (matches) => set({ matches }),
      upsertLiveMatch: (match) => set((state) => ({ matches: [match, ...state.matches.filter((item) => item.id !== match.id)] })),
      showToast: (title, message, tone = "info") => set({ toast: { id: uid("TOAST"), title, message, tone } }),
      dismissToast: () => set({ toast: null }),
      clearReceipt: () => set({ lastReceipt: null }),
    }),
    {
      name: "arenaodds-accounts-v2",
      partialize: (state) => ({ accounts: state.accounts }),
    },
  ),
);
