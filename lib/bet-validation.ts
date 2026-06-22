import type { BetSelection } from "./types";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const threshold = (label: string) => {
  const match = label.replace(",", ".").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
};

const isFullTimeWinner = (market: string) => (market.includes("resultado da partida") || market === "match winner") && !market.includes("tempo");
const isDoubleChance = (market: string) => market.includes("dupla chance");
const isDrawNoBet = (market: string) => market.includes("empate anula") || market.includes("vencedor sem empate");
const isExactScore = (market: string) => market.includes("placar exato") || market.includes("placar final");
const isFullTimeTotal = (market: string) => (market.includes("total de gols") || market.includes("linha de gols")) && !market.includes("tempo") && !market.includes("equipe");
const direction = (label: string) => label.includes("mais de") ? "over" : label.includes("menos de") ? "under" : null;

function winnerAndProtectedMarketError(winnerLabel: string, protectedLabel: string, protectedMarket: string) {
  const sameOutcome = protectedLabel.includes(winnerLabel) || (winnerLabel.includes("empate") && protectedLabel.includes("empate"));
  return sameOutcome
    ? `“${winnerLabel}” e “${protectedLabel}” em ${protectedMarket} repetem o mesmo resultado.`
    : `“${winnerLabel}” e “${protectedLabel}” não podem acontecer juntas no mesmo jogo.`;
}

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
      const leftWinner = isFullTimeWinner(leftMarket);
      const rightWinner = isFullTimeWinner(rightMarket);
      const leftProtected = isDoubleChance(leftMarket) || isDrawNoBet(leftMarket);
      const rightProtected = isDoubleChance(rightMarket) || isDrawNoBet(rightMarket);
      if (leftWinner && rightProtected) return winnerAndProtectedMarketError(leftLabel, rightLabel, right.marketName);
      if (rightWinner && leftProtected) return winnerAndProtectedMarketError(rightLabel, leftLabel, left.marketName);
      const leftExact = isExactScore(leftMarket);
      const rightExact = isExactScore(rightMarket);
      const resultRelated = (market: string) => isFullTimeWinner(market) || isDoubleChance(market) || isDrawNoBet(market) || market.includes("ambas marcam") || isFullTimeTotal(market);
      if ((leftExact && resultRelated(rightMarket)) || (rightExact && resultRelated(leftMarket))) return "Placar exato não pode ser combinado com mercados derivados do mesmo jogo.";
      const leftTotal = isFullTimeTotal(leftMarket);
      const rightTotal = isFullTimeTotal(rightMarket);
      const leftDirection = direction(leftLabel);
      const rightDirection = direction(rightLabel);
      const leftLine = threshold(leftLabel);
      const rightLine = threshold(rightLabel);
      if (leftTotal && rightTotal && leftDirection && rightDirection && leftLine != null && rightLine != null) {
        if (leftDirection === rightDirection && leftLine !== rightLine) return "Essas linhas de gols repetem a mesma condição. Mantenha apenas uma delas.";
        const overLine = leftDirection === "over" ? leftLine : rightLine;
        const underLine = leftDirection === "under" ? leftLine : rightLine;
        if (leftDirection !== rightDirection && overLine >= underLine) return "Essas linhas de gols são incompatíveis entre si.";
      }
      const leftBttsYes = leftMarket.includes("ambas marcam") && leftLabel === "sim";
      const rightBttsYes = rightMarket.includes("ambas marcam") && rightLabel === "sim";
      if ((leftBttsYes && rightTotal && rightDirection === "under" && (rightLine ?? Infinity) < 2) || (rightBttsYes && leftTotal && leftDirection === "under" && (leftLine ?? Infinity) < 2)) {
        return "Ambas marcam: Sim é incompatível com menos de 1,5 gols.";
      }
    }
  }
  return null;
}
