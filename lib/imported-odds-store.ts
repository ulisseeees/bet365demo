import "server-only";
import { sql } from "@vercel/postgres";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Match } from "./types";
import { ensureDatabaseSchema } from "./database";

const dataDirectory = path.join(process.cwd(), "data");
const importedPath = path.join(dataDirectory, "imported-odds.json");
const maximumPastEventAgeMs = 8 * 60 * 60 * 1000;

function currentEvents(matches: Match[]) {
  const cutoff = Date.now() - maximumPastEventAgeMs;
  return matches.filter((match) => !match.kickoffAt || new Date(match.kickoffAt).getTime() >= cutoff);
}

export async function readImportedOdds(): Promise<Match[]> {
  await ensureDatabaseSchema();
  try {
    const { rows } = await sql`
      SELECT match_data FROM imported_matches
      WHERE kickoff_at IS NULL OR kickoff_at >= CURRENT_TIMESTAMP - INTERVAL '8 hours'
      ORDER BY updated_at DESC;
    `;
    
    if (rows.length > 0) {
      return rows.map((row) => row.match_data as Match);
    }
  } catch {
    // Em desenvolvimento local, o JSON ainda serve como recuperação de emergência.
  }

  // 2. PLANO DE RESERVA: Se o banco estiver vazio, lê o arquivo JSON que você enviou
  try {
    return currentEvents(JSON.parse(await readFile(importedPath, "utf8")) as Match[]);
  } catch {
    return [];
  }
}

export async function upsertImportedOdd(match: Match) {
  await ensureDatabaseSchema();
  const kickoffAt = match.kickoffAt ? new Date(match.kickoffAt).toISOString() : null;
  const matchDataJson = JSON.stringify(match);

  await sql`
    INSERT INTO imported_matches (id, kickoff_at, status, match_data)
    VALUES (${match.id}, ${kickoffAt}, ${match.status}, ${matchDataJson}::jsonb)
    ON CONFLICT (id) DO UPDATE 
    SET 
      kickoff_at = EXCLUDED.kickoff_at,
      status = EXCLUDED.status,
      match_data = EXCLUDED.match_data,
      updated_at = CURRENT_TIMESTAMP;
  `;

  return readImportedOdds();
}
