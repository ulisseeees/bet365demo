"use client";

import { Edit3, Gift, ImageIcon, LoaderCircle, Plus, Sparkles, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useBetStore } from "@/store/useBetStore";

interface AdminMission { id: string; title: string; description: string; target: number; reward: number; config: { minOdd?: number; competitionTerms?: string[] }; active: boolean; ends_at?: string | null }
interface AdminBanner { id: string; kind: string; title: string; subtitle: string; cta_label: string; tone: string; sort_order: number; active: boolean }
interface SuperOdd { id: string; label?: string; boosted_price: number; original_price: number; active: boolean }

const emptyMission = { id: "", title: "", description: "", target: "50", reward: "25", minOdd: "2", terms: "world cup,copa do mundo", endsAt: "" };
const emptyBanner = { id: "", kind: "custom", title: "", subtitle: "", ctaLabel: "Ver oferta", tone: "orange", sortOrder: "0" };

export function AdminGrowthManager() {
  const showToast = useBetStore((state) => state.showToast);
  const hydrateAccount = useBetStore((state) => state.hydrateAccount);
  const [missions, setMissions] = useState<AdminMission[]>([]);
  const [banners, setBanners] = useState<AdminBanner[]>([]);
  const [superOdds, setSuperOdds] = useState<SuperOdd[]>([]);
  const [missionForm, setMissionForm] = useState(emptyMission);
  const [bannerForm, setBannerForm] = useState(emptyBanner);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [missionResponse, bannerResponse, promoResponse] = await Promise.all([
      fetch("/api/admin/missions", { cache: "no-store" }),
      fetch("/api/admin/banners", { cache: "no-store" }),
      fetch("/api/admin/promotions", { cache: "no-store" }),
    ]);
    const [missionPayload, bannerPayload, promoPayload] = await Promise.all([missionResponse.json(), bannerResponse.json(), promoResponse.json()]) as [{ missions?: AdminMission[] }, { banners?: AdminBanner[] }, { superOdds?: SuperOdd[] }];
    setMissions(missionPayload.missions ?? []);
    setBanners(bannerPayload.banners ?? []);
    setSuperOdds(promoPayload.superOdds ?? []);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { load().catch(() => undefined); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const post = async (url: string, body: Record<string, unknown>, success: string) => {
    setSaving(success);
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível salvar");
      await Promise.all([load(), hydrateAccount()]);
      showToast("Gerenciamento atualizado", success, "success");
      return true;
    } catch (error) {
      showToast("Falha ao atualizar", error instanceof Error ? error.message : "Tente novamente.", "danger");
      return false;
    } finally { setSaving(null); }
  };

  return <section className="admin-card growth-manager">
    <div className="admin-card-title"><span><Gift size={19} /></span><div><h3>Campanhas e recompensas</h3><small>Missões, banners, benefícios e Super Odds</small></div></div>
    <div className="growth-admin-grid">
      <div className="growth-column">
        <div className="growth-title"><Gift size={16} /><span><strong>Missões</strong><small>Crie desafios com prêmio em Free Bet</small></span></div>
        <div className="growth-form mission-form">
          <input className="text-input" value={missionForm.title} onChange={(event) => setMissionForm({ ...missionForm, title: event.target.value })} placeholder="Título da missão" />
          <textarea className="text-input" value={missionForm.description} onChange={(event) => setMissionForm({ ...missionForm, description: event.target.value })} placeholder="Descrição" />
          <div className="three-fields"><label><span>Meta R$</span><input className="text-input" type="number" value={missionForm.target} onChange={(event) => setMissionForm({ ...missionForm, target: event.target.value })} /></label><label><span>Free Bet R$</span><input className="text-input" type="number" value={missionForm.reward} onChange={(event) => setMissionForm({ ...missionForm, reward: event.target.value })} /></label><label><span>Odd mínima</span><input className="text-input" type="number" step="0.01" value={missionForm.minOdd} onChange={(event) => setMissionForm({ ...missionForm, minOdd: event.target.value })} /></label></div>
          <input className="text-input" value={missionForm.terms} onChange={(event) => setMissionForm({ ...missionForm, terms: event.target.value })} placeholder="Competições separadas por vírgula" />
          <label><span>Encerramento opcional</span><input className="text-input" type="datetime-local" value={missionForm.endsAt} onChange={(event) => setMissionForm({ ...missionForm, endsAt: event.target.value })} /></label>
          <button className="btn btn-primary" disabled={Boolean(saving)} onClick={async () => { const ok = await post("/api/admin/missions", { id: missionForm.id || undefined, title: missionForm.title, description: missionForm.description, target: Number(missionForm.target), reward: Number(missionForm.reward), minOdd: Number(missionForm.minOdd), competitionTerms: missionForm.terms, endsAt: missionForm.endsAt ? new Date(missionForm.endsAt).toISOString() : null }, missionForm.id ? "Missão editada" : "Missão criada"); if (ok) setMissionForm(emptyMission); }}>{saving ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />} {missionForm.id ? "Salvar missão" : "Criar missão"}</button>
        </div>
        <div className="growth-list">{missions.map((mission) => <article key={mission.id}><span><strong>{mission.title}</strong><small>Meta R$ {Number(mission.target).toLocaleString("pt-BR")} • Free Bet R$ {Number(mission.reward).toLocaleString("pt-BR")} • Odd {Number(mission.config?.minOdd ?? 2).toLocaleString("pt-BR")}</small></span><div><button title="Editar" onClick={() => setMissionForm({ id: mission.id, title: mission.title, description: mission.description, target: String(mission.target), reward: String(mission.reward), minOdd: String(mission.config?.minOdd ?? 2), terms: mission.config?.competitionTerms?.join(",") ?? "", endsAt: mission.ends_at ? new Date(mission.ends_at).toISOString().slice(0, 16) : "" })}><Edit3 size={14} /></button><button title={mission.active ? "Desativar" : "Ativar"} onClick={() => post("/api/admin/missions", { action: "toggle", id: mission.id, active: !mission.active }, mission.active ? "Missão desativada" : "Missão ativada")}>{mission.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}</button><button title="Excluir" onClick={() => window.confirm("Excluir esta missão e seu progresso?") && post("/api/admin/missions", { action: "delete", id: mission.id }, "Missão excluída")}><Trash2 size={14} /></button></div></article>)}</div>
      </div>

      <div className="growth-column">
        <div className="growth-title"><ImageIcon size={16} /><span><strong>Banners da home</strong><small>Controle textos, ordem e campanhas</small></span></div>
        <div className="growth-form banner-form">
          <div className="two-fields"><select className="text-input" value={bannerForm.kind} onChange={(event) => setBannerForm({ ...bannerForm, kind: event.target.value })}><option value="super_odd">Super Odd</option><option value="vip">Clube VIP</option><option value="cashback">Cashback</option><option value="mission">Missão</option><option value="custom">Personalizado</option></select><select className="text-input" value={bannerForm.tone} onChange={(event) => setBannerForm({ ...bannerForm, tone: event.target.value })}><option value="orange">Laranja</option><option value="gold">Dourado</option><option value="cyan">Ciano</option><option value="violet">Roxo</option><option value="green">Verde</option></select></div>
          <input className="text-input" value={bannerForm.title} onChange={(event) => setBannerForm({ ...bannerForm, title: event.target.value })} placeholder="Título do banner" />
          <textarea className="text-input" value={bannerForm.subtitle} onChange={(event) => setBannerForm({ ...bannerForm, subtitle: event.target.value })} placeholder="Descrição da oferta" />
          <div className="two-fields"><input className="text-input" value={bannerForm.ctaLabel} onChange={(event) => setBannerForm({ ...bannerForm, ctaLabel: event.target.value })} placeholder="Texto do botão" /><input className="text-input" type="number" value={bannerForm.sortOrder} onChange={(event) => setBannerForm({ ...bannerForm, sortOrder: event.target.value })} placeholder="Ordem" /></div>
          <button className="btn btn-primary" disabled={Boolean(saving)} onClick={async () => { const ok = await post("/api/admin/banners", { id: bannerForm.id || undefined, kind: bannerForm.kind, title: bannerForm.title, subtitle: bannerForm.subtitle, ctaLabel: bannerForm.ctaLabel, tone: bannerForm.tone, sortOrder: Number(bannerForm.sortOrder) }, bannerForm.id ? "Banner editado" : "Banner criado"); if (ok) setBannerForm(emptyBanner); }}>{saving ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />} {bannerForm.id ? "Salvar banner" : "Criar banner"}</button>
        </div>
        <div className="growth-list">{banners.map((banner) => <article key={banner.id}><span><strong>{banner.title}</strong><small>{banner.kind} • ordem {banner.sort_order} • {banner.cta_label}</small></span><div><button title="Editar" onClick={() => setBannerForm({ id: banner.id, kind: banner.kind, title: banner.title, subtitle: banner.subtitle, ctaLabel: banner.cta_label, tone: banner.tone, sortOrder: String(banner.sort_order) })}><Edit3 size={14} /></button><button title={banner.active ? "Desativar" : "Ativar"} onClick={() => post("/api/admin/banners", { action: "toggle", id: banner.id, active: !banner.active }, banner.active ? "Banner desativado" : "Banner ativado")}>{banner.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}</button><button title="Excluir" onClick={() => window.confirm("Excluir este banner?") && post("/api/admin/banners", { action: "delete", id: banner.id }, "Banner excluído")}><Trash2 size={14} /></button></div></article>)}</div>
      </div>
    </div>
    <div className="super-odd-manager"><div className="growth-title"><Sparkles size={16} /><span><strong>Super Odds ativas</strong><small>As novas Super Odds continuam sendo criadas na seção operacional abaixo</small></span></div><div className="growth-list horizontal">{superOdds.map((item) => <article key={item.id}><span><strong>{item.label ?? item.id}</strong><small>{Number(item.original_price).toFixed(2)} → {Number(item.boosted_price).toFixed(2)}</small></span><button title="Excluir Super Odd" onClick={() => window.confirm("Remover esta Super Odd?") && post("/api/admin/promotions", { action: "remove-super-odd", id: item.id }, "Super Odd removida")}><Trash2 size={14} /></button></article>)}</div></div>
  </section>;
}
