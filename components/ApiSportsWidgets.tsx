"use client";

import { AlertTriangle, CheckCircle2, ExternalLink, LoaderCircle, Radio, ShieldCheck } from "lucide-react";
import { createElement, useEffect, useState } from "react";

const WIDGET_SCRIPT = "https://widgets.api-sports.io/3.1.0/widgets.js";
const DEFAULT_WIDGET_TOKEN = "arenaodds-local-widget";

type ConfigurationState = "checking" | "ready" | "missing" | "error";
type ScriptState = "loading" | "ready" | "error";

export function ApiSportsWidgets() {
  const [configuration, setConfiguration] = useState<ConfigurationState>("checking");
  const [scriptState, setScriptState] = useState<ScriptState>("loading");
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  useEffect(() => {
    let active = true;

    fetch("/api/widgets/config", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("config");
        return response.json() as Promise<{ configured: boolean }>;
      })
      .then((payload) => {
        if (active) setConfiguration(payload.configured ? "ready" : "missing");
      })
      .catch(() => {
        if (active) setConfiguration("error");
      });

    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (configuration !== "ready") return;

    let active = true;
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${WIDGET_SCRIPT}"]`);
    const script = existing ?? document.createElement("script");

    if (!existing) {
      script.type = "module";
      script.src = WIDGET_SCRIPT;
      document.head.appendChild(script);
    }

    const timeout = window.setTimeout(() => {
      if (active && !customElements.get("api-sports-widget")) setScriptState("error");
    }, 12_000);

    customElements.whenDefined("api-sports-widget").then(() => {
      if (active) {
        window.clearTimeout(timeout);
        setScriptState("ready");
      }
    });

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [configuration]);

  if (configuration === "checking") {
    return <div className="widget-state-card"><LoaderCircle className="spin" /><strong>Verificando a conexão com a API-Sports...</strong></div>;
  }

  if (configuration === "missing") {
    return (
      <section className="widget-setup-card">
        <span className="widget-setup-icon"><AlertTriangle size={24} /></span>
        <div>
          <span className="eyebrow">CONFIGURAÇÃO NECESSÁRIA</span>
          <h2>Conecte sua chave da API-Football</h2>
          <p>A chave fica somente no servidor. Crie o arquivo <code>.env.local</code>, adicione a variável abaixo e reinicie o Next.js.</p>
          <pre>API_FOOTBALL_KEY=sua_chave_aqui</pre>
          <a href="https://dashboard.api-football.com/" target="_blank" rel="noreferrer">Abrir dashboard API-Sports <ExternalLink size={14} /></a>
        </div>
      </section>
    );
  }

  if (configuration === "error" || scriptState === "error") {
    return <div className="widget-state-card widget-state-error"><AlertTriangle /><strong>Não foi possível carregar o widget oficial. Verifique a conexão e tente novamente.</strong></div>;
  }

  if (!origin || scriptState !== "ready") {
    return <div className="widget-state-card"><LoaderCircle className="spin" /><strong>Carregando placares oficiais...</strong></div>;
  }

  const widgetToken = process.env.NEXT_PUBLIC_WIDGET_PROXY_TOKEN || DEFAULT_WIDGET_TOKEN;
  const proxyUrl = `${origin}/api/widgets/football/`;
  const translationUrl = `${origin}/widgets-pt-BR.json`;

  return (
    <section className="official-widget-shell">
      <div className="official-widget-banner">
        <div><span><Radio size={20} /></span><div><small>API-SPORTS WIDGETS 3.1</small><strong>Partidas e placares atualizados</strong></div></div>
        <div className="widget-security"><ShieldCheck size={16} /><span>Chave protegida pelo servidor</span><CheckCircle2 size={16} /></div>
      </div>

      {createElement("api-sports-widget", {
        "data-type": "config",
        "data-key": widgetToken,
        "data-sport": "football",
        "data-url-football": proxyUrl,
        "data-lang": "en",
        "data-custom-lang": translationUrl,
        "data-theme": "ArenaOdds",
        "data-timezone": "America/Sao_Paulo",
        "data-show-logos": "true",
        "data-show-errors": "true",
        "data-favorite": "false",
      })}

      {createElement("api-sports-widget", {
        "data-type": "games",
        "data-refresh": "60",
        "data-show-toolbar": "true",
        "data-tab": "all",
        "data-games-style": "2",
        "data-target-game": "modal",
        "data-target-standings": "modal",
      })}
    </section>
  );
}
