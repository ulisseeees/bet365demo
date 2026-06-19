import "server-only";
import { sql } from "@vercel/postgres";
import type { Match } from "./types";

// Função para LER os jogos guardados na base de dados
export async function readImportedOdds(): Promise<Match[]> {
  try {
    // Busca todas as partidas na base de dados, ordenadas das mais recentes para as mais antigas
    const { rows } = await sql`
      SELECT match_data FROM imported_matches
      ORDER BY updated_at DESC;
    `;
    
    // Converte a coluna match_data de volta para a estrutura de dados (Match) do site
    return rows.map((row) => row.match_data as Match);
  } catch (error) {
    // Se ocorrer algum erro (ex: base de dados offline), devolve uma lista vazia para não quebrar o site
    return [];
  }
}

// Função para GUARDAR ou ATUALIZAR um jogo (UPSERT)
export async function upsertImportedOdd(match: Match) {
  // 1. Extrai a data do jogo para podermos filtrar mais tarde, se necessário
  const kickoffAt = match.kickoffAt ? new Date(match.kickoffAt).toISOString() : null;
  
  // 2. Transforma o objeto do jogo completo em texto para ser aceite pela coluna JSONB
  const matchDataJson = JSON.stringify(match);

  // 3. O comando Mágico: Insere o jogo. Se o ID já existir, apenas atualiza os dados!
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

  // 4. Devolve a lista atualizada com todos os jogos
  return readImportedOdds();
}