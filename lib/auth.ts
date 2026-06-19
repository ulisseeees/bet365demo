import "server-only";

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AuthUser } from "./types";

interface StoredUser extends AuthUser {
  passwordHash: string;
  createdAt: string;
}

const dataDirectory = path.join(process.cwd(), "data");
const usersPath = path.join(dataDirectory, "users.json");
const secret = process.env.AUTH_SECRET || "arenaodds-local-development-secret-change-me";

async function readUsers(): Promise<StoredUser[]> {
  try {
    const content = await readFile(usersPath, "utf8");
    return JSON.parse(content) as StoredUser[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeUsers(users: StoredUser[]) {
  await mkdir(dataDirectory, { recursive: true });
  const temporaryPath = `${usersPath}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(users, null, 2), "utf8");
  await rename(temporaryPath, usersPath);
}

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
  const users = await readUsers();
  if (users.some((user) => user.email === normalizedEmail) || normalizedEmail === (process.env.ADMIN_EMAIL || "admin@arenaodds.local").toLowerCase()) {
    throw new Error("Este e-mail já está cadastrado.");
  }
  const user: StoredUser = {
    id: `USR-${randomBytes(6).toString("hex").toUpperCase()}`,
    name: name.trim(),
    email: normalizedEmail,
    role: "user",
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  await writeUsers([...users, user]);
  const { passwordHash: _passwordHash, createdAt: _createdAt, ...safeUser } = user;
  void _passwordHash;
  void _createdAt;
  return safeUser;
}

export async function authenticateUser(email: string, password: string): Promise<AuthUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@arenaodds.local").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "ArenaAdmin#2026";
  if (normalizedEmail === adminEmail && password === adminPassword) {
    return { id: "ADMIN-LOCAL", name: "Administrador", email: adminEmail, role: "admin" };
  }
  const user = (await readUsers()).find((item) => item.email === normalizedEmail);
  if (!user || !passwordMatches(password, user.passwordHash)) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
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
