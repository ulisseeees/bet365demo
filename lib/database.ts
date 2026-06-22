import "server-only";

import { sql, type VercelPoolClient } from "@vercel/postgres";

let schemaPromise: Promise<void> | null = null;

async function createSchema() {
  const ready = await sql`
    SELECT
      to_regclass('public.wallets') AS wallets,
      to_regclass('public.bets') AS bets,
      to_regclass('public.provider_cache') AS provider_cache,
      to_regclass('public.tracked_matches') AS tracked_matches,
      to_regclass('public.super_odds') AS super_odds,
      to_regclass('public.missions') AS missions,
      to_regclass('public.user_missions') AS user_missions,
      to_regclass('public.highlightly_tracking') AS highlightly_tracking,
      to_regclass('public.home_banners') AS home_banners
  `;
  if (ready.rows[0]?.wallets && ready.rows[0]?.bets && ready.rows[0]?.provider_cache && ready.rows[0]?.tracked_matches && ready.rows[0]?.super_odds && ready.rows[0]?.missions && ready.rows[0]?.user_missions && ready.rows[0]?.highlightly_tracking && ready.rows[0]?.home_banners) return;

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'user',
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS wallets (
      user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      balance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
      bonus_balance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (bonus_balance >= 0),
      cashback_balance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cashback_balance >= 0),
      free_bet_balance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (free_bet_balance >= 0),
      xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
      level VARCHAR(30) NOT NULL DEFAULT 'Bronze',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      description TEXT NOT NULL,
      amount NUMERIC(14,2) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'approved',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS transactions_user_created_idx ON transactions(user_id, created_at DESC)`;

  await sql`
    CREATE TABLE IF NOT EXISTS bets (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stake NUMERIC(14,2) NOT NULL CHECK (stake > 0),
      total_odd NUMERIC(14,4) NOT NULL CHECK (total_odd > 1),
      base_return NUMERIC(14,2) NOT NULL,
      potential_return NUMERIC(14,2) NOT NULL,
      boost_percent NUMERIC(7,2) NOT NULL DEFAULT 0,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      is_free_bet BOOLEAN NOT NULL DEFAULT FALSE,
      cashout_value NUMERIC(14,2),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      placed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      settled_at TIMESTAMPTZ
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS bets_user_placed_idx ON bets(user_id, placed_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS bets_status_idx ON bets(status, placed_at DESC)`;

  await sql`
    CREATE TABLE IF NOT EXISTS bet_selections (
      id VARCHAR(255) PRIMARY KEY,
      bet_id VARCHAR(255) NOT NULL REFERENCES bets(id) ON DELETE CASCADE,
      match_id VARCHAR(255) NOT NULL,
      market_id VARCHAR(255) NOT NULL,
      option_id VARCHAR(255) NOT NULL,
      match_label TEXT NOT NULL,
      market_name TEXT NOT NULL,
      selection_label TEXT NOT NULL,
      odd NUMERIC(14,4) NOT NULL,
      current_odd NUMERIC(14,4),
      result VARCHAR(30) NOT NULL DEFAULT 'pending',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS bet_selections_match_idx ON bet_selections(match_id, result)`;

  await sql`
    CREATE TABLE IF NOT EXISTS promotions (
      id VARCHAR(255) PRIMARY KEY,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS super_odds (
      id VARCHAR(255) PRIMARY KEY,
      match_id VARCHAR(255) NOT NULL,
      market_id VARCHAR(255) NOT NULL,
      option_id VARCHAR(255) NOT NULL,
      original_price NUMERIC(14,4) NOT NULL,
      boosted_price NUMERIC(14,4) NOT NULL,
      label VARCHAR(255),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(match_id, market_id, option_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS tracked_matches (
      match_id VARCHAR(255) PRIMARY KEY,
      provider VARCHAR(50) NOT NULL,
      external_id VARCHAR(255) NOT NULL,
      sport_key VARCHAR(255),
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      check_interval_seconds INTEGER NOT NULL DEFAULT 60,
      last_status VARCHAR(30),
      last_score_home INTEGER,
      last_score_away INTEGER,
      last_checked_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS imported_matches (
      id VARCHAR(255) PRIMARY KEY,
      kickoff_at TIMESTAMPTZ,
      status VARCHAR(30) NOT NULL,
      match_data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS provider_cache (
      cache_key VARCHAR(255) PRIMARY KEY,
      provider VARCHAR(50) NOT NULL,
      data JSONB NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      expires_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS legacy_imports (
      user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS missions (
      id VARCHAR(255) PRIMARY KEY,
      type VARCHAR(80) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      target NUMERIC(14,2) NOT NULL CHECK (target > 0),
      reward NUMERIC(14,2) NOT NULL CHECK (reward >= 0),
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS user_missions (
      user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mission_id VARCHAR(255) NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
      progress NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (progress >= 0),
      completed_at TIMESTAMPTZ,
      rewarded_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, mission_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS highlightly_tracking (
      match_id VARCHAR(255) PRIMARY KEY,
      highlightly_id BIGINT,
      home_name VARCHAR(255) NOT NULL,
      away_name VARCHAR(255) NOT NULL,
      kickoff_at TIMESTAMPTZ,
      status VARCHAR(40) NOT NULL DEFAULT 'unresolved',
      live_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      resolved_at TIMESTAMPTZ,
      last_polled_at TIMESTAMPTZ,
      next_poll_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS highlightly_tracking_provider_idx ON highlightly_tracking(highlightly_id)`;
  await sql`CREATE INDEX IF NOT EXISTS highlightly_tracking_poll_idx ON highlightly_tracking(status, next_poll_at)`;

  await sql`
    CREATE TABLE IF NOT EXISTS home_banners (
      id VARCHAR(255) PRIMARY KEY,
      kind VARCHAR(40) NOT NULL,
      title VARCHAR(255) NOT NULL,
      subtitle TEXT NOT NULL,
      cta_label VARCHAR(100) NOT NULL DEFAULT 'Ver oferta',
      tone VARCHAR(30) NOT NULL DEFAULT 'orange',
      sort_order INTEGER NOT NULL DEFAULT 0,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`
    INSERT INTO promotions (id, type, title, description, config)
    VALUES
      ('PROMO-ACC-5', 'accumulator_boost', 'Múltipla Turbo', 'Bônus progressivo para múltiplas elegíveis.', '{"tiers":[{"minOdd":5,"minSelections":3,"percent":5},{"minOdd":10,"minSelections":4,"percent":10},{"minOdd":20,"minSelections":5,"percent":15}]}'::jsonb),
      ('PROMO-CASHBACK', 'cashback', 'Cashback por nível', 'Parte das perdas retorna para a carteira de cashback.', '{"rates":{"Bronze":1,"Prata":1.5,"Ouro":2,"Platina":3,"Diamante":5}}'::jsonb),
      ('PROMO-WELCOME', 'free_bet', 'Free Bet de boas-vindas', 'Crédito promocional para explorar a plataforma.', '{"amount":10}'::jsonb)
    ON CONFLICT (id) DO NOTHING
  `;

  await sql`
    INSERT INTO missions (id, type, title, description, target, reward, config)
    VALUES (
      'MISSION-WORLD-CUP-50',
      'world_cup_stake',
      'Rota da Copa',
      'Aposte R$ 50 em eventos da Copa do Mundo com odd total mínima de 2,00 e receba R$ 25 em Free Bet.',
      50,
      25,
      '{"minOdd":2,"competitionTerms":["world cup","copa do mundo"]}'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      target = EXCLUDED.target,
      reward = EXCLUDED.reward,
      config = EXCLUDED.config,
      active = TRUE
  `;

  await sql`
    INSERT INTO home_banners (id, kind, title, subtitle, cta_label, tone, sort_order)
    VALUES
      ('BANNER-SUPER', 'super_odd', 'Super Odd ativa', 'As melhores cotações destacadas em um só lugar.', 'Ver mercado', 'orange', 1),
      ('BANNER-VIP', 'vip', 'Arena Club', 'Cashback, níveis e benefícios exclusivos.', 'Abrir clube', 'gold', 2),
      ('BANNER-MISSION', 'mission', 'Missão da semana', 'Complete desafios e desbloqueie Free Bets.', 'Ver missão', 'cyan', 3)
    ON CONFLICT (id) DO NOTHING
  `;

  const adminEmail = (process.env.ADMIN_EMAIL || "admin@arenaodds.local").toLowerCase();
  await sql`
    INSERT INTO users (id, name, email, role, password_hash)
    VALUES ('ADMIN-LOCAL', 'Administrador', ${adminEmail}, 'admin', 'managed-by-environment')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, role = 'admin'
  `;

  await sql`
    INSERT INTO wallets (user_id)
    SELECT id FROM users
    ON CONFLICT (user_id) DO NOTHING
  `;
}

export function ensureDatabaseSchema() {
  if (!schemaPromise) schemaPromise = createSchema().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

export async function withTransaction<T>(callback: (client: VercelPoolClient) => Promise<T>) {
  const client = await sql.connect();
  try {
    await client.sql`BEGIN`;
    const result = await callback(client);
    await client.sql`COMMIT`;
    return result;
  } catch (error) {
    await client.sql`ROLLBACK`;
    throw error;
  } finally {
    client.release();
  }
}
