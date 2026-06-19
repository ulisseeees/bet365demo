import type { BetSelection } from "./types";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const threshold = (label: string) => {
  const match = label.replace(",", ".").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
};

export function correlationError(selections: BetSelection[]) {
  for (let leftIndex = 0; leftIndex < selections.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < selections.length; rightIndex += 1) {
      const left = selections[leftIndex];
      const right = selections[rightIndex];
      if (left.matchId !== right.matchId) continue;
      const leftMarket = normalize(left.marketName);
      const rightMarket = normalize(right.marketName);
      const leftLabel = normalize(left.selectionLabel);
      const rightLabel = normalize(right.selectionLabel);
      if (left.marketId === right.marketId) return `Escolha apenas uma opção em ${left.marketName}.`;
      const leftWinner = leftMarket.includes("resultado") || leftMarket.includes("vencedor");
      const rightWinner = rightMarket.includes("resultado") || rightMarket.includes("vencedor");
      const leftDouble = leftMarket.includes("dupla chance");
      const rightDouble = rightMarket.includes("dupla chance");
      if ((leftWinner && rightDouble && rightLabel.includes(leftLabel)) || (rightWinner && leftDouble && leftLabel.includes(rightLabel))) return "Vitória e dupla chance da mesma equipe são seleções correlacionadas.";
      const leftExact = leftMarket.includes("placar exato");
      const rightExact = rightMarket.includes("placar exato");
      const resultRelated = (market: string) => market.includes("resultado") || market.includes("dupla chance") || market.includes("ambas marcam") || market.includes("total de gols");
      if ((leftExact && resultRelated(rightMarket)) || (rightExact && resultRelated(leftMarket))) return "Placar exato não pode ser combinado com mercados derivados do mesmo jogo.";
      const leftTotal = leftMarket.includes("total de gols") || leftMarket.includes("linha de gols");
      const rightTotal = rightMarket.includes("total de gols") || rightMarket.includes("linha de gols");
      const leftDirection = leftLabel.includes("mais de") ? "over" : leftLabel.includes("menos de") ? "under" : null;
      const rightDirection = rightLabel.includes("mais de") ? "over" : rightLabel.includes("menos de") ? "under" : null;
      if (leftTotal && rightTotal && leftDirection && leftDirection === rightDirection && threshold(leftLabel) !== threshold(rightLabel)) return "Linhas de gols na mesma direção são correlacionadas.";
      return "Combinações do mesmo jogo exigem uma odd conjunta do provedor. Escolha apenas uma seleção por partida.";
    }
  }
  return null;
}
