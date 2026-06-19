export type Sport = "Todos" | "Futebol" | "Basquete" | "Tênis" | "MMA" | "eSports";
export type MatchStatus = "live" | "upcoming" | "finished";
export type BetStatus = "pending" | "green" | "red" | "void";

export interface OddOption {
  id: string;
  label: string;
  price: number;
}

export interface Market {
  id: string;
  name: string;
  options: OddOption[];
}

export interface Match {
  id: string;
  sport: Sport;
  country: string;
  league: string;
  home: string;
  away: string;
  homeCode: string;
  awayCode: string;
  kickoff: string;
  kickoffAt?: string;
  status: MatchStatus;
  minute?: number;
  score?: [number, number];
  markets: Market[];
  source?: "api-football" | "the-odds-api" | "merged";
}

export interface BetSelection {
  id: string;
  matchId: string;
  marketId: string;
  optionId: string;
  matchLabel: string;
  marketName: string;
  selectionLabel: string;
  odd: number;
}

export interface Bet {
  id: string;
  selections: BetSelection[];
  stake: number;
  totalOdd: number;
  potentialReturn: number;
  status: BetStatus;
  placedAt: string;
}

export type TransactionType = "deposit" | "withdrawal" | "bet" | "win" | "loss" | "refund" | "admin";

export interface Transaction {
  id: string;
  type: TransactionType;
  description: string;
  amount: number;
  status: "approved" | "pending";
  createdAt: string;
}

export interface ReceiptData {
  id: string;
  type: "Depósito" | "Saque";
  amount: number;
  createdAt: string;
  status: "Aprovado";
  pixKey?: string;
}

export interface ToastMessage {
  id: string;
  title: string;
  message: string;
  tone: "success" | "danger" | "info";
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
}
