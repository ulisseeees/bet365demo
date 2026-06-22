"use client";

import { Activity, CircleDot, Clock3, Radio, RefreshCw, ShieldCheck, Star } from "lucide-react";
import type { LiveMatchSnapshot } from "@/lib/types";

const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function displayValue(value: number | null) {
  return value == null ? "—" : Number.isInteger(value) ? String(value) : value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export function LiveMatchCenter({ snapshot }: { snapshot: LiveMatchSnapshot }) {
  if (!snapshot.resolved) {
    return <section className="live-center live-center-sync"><RefreshCw className="spin" size={18} /><span><strong>Sincronizando acompanhamento</strong><small>{snapshot.home} × {snapshot.away} será vinculado automaticamente próximo ao horário do jogo.</small></span></section>;
  }

  const preferred = ["possession", "shots on target", "total shots", "corner", "foul", "yellow card"];
  const statistics = [...snapshot.statistics].sort((left, right) => {
    const leftIndex = preferred.findIndex((term) => normalized(left.name).includes(term));
    const rightIndex = preferred.findIndex((term) => normalized(right.name).includes(term));
    return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex);
  }).slice(0, 6);
  const events = [...snapshot.events].reverse().slice(0, 6);
  const homePlayers = snapshot.topPlayers.filter((player) => player.team === "home").slice(0, 2);
  const awayPlayers = snapshot.topPlayers.filter((player) => player.team === "away").slice(0, 2);

  return (
    <section className={`live-center ${snapshot.status === "live" ? "is-live" : ""}`}>
      <header className="live-center-head">
        <span className="live-source"><Activity size={15} /><span><strong>Central da partida</strong><small>Dados sincronizados pela Highlightly</small></span></span>
        <span className={`live-state ${snapshot.status}`}><Radio size={12} />{snapshot.status === "live" ? `${snapshot.clock ?? 0}' • AO VIVO` : snapshot.status === "finished" ? "ENCERRADO" : snapshot.statusLabel}</span>
      </header>

      <div className="live-scoreboard">
        <span><small>CASA</small><strong>{snapshot.home}</strong></span>
        <div><strong>{snapshot.score ? `${snapshot.score[0]}  ×  ${snapshot.score[1]}` : "VS"}</strong><small><Clock3 size={11} /> {snapshot.statusLabel}</small></div>
        <span className="away"><small>FORA</small><strong>{snapshot.away}</strong></span>
      </div>

      <div className="pressure-map">
        <div className="pressure-title"><span><CircleDot size={13} /> Mapa de pressão</span><small>Baseado em posse e finalizações reais</small></div>
        <div className="pressure-field">
          <i className="field-center" />
          <span className="home-pressure" style={{ width: `${snapshot.pressure.home}%` }} />
          <span className="away-pressure" style={{ width: `${snapshot.pressure.away}%` }} />
          <b className="home-pressure-value">{snapshot.pressure.home}%</b><b className="away-pressure-value">{snapshot.pressure.away}%</b>
        </div>
      </div>

      {statistics.length > 0 && <div className="live-stat-list">{statistics.map((statistic) => <div key={statistic.name}><b>{displayValue(statistic.home)}</b><span>{statistic.name}</span><b>{displayValue(statistic.away)}</b></div>)}</div>}

      {(events.length > 0 || snapshot.topPlayers.length > 0) && <div className="live-detail-grid">
        <div className="live-timeline"><strong>Últimos acontecimentos</strong>{events.length ? events.map((event, index) => <div key={`${event.time}-${event.type}-${index}`}><time>{event.time || "—"}</time><span><b>{event.type}</b><small>{event.player || event.team}{event.assist ? ` • Assistência: ${event.assist}` : ""}</small></span></div>) : <small>Aguardando eventos da partida.</small>}</div>
        <div className="live-players"><strong>Destaques ao vivo</strong>{[...homePlayers, ...awayPlayers].map((player) => <div key={`${player.team}-${player.name}`}><span><Star size={12} /><span><b>{player.name}</b><small>{player.position ?? (player.team === "home" ? snapshot.home : snapshot.away)}</small></span></span>{player.rating && <em>{player.rating}</em>}</div>)}</div>
      </div>}

      <footer className="live-center-foot"><span><ShieldCheck size={12} /> Somente partidas presentes em apostas pendentes são consultadas.</span><small>{snapshot.lastUpdatedAt ? `Atualizado ${new Date(snapshot.lastUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Aguardando primeira atualização"}{snapshot.quota?.remaining != null ? ` • ${snapshot.quota.remaining}/${snapshot.quota.limit ?? "—"} chamadas restantes` : ""}</small></footer>
    </section>
  );
}
