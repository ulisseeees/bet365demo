import type { BetStatus, MatchStatus } from "@/lib/types";

type Status = BetStatus | MatchStatus | "approved" | "offline" | "api";

const labels: Record<Status, string> = {
  live: "Ao vivo",
  upcoming: "Pré-jogo",
  finished: "Encerrado",
  pending: "Pendente",
  green: "Green",
  red: "Red",
  void: "Anulada",
  approved: "Aprovado",
  offline: "Feed indisponível",
  api: "Odds reais",
};

export function StatusBadge({ status, pulse = false }: { status: Status; pulse?: boolean }) {
  return <span className={`status-badge status-${status} ${pulse ? "status-pulse" : ""}`}>{labels[status]}</span>;
}
