import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Match } from "./types";

const dataDirectory = path.join(process.cwd(), "data");
const importedPath = path.join(dataDirectory, "imported-odds.json");

export async function readImportedOdds(): Promise<Match[]> {
  try {
    return JSON.parse(await readFile(importedPath, "utf8")) as Match[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function upsertImportedOdd(match: Match) {
  const current = await readImportedOdds();
  const next = [match, ...current.filter((item) => item.id !== match.id)];
  await mkdir(dataDirectory, { recursive: true });
  const temporaryPath = `${importedPath}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(next, null, 2), "utf8");
  await rename(temporaryPath, importedPath);
  return next;
}
