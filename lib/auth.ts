import "server-only";
import { sql } from "@vercel/postgres";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { AuthUser } from "./types";

const secret = process.env.AUTH_SECRET || "arenaodds-local-development-secret-change-me";

function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function passwordMatches(password: string, passwordHash: string) {
  const [salt, stored] = passwordHash.split(":");
  if (!salt || !stored) return false;
  const expected = Buffer.from(stored, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function registerUser(name: string, email: string, password: string): Promise<AuthUser> {
  const normalizedEmail = email.trim().toLowerCase();

  // Cria a tabela no banco de dados automaticamente se não existir
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      role VARCHAR(50) DEFAULT 'user',
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  if (normalizedEmail === (process.env.ADMIN_EMAIL || "admin@arenaodds.local").toLowerCase()) {
    throw new Error("Este e-mail já está cadastrado.");
  }

  // Verifica se o e-mail já existe
  const existingUser = await sql`SELECT email FROM users WHERE email = ${normalizedEmail};`;
  
  // SOLUÇÃO: Usamos rows.length em vez de rowCount. O TypeScript aprova isso 100%!
  if (existingUser.rows.length > 0) {
    throw new Error("Este e-mail já está cadastrado.");
  }

  const id = `USR-${randomBytes(6).toString("hex").toUpperCase()}`;
  const passwordHash = hashPassword(password);

  // Salva o usuário no banco de dados Neon
  await sql`
    INSERT INTO users (id, name, email, role, password_hash)
    VALUES (${id}, ${name.trim()}, ${normalizedEmail}, 'user', ${passwordHash});
  `;

  return { id, name: name.trim(), email: normalizedEmail, role: "user" };
}

export async function authenticateUser(email: string, password: string): Promise<AuthUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@arenaodds.local").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "ArenaAdmin#2026";

  if (normalizedEmail === adminEmail && password === adminPassword) {
    return { id: "ADMIN-LOCAL", name: "Administrador", email: adminEmail, role: "admin" };
  }

  try {
    const { rows } = await sql`SELECT * FROM users WHERE email = ${normalizedEmail} LIMIT 1;`;
    const user = rows[0];

    if (!user || !passwordMatches(password, user.password_hash)) return null;

    return { id: user.id, name: user.name, email: user.email, role: user.role };
  } catch (error) {
    return null;
  }
}

export function createSessionToken(user: AuthUser) {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySessionToken(token?: string): AuthUser | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AuthUser & { exp: number };
    if (decoded.exp < Date.now()) return null;
    return { id: decoded.id, name: decoded.name, email: decoded.email, role: decoded.role };
  } catch {
    return null;
  }
}

export const sessionCookie = {
  name: "arenaodds_session",
  options: { httpOnly: true, sameSite: "lax" as const, secure: process.env.COOKIE_SECURE === "true", path: "/", maxAge: 60 * 60 * 24 * 7 },
};