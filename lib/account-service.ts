import "server-only";

import { sql } from "@vercel/postgres";
import { ensureDatabaseSchema, withTransaction } from "./database";
import { getCombinedFeed } from "./feed";
import type { AccountSnapshot, AuthUser, Bet, BetSelection, BetStatus, LoyaltyLevel, Promotion, ReceiptData, Transaction } from "./types";
import { clampMoney, uid } from "./utils";
import { correlationError } from "./bet-validation";

const levels: Array<{ name: LoyaltyLevel; min: number }> = [
  { name: "Diamante", min: 5000 },
  { name: "Platina", min: 2500 },
  { name: "Ouro", min: 1000 },
  { name: "Prata", min: 250 },
  { name: "Bronze", min: 0 },
];

export function loyaltyLevel(xp: number) {
  return levels.find((level) => xp >= level.min)?.name ?? "Bronze";
}

function money(value: unknown) {
  return Number(Number(value ?? 0).toFixed(2));
}

function mapTransaction(row: Record<string, unknown>): Transaction {
  return {
    id: String(row.id),
    type: String(row.type) as Transaction["type"],
    description: String(row.description),
    amount: money(row.amount),
    status: String(row.status) as Transaction["status"],
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function mapSelection(row: Record<string, unknown>): BetSelection {
  return {
    id: String(row.id),
    matchId: String(row.match_id),
    marketId: String(row.market_id),
    optionId: String(row.option_id),
    matchLabel: String(row.match_label),
    marketName: String(row.market_name),
    selectionLabel: String(row.selection_label),
    odd: Number(row.odd),
    currentOdd: row.current_odd == null ? undefined : Number(row.current_odd),
    result: String(row.result) as BetSelection["result"],
  };
}

function mapBet(row: Record<string, unknown>, selections: BetSelection[]): Bet {
  return {
    id: String(row.id),
    selections,
    stake: money(row.stake),
    totalOdd: Number(row.total_odd),
    baseReturn: money(row.base_return),
    potentialReturn: money(row.potential_return),
    boostPercent: Number(row.boost_percent ?? 0),
    status: String(row.status) as BetStatus,
    isFreeBet: Boolean(row.is_free_bet),
    cashoutValue: row.cashout_value == null ? null : money(row.cashout_value),
    placedAt: new Date(String(row.placed_at)).toISOString(),
    settledAt: row.settled_at ? new Date(String(row.settled_at)).toISOString() : null,
    userId: row.user_id ? String(row.user_id) : undefined,
    userName: row.user_name ? String(row.user_name) : undefined,
  };
}

export async function ensureWallet(user: AuthUser) {
  await ensureDatabaseSchema();
  await sql`
    INSERT INTO users (id, name, email, role, password_hash)
    VALUES (${user.id}, ${user.name}, ${user.email}, ${user.role}, 'session-managed')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, role = EXCLUDED.role
  `;
  await sql`INSERT INTO wallets (user_id) VALUES (${user.id}) ON CONFLICT (user_id) DO NOTHING`;
}

export async function getPromotions(): Promise<Promotion[]> {
  await ensureDatabaseSchema();
  const { rows } = await sql`
    SELECT id, type, title, description, config, active
    FROM promotions
    WHERE active = TRUE
      AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
      AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)
    ORDER BY created_at
  `;
  return rows.map((row) => ({ id: row.id, type: row.type, title: row.title, description: row.description, config: row.config ?? {}, active: row.active }));
}

export async function getAccountSnapshot(user: AuthUser): Promise<AccountSnapshot> {
  await ensureWallet(user);
  const [walletResult, betsResult, selectionsResult, transactionsResult, promotions] = await Promise.all([
    sql`SELECT * FROM wallets WHERE user_id = ${user.id} LIMIT 1`,
    sql`SELECT * FROM bets WHERE user_id = ${user.id} ORDER BY placed_at DESC LIMIT 200`,
    sql`SELECT bs.* FROM bet_selections bs JOIN bets b ON b.id = bs.bet_id WHERE b.user_id = ${user.id} ORDER BY bs.id`,
    sql`SELECT * FROM transactions WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 300`,
    getPromotions(),
  ]);
  const wallet = walletResult.rows[0];
  const selectionGroups = new Map<string, BetSelection[]>();
  selectionsResult.rows.forEach((row) => selectionGroups.set(row.bet_id, [...(selectionGroups.get(row.bet_id) ?? []), mapSelection(row)]));
  const xp = Number(wallet?.xp ?? 0);
  const level = loyaltyLevel(xp);
  if (wallet && wallet.level !== level) sql`UPDATE wallets SET level = ${level} WHERE user_id = ${user.id}`.catch(() => undefined);
  return {
    balance: money(wallet?.balance),
    bonus: money(wallet?.bonus_balance),
    cashback: money(wallet?.cashback_balance),
    freeBet: money(wallet?.free_bet_balance),
    xp,
    level,
    bets: betsResult.rows.map((row) => mapBet(row, selectionGroups.get(row.id) ?? [])),
    transactions: transactionsResult.rows.map(mapTransaction),
    promotions,
  };
}

export async function depositToAccount(user: AuthUser, amountInput: number) {
  const amount = clampMoney(amountInput);
  if (!Number.isFinite(amount) || amount < 1 || amount > 100000) throw new Error("Informe um valor entre R$ 1 e R$ 100.000");
  await ensureWallet(user);
  const id = uid("DEP");
  const createdAt = new Date().toISOString();
  await withTransaction(async (client) => {
    await client.sql`UPDATE wallets SET balance = balance + ${amount}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ${user.id}`;
    await client.sql`INSERT INTO transactions (id, user_id, type, description, amount) VALUES (${id}, ${user.id}, 'deposit', 'Depósito', ${amount})`;
  });
  const receipt: ReceiptData = { id, type: "Depósito", amount, createdAt, status: "Aprovado" };
  return { receipt, account: await getAccountSnapshot(user) };
}

export async function withdrawFromAccount(user: AuthUser, amountInput: number, pixKey: string) {
  const amount = clampMoney(amountInput);
  if (!Number.isFinite(amount) || amount < 1 || amount > 100000 || !pixKey.trim()) throw new Error("Informe valor e chave válidos");
  await ensureWallet(user);
  const id = uid("SAQ");
  const createdAt = new Date().toISOString();
  await withTransaction(async (client) => {
    const { rows } = await client.sql`SELECT balance FROM wallets WHERE user_id = ${user.id} FOR UPDATE`;
    if (money(rows[0]?.balance) < amount) throw new Error("Saldo insuficiente");
    await client.sql`UPDATE wallets SET balance = balance - ${amount}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ${user.id}`;
    await client.sql`INSERT INTO transactions (id, user_id, type, description, amount, metadata) VALUES (${id}, ${user.id}, 'withdrawal', 'Saque', ${-amount}, ${JSON.stringify({ pixKey: pixKey.trim().slice(0, 180) })}::jsonb)`;
  });
  const receipt: ReceiptData = { id, type: "Saque", amount, createdAt, status: "Aprovado", pixKey };
  return { receipt, account: await getAccountSnapshot(user) };
}

function accumulatorBoost(totalOdd: number, selectionCount: number, promotions: Promotion[]) {
  const promotion = promotions.find((item) => item.type === "accumulator_boost");
  const tiers = Array.isArray(promotion?.config.tiers) ? promotion.config.tiers as Array<{ minOdd?: number; minSelections?: number; percent?: number }> : [];
  return tiers.reduce((best, tier) => totalOdd >= Number(tier.minOdd ?? Infinity) && selectionCount >= Number(tier.minSelections ?? Infinity) ? Math.max(best, Number(tier.percent ?? 0)) : best, 0);
}

export async function placeAccountBet(user: AuthUser, requestSelections: BetSelection[], stakeInput: number, useFreeBet = false) {
  const stake = clampMoney(stakeInput);
  if (!Number.isFinite(stake) || stake < 1 || stake > 100000) throw new Error("Informe uma stake válida");
  if (!requestSelections.length || requestSelections.length > 20) throw new Error("Selecione entre 1 e 20 mercados");
  await ensureWallet(user);
  const { matches } = await getCombinedFeed();
  const selections: BetSelection[] = requestSelections.map((selection) => {
    const match = matches.find((item) => item.id === selection.matchId);
    if (!match || match.status === "finished") throw new Error(`O jogo ${selection.matchLabel} não está mais disponível`);
    const market = match.markets.find((item) => item.id === selection.marketId);
    const option = market?.options.find((item) => item.id === selection.optionId);
    if (!market || !option) throw new Error(`A odd de ${selection.selectionLabel} mudou ou foi removida`);
    return { ...selection, marketName: market.name, selectionLabel: option.label, odd: option.price, currentOdd: option.price, result: "pending" };
  });
  const correlation = correlationError(selections);
  if (correlation) throw new Error(correlation);
  const totalOdd = Number(selections.reduce((total, selection) => total * selection.odd, 1).toFixed(4));
  const promotions = await getPromotions();
  const boostPercent = accumulatorBoost(totalOdd, selections.length, promotions);
  const grossReturn = stake * totalOdd;
  const baseReturn = useFreeBet ? Math.max(0, grossReturn - stake) : grossReturn;
  const potentialReturn = clampMoney(baseReturn * (1 + boostPercent / 100));
  const id = uid("BET");
  const transactionId = uid("TRX");

  await withTransaction(async (client) => {
    const { rows } = await client.sql`SELECT balance, free_bet_balance, xp FROM wallets WHERE user_id = ${user.id} FOR UPDATE`;
    const wallet = rows[0];
    if (useFreeBet ? money(wallet?.free_bet_balance) < stake : money(wallet?.balance) < stake) throw new Error(useFreeBet ? "Saldo de Free Bet insuficiente" : "Saldo insuficiente");
    const nextXp = Number(wallet?.xp ?? 0) + Math.max(1, Math.floor(stake));
    const nextLevel = loyaltyLevel(nextXp);
    if (useFreeBet) await client.sql`UPDATE wallets SET free_bet_balance = free_bet_balance - ${stake}, xp = ${nextXp}, level = ${nextLevel}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ${user.id}`;
    else await client.sql`UPDATE wallets SET balance = balance - ${stake}, xp = ${nextXp}, level = ${nextLevel}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ${user.id}`;
    await client.sql`
      INSERT INTO bets (id, user_id, stake, total_odd, base_return, potential_return, boost_percent, is_free_bet, metadata)
      VALUES (${id}, ${user.id}, ${stake}, ${totalOdd}, ${clampMoney(baseReturn)}, ${potentialReturn}, ${boostPercent}, ${useFreeBet}, ${JSON.stringify({ source: "sportsbook", selectionCount: selections.length })}::jsonb)
    `;
    for (const selection of selections) {
      await client.sql`
        INSERT INTO bet_selections (id, bet_id, match_id, market_id, option_id, match_label, market_name, selection_label, odd, current_odd)
        VALUES (${`${id}-${selection.id}`.slice(0, 255)}, ${id}, ${selection.matchId}, ${selection.marketId}, ${selection.optionId}, ${selection.matchLabel}, ${selection.marketName}, ${selection.selectionLabel}, ${selection.odd}, ${selection.odd})
      `;
    }
    await client.sql`
      INSERT INTO transactions (id, user_id, type, description, amount, metadata)
      VALUES (${transactionId}, ${user.id}, 'bet', ${`Aposta ${id}`}, ${useFreeBet ? 0 : -stake}, ${JSON.stringify({ betId: id, freeBet: useFreeBet })}::jsonb)
    `;
  });
  return getAccountSnapshot(user);
}

async function loadBetForCashout(userId: string, betId: string) {
  const [betResult, selectionsResult] = await Promise.all([
    sql`SELECT * FROM bets WHERE id = ${betId} AND user_id = ${userId} LIMIT 1`,
    sql`SELECT * FROM bet_selections WHERE bet_id = ${betId}`,
  ]);
  const row = betResult.rows[0];
  if (!row) throw new Error("Aposta não encontrada");
  return mapBet(row, selectionsResult.rows.map(mapSelection));
}

export async function cashoutQuote(user: AuthUser, betId: string) {
  const bet = await loadBetForCashout(user.id, betId);
  if (bet.status !== "pending") throw new Error("Esta aposta não aceita mais cash out");
  const { matches } = await getCombinedFeed();
  let currentTotalOdd = 1;
  let unavailable = 0;
  const updatedSelections = bet.selections.map((selection) => {
    const match = matches.find((item) => item.id === selection.matchId);
    const option = match?.markets.find((item) => item.id === selection.marketId)?.options.find((item) => item.id === selection.optionId);
    if (!option || match?.status === "finished") unavailable += 1;
    const currentOdd = option?.price ?? selection.currentOdd ?? selection.odd;
    currentTotalOdd *= currentOdd;
    return { ...selection, currentOdd };
  });
  if (unavailable === bet.selections.length) throw new Error("Cash out temporariamente indisponível");
  const raw = bet.potentialReturn / Math.max(currentTotalOdd, 1.01) * 0.88;
  const value = clampMoney(Math.min(bet.potentialReturn * 0.92, Math.max(bet.stake * 0.15, raw)));
  return { value, currentTotalOdd: Number(currentTotalOdd.toFixed(4)), selections: updatedSelections, expiresInSeconds: 20 };
}

export async function executeCashout(user: AuthUser, betId: string) {
  const quote = await cashoutQuote(user, betId);
  const transactionId = uid("CSH");
  await withTransaction(async (client) => {
    const { rows } = await client.sql`SELECT status FROM bets WHERE id = ${betId} AND user_id = ${user.id} FOR UPDATE`;
    if (rows[0]?.status !== "pending") throw new Error("A aposta já foi encerrada");
    await client.sql`UPDATE bets SET status = 'cashout', cashout_value = ${quote.value}, settled_at = CURRENT_TIMESTAMP WHERE id = ${betId}`;
    await client.sql`UPDATE wallets SET balance = balance + ${quote.value}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ${user.id}`;
    await client.sql`INSERT INTO transactions (id, user_id, type, description, amount, metadata) VALUES (${transactionId}, ${user.id}, 'cashout', ${`Cash out ${betId}`}, ${quote.value}, ${JSON.stringify({ betId })}::jsonb)`;
  });
  return getAccountSnapshot(user);
}

async function cashbackRate(level: LoyaltyLevel) {
  const promotions = await getPromotions();
  const promo = promotions.find((item) => item.type === "cashback");
  const rates = (promo?.config.rates ?? {}) as Record<string, number>;
  return Number(rates[level] ?? 0);
}

export async function settleBet(betId: string, status: Extract<BetStatus, "green" | "red" | "void">) {
  await ensureDatabaseSchema();
  const { rows } = await sql`SELECT b.*, w.level FROM bets b JOIN wallets w ON w.user_id = b.user_id WHERE b.id = ${betId} LIMIT 1`;
  const bet = rows[0];
  if (!bet) throw new Error("Aposta não encontrada");
  if (bet.status !== "pending") throw new Error("Aposta já liquidada");
  const rate = status === "red" ? await cashbackRate(String(bet.level) as LoyaltyLevel) : 0;
  const credit = status === "green" ? money(bet.potential_return) : status === "void" && !bet.is_free_bet ? money(bet.stake) : 0;
  const cashback = status === "red" ? clampMoney(money(bet.stake) * rate / 100) : 0;
  await withTransaction(async (client) => {
    const locked = await client.sql`SELECT status FROM bets WHERE id = ${betId} FOR UPDATE`;
    if (locked.rows[0]?.status !== "pending") throw new Error("Aposta já liquidada");
    await client.sql`UPDATE bets SET status = ${status}, settled_at = CURRENT_TIMESTAMP WHERE id = ${betId}`;
    await client.sql`UPDATE bet_selections SET result = ${status} WHERE bet_id = ${betId} AND result = 'pending'`;
    await client.sql`UPDATE wallets SET balance = balance + ${credit}, cashback_balance = cashback_balance + ${cashback}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ${bet.user_id}`;
    const type = status === "green" ? "win" : status === "void" ? "refund" : "loss";
    const description = status === "green" ? `Ganho ${betId}` : status === "void" ? `Reembolso ${betId}` : `Perda ${betId}`;
    await client.sql`INSERT INTO transactions (id, user_id, type, description, amount, metadata) VALUES (${uid("TRX")}, ${bet.user_id}, ${type}, ${description}, ${credit}, ${JSON.stringify({ betId })}::jsonb)`;
    if (cashback > 0) await client.sql`INSERT INTO transactions (id, user_id, type, description, amount, metadata) VALUES (${uid("CBK")}, ${bet.user_id}, 'cashback', ${`Cashback ${betId}`}, ${cashback}, ${JSON.stringify({ betId, rate })}::jsonb)`;
  });
  return { userId: String(bet.user_id), credit, cashback };
}

export async function claimCashback(user: AuthUser) {
  await ensureWallet(user);
  await withTransaction(async (client) => {
    const { rows } = await client.sql`SELECT cashback_balance FROM wallets WHERE user_id = ${user.id} FOR UPDATE`;
    const amount = money(rows[0]?.cashback_balance);
    if (amount <= 0) throw new Error("Você ainda não possui cashback disponível");
    await client.sql`UPDATE wallets SET balance = balance + ${amount}, cashback_balance = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ${user.id}`;
    await client.sql`INSERT INTO transactions (id, user_id, type, description, amount) VALUES (${uid("CBK")}, ${user.id}, 'cashback', 'Cashback resgatado', ${amount})`;
  });
  return getAccountSnapshot(user);
}

export async function listAdminBets() {
  await ensureDatabaseSchema();
  const [betsResult, selectionsResult] = await Promise.all([
    sql`SELECT b.*, u.name AS user_name FROM bets b JOIN users u ON u.id = b.user_id WHERE b.status = 'pending' ORDER BY b.placed_at DESC LIMIT 300`,
    sql`SELECT bs.* FROM bet_selections bs JOIN bets b ON b.id = bs.bet_id WHERE b.status = 'pending' ORDER BY bs.id`,
  ]);
  const groups = new Map<string, BetSelection[]>();
  selectionsResult.rows.forEach((row) => groups.set(row.bet_id, [...(groups.get(row.bet_id) ?? []), mapSelection(row)]));
  return betsResult.rows.map((row) => mapBet(row, groups.get(row.id) ?? []));
}

export async function listUsers() {
  await ensureDatabaseSchema();
  const { rows } = await sql`
    SELECT u.id, u.name, u.email, u.role, w.balance, w.bonus_balance, w.cashback_balance, w.free_bet_balance, w.xp, w.level
    FROM users u JOIN wallets w ON w.user_id = u.id
    ORDER BY u.created_at DESC
  `;
  return rows.map((row) => ({ ...row, balance: money(row.balance), bonus: money(row.bonus_balance), cashback: money(row.cashback_balance), freeBet: money(row.free_bet_balance), xp: Number(row.xp) }));
}

export async function setUserBalance(userId: string, amountInput: number) {
  const amount = clampMoney(amountInput);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1000000) throw new Error("Saldo inválido");
  await ensureDatabaseSchema();
  await withTransaction(async (client) => {
    const { rows } = await client.sql`SELECT balance FROM wallets WHERE user_id = ${userId} FOR UPDATE`;
    if (!rows[0]) throw new Error("Usuário não encontrado");
    const delta = Number((amount - money(rows[0].balance)).toFixed(2));
    await client.sql`UPDATE wallets SET balance = ${amount}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ${userId}`;
    await client.sql`INSERT INTO transactions (id, user_id, type, description, amount) VALUES (${uid("ADM")}, ${userId}, 'admin', 'Ajuste administrativo', ${delta})`;
  });
}

export async function importLegacyAccount(user: AuthUser, legacy: Partial<AccountSnapshot>) {
  await ensureWallet(user);
  const already = await sql`SELECT user_id FROM legacy_imports WHERE user_id = ${user.id}`;
  if (already.rows.length) return getAccountSnapshot(user);
  const current = await getAccountSnapshot(user);
  if (current.bets.length || current.transactions.length || current.balance || current.bonus) {
    await sql`INSERT INTO legacy_imports (user_id) VALUES (${user.id}) ON CONFLICT DO NOTHING`;
    return current;
  }
  const balance = clampMoney(Number(legacy.balance ?? 0));
  const bonus = clampMoney(Number(legacy.bonus ?? 0));
  await withTransaction(async (client) => {
    await client.sql`UPDATE wallets SET balance = ${balance}, bonus_balance = ${bonus}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ${user.id}`;
    for (const transaction of (legacy.transactions ?? []).slice(0, 300)) {
      await client.sql`
        INSERT INTO transactions (id, user_id, type, description, amount, status, created_at, metadata)
        VALUES (${`${user.id}-${transaction.id}`.slice(0, 255)}, ${user.id}, ${transaction.type}, ${transaction.description}, ${transaction.amount}, ${transaction.status}, ${transaction.createdAt}, '{"source":"legacy-browser"}'::jsonb)
        ON CONFLICT DO NOTHING
      `;
    }
    for (const bet of (legacy.bets ?? []).slice(0, 200)) {
      const betId = `${user.id}-${bet.id}`.slice(0, 255);
      await client.sql`
        INSERT INTO bets (id, user_id, stake, total_odd, base_return, potential_return, boost_percent, status, is_free_bet, placed_at, metadata)
        VALUES (${betId}, ${user.id}, ${bet.stake}, ${bet.totalOdd}, ${bet.baseReturn ?? bet.potentialReturn}, ${bet.potentialReturn}, ${bet.boostPercent ?? 0}, ${bet.status}, ${bet.isFreeBet ?? false}, ${bet.placedAt}, '{"source":"legacy-browser"}'::jsonb)
        ON CONFLICT DO NOTHING
      `;
      for (const selection of bet.selections) {
        await client.sql`
          INSERT INTO bet_selections (id, bet_id, match_id, market_id, option_id, match_label, market_name, selection_label, odd, result)
          VALUES (${`${betId}-${selection.id}`.slice(0, 255)}, ${betId}, ${selection.matchId}, ${selection.marketId}, ${selection.optionId}, ${selection.matchLabel}, ${selection.marketName}, ${selection.selectionLabel}, ${selection.odd}, ${selection.result ?? "pending"})
          ON CONFLICT DO NOTHING
        `;
      }
    }
    await client.sql`INSERT INTO legacy_imports (user_id) VALUES (${user.id}) ON CONFLICT DO NOTHING`;
  });
  return getAccountSnapshot(user);
}
