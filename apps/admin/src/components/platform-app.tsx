"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { EraLogo } from "./era-logo";
import styles from "./platform-app.module.css";

type Company = { id: string; name: string; slug: string; active: boolean; createdAt: string; users?: { name: string; email: string; active: boolean }[] };
type Owner = { email: string };
type Activity = { id: string; company: string; actor: string; action: string; createdAt: string };
type Overview = { odoo: { status: "connected" | "unconfigured" | "unavailable"; version?: string }; metrics: { companies: number; activeCompanies: number; suspendedCompanies: number; activeUsers: number; activeSessions: number }; recentActivity: Activity[]; companies: Company[]; generatedAt: string };
type CreateForm = { name: string; slug: string; adminName: string; adminEmail: string; adminPassword: string };
const blank: CreateForm = { name: "", slug: "", adminName: "", adminEmail: "", adminPassword: "" };
const labels: Record<string, string> = { create_company: "Empresa cadastrada", update_company: "Cadastro atualizado", activate_company: "Acesso reativado", suspend_company: "Acesso suspenso" };
const date = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

async function platform<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch("/v1/platform/" + path, { ...init, credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", ...init.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "Não foi possível concluir a operação");
  return body as T;
}

export function PlatformApp() {
  const [owner, setOwner] = useState<Owner | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [form, setForm] = useState<CreateForm>(blank);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [section, setSection] = useState("overview");

  async function refresh() { setOverview(await platform<Overview>("overview")); }
  useEffect(() => {
    platform<Owner>("me").then(async user => { setOwner(user); await refresh(); })
      .catch(() => setOwner(null)).finally(() => setLoading(false));
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const user = await platform<Owner>("login", { method: "POST", body: JSON.stringify({ email, password }) });
      setPassword(""); setOwner(user); await refresh(); history.replaceState(null, "", "/platform");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao entrar"); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError("");
    try { await platform("logout", { method: "POST" }); setOwner(null); setOverview(null); history.replaceState(null, "", "/"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao sair"); }
    finally { setBusy(false); }
  }
  async function createCompany(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice(""); setBusy(true);
    try {
      await platform("companies", { method: "POST", body: JSON.stringify(form) });
      setForm(blank); setCreating(false); await refresh(); setNotice("Empresa cadastrada. O administrador poderá acessar pelo endereço indicado.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao cadastrar empresa"); }
    finally { setBusy(false); }
  }
  async function changeCompany(company: Company, change: { name?: string; active?: boolean }) {
    setError(""); setNotice(""); setBusy(true);
    try { await platform("companies/" + encodeURIComponent(company.id), { method: "PATCH", body: JSON.stringify(change) }); await refresh(); setNotice("Cadastro atualizado."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao atualizar empresa"); }
    finally { setBusy(false); }
  }
  const companies = overview?.companies ?? [];
  const visible = useMemo(() => companies.filter(c => {
    const haystack = (c.name + " " + c.slug + " " + (c.users?.[0]?.email ?? "")).toLowerCase();
    return haystack.includes(query.toLowerCase()) && (status === "all" || (status === "active" ? c.active : !c.active));
  }), [companies, query, status]);

  if (loading) return <main className={styles.center}>Carregando acesso ERA…</main>;
  if (!owner) return <main className={styles.login}><header className={styles.brand}><EraLogo className="login-logo" /></header><section className={styles.loginCard}>
    <p className={styles.kicker}>ADMINISTRAÇÃO ERA TECHNOLOGY</p><h1>Acesso do proprietário</h1><p>Entre para gerenciar as empresas do ERA ERP.</p>
    <form onSubmit={login}><label>E-mail<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      <label>Senha<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
      {error && <p role="alert" className={styles.error}>{error}</p>}<button disabled={busy} type="submit">{busy ? "Entrando…" : "Entrar no painel ERA"}</button></form>
    <small>O acesso de cada empresa usa seu endereço próprio: /nome-da-empresa</small></section></main>;

  const m = overview?.metrics;
  return <div className={styles.shell}>
    <aside className={styles.sidebar}><EraLogo className="sidebar-logo" /><p>ADMINISTRAÇÃO ERA</p><span className={styles.navCaption}>GESTÃO DA PLATAFORMA</span>
      <button className={section === "overview" ? styles.navActive : styles.navItem} onClick={() => setSection("overview")}>Visão gerencial</button>
      <button className={section === "companies" ? styles.navActive : styles.navItem} onClick={() => setSection("companies")}>Clientes e empresas</button>
      <button className={section === "activity" ? styles.navActive : styles.navItem} onClick={() => setSection("activity")}>Atividade administrativa</button>
      <div className={styles.owner}><span>{owner.email}</span><button onClick={logout} disabled={busy}>Sair</button></div>
    </aside>
    <main className={styles.main}>
      <header className={styles.topbar}><span>ERA ERP <i>/</i> Administração <i>/</i> {section === "overview" ? "Visão gerencial" : section === "companies" ? "Clientes e empresas" : "Atividade"}</span>
        <div><span className={styles.liveDot} /> Plataforma ERA <button aria-label="Atualizar painel" className={styles.refresh} onClick={() => void refresh()}>↻ Atualizar</button></div></header>
      <div className={styles.content}>
        {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
        {section === "overview" && <>
          <div className={styles.pageTitle}><div><p className={styles.kicker}>CENTRAL DE OPERAÇÕES</p><h1>Visão gerencial</h1><p>Acompanhamento das empresas e do uso da plataforma ERA.</p></div>
            <button className={styles.primary} onClick={() => { setSection("companies"); setCreating(true); }}>+ Cadastrar empresa</button></div>
          <div className={styles.stats}>
            <article><span>EMPRESAS CADASTRADAS</span><strong>{m?.companies ?? 0}</strong><small>Clientes na plataforma ERA</small></article>
            <article><span>ACESSOS ATIVOS</span><strong>{m?.activeCompanies ?? 0}</strong><small>{m?.suspendedCompanies ?? 0} suspensas</small></article>
            <article><span>USUÁRIOS ATIVOS</span><strong>{m?.activeUsers ?? 0}</strong><small>Contas habilitadas</small></article>
            <article><span>SESSÕES VÁLIDAS</span><strong>{m?.activeSessions ?? 0}</strong><small>Sessões ERA dentro da validade</small></article>
          </div>
          <div className={styles.columns}><section className={styles.panel}><div className={styles.panelHead}><div><h2>Empresas recentes</h2><p>Situação das contas cadastradas.</p></div><button className={styles.textButton} onClick={() => setSection("companies")}>Ver todas →</button></div>
              <CompanyTable items={companies.slice(0, 6)} busy={busy} onEdit={changeCompany} /></section><ActivityPanel items={overview?.recentActivity ?? []} /></div>
          <section className={styles.systemPanel}><div><span className={styles.liveDot} /><strong>Banco ERA consultado</strong><small>Atualizado em {overview?.generatedAt ? date(overview.generatedAt) : "—"}</small></div><div className={styles.odooStatus}><strong>Integração Odoo</strong><span className={overview?.odoo.status === "connected" ? styles.connected : styles.disconnected}>{overview?.odoo.status === "connected" ? "Conectada" : overview?.odoo.status === "unconfigured" ? "Não configurada" : "Indisponível"}</span>{overview?.odoo.version && <small>Versão {overview.odoo.version}</small>}</div></section>
        </>}
        {section === "companies" && <>
          <div className={styles.pageTitle}><div><p className={styles.kicker}>CARTEIRA DE CLIENTES</p><h1>Clientes e empresas</h1><p>Gerencie ambientes, responsáveis e situação de acesso.</p></div>
            <button className={styles.primary} onClick={() => setCreating(v => !v)}>{creating ? "Cancelar" : "+ Nova empresa"}</button></div>
          <section className={styles.panel}><div className={styles.toolbar}><div><h2>Empresas cadastradas</h2><p>{visible.length} de {companies.length} empresas</p></div>
            <div className={styles.filters}><input aria-label="Buscar empresa" placeholder="Buscar empresa, endereço ou e-mail" value={query} onChange={e => setQuery(e.target.value)} />
              <select aria-label="Filtrar situação" value={status} onChange={e => setStatus(e.target.value)}><option value="all">Todas</option><option value="active">Ativas</option><option value="suspended">Suspensas</option></select></div></div>
            {creating && <form className={styles.form} onSubmit={createCompany}>
              <label>Nome da empresa<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required minLength={2} maxLength={120} /></label>
              <label>Identificador no endereço<input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase() })} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="minha-empresa" required /></label>
              <label>Nome do administrador<input value={form.adminName} onChange={e => setForm({ ...form, adminName: e.target.value })} required /></label>
              <label>E-mail do administrador<input type="email" value={form.adminEmail} onChange={e => setForm({ ...form, adminEmail: e.target.value })} required /></label>
              <label>Senha inicial do administrador<input type="password" autoComplete="new-password" value={form.adminPassword} onChange={e => setForm({ ...form, adminPassword: e.target.value })} minLength={12} required /></label>
              <p>O cadastro ERA é criado aqui. A configuração operacional no Odoo é uma etapa separada. A senha é armazenada como hash.</p>
              <button disabled={busy} type="submit">{busy ? "Salvando…" : "Cadastrar empresa"}</button></form>}
            <CompanyTable items={visible} busy={busy} onEdit={changeCompany} /></section>
        </>}
        {section === "activity" && <><div className={styles.pageTitle}><div><p className={styles.kicker}>AUDITORIA</p><h1>Atividade administrativa</h1><p>Alterações recentes nos cadastros e acessos dos clientes.</p></div>
          <button className={styles.secondary} onClick={() => void refresh()}>Atualizar atividade</button></div><ActivityPanel items={overview?.recentActivity ?? []} expanded /></>}
        <footer className={styles.footer}>Contratos, cobrança e consumo Odoo ainda não são dados da plataforma; serão exibidos após integração dessas fontes.</footer>
      </div>
    </main>
  </div>;
}

function CompanyTable({ items, busy, onEdit }: { items: Company[]; busy: boolean; onEdit: (company: Company, change: { name?: string; active?: boolean }) => Promise<void> }) {
  return items.length === 0 ? <p className={styles.empty}>Nenhuma empresa encontrada.</p> :
    <div className={styles.tableWrap}><table><thead><tr><th>EMPRESA</th><th>RESPONSÁVEL</th><th>CADASTRO</th><th>SITUAÇÃO</th><th>AÇÕES</th></tr></thead><tbody>
      {items.map(c => <tr key={c.id}><td><strong>{c.name}</strong><small><a href={"/" + c.slug} target="_blank" rel="noreferrer">erp.eratechnology.com.br/{c.slug}</a></small></td>
        <td>{c.users?.[0]?.email ?? "Não informado"}</td><td>{new Date(c.createdAt).toLocaleDateString("pt-BR")}</td>
        <td><span className={c.active ? styles.active : styles.inactive}>{c.active ? "Ativa" : "Suspensa"}</span></td><td className={styles.actions}>
          <button className={styles.subtle} disabled={busy} onClick={() => { const name = prompt("Nome da empresa", c.name); if (name && name.trim() !== c.name) void onEdit(c, { name: name.trim() }); }}>Editar</button>
          <button className={styles.subtle} disabled={busy} onClick={() => { if (confirm(c.active ? "Suspender acesso desta empresa?" : "Reativar acesso desta empresa?")) void onEdit(c, { active: !c.active }); }}>{c.active ? "Suspender" : "Reativar"}</button>
        </td></tr>)}</tbody></table></div>;
}
function ActivityPanel({ items, expanded = false }: { items: Activity[]; expanded?: boolean }) {
  return <section className={styles.panel + (expanded ? " " + styles.activityFull : "")}><div className={styles.panelHead}><div><h2>Registro de atividades</h2><p>Auditoria das alterações administrativas.</p></div></div>
    {items.length === 0 ? <p className={styles.empty}>Nenhuma atividade registrada até o momento.</p> : <ol className={styles.activityList}>{items.map(item => <li key={item.id}><span className={styles.activityIcon}>↗</span><div>
      <strong>{labels[item.action] ?? item.action.replaceAll("_", " ")}</strong><p>{item.company} · por {item.actor}</p><time>{date(item.createdAt)}</time></div></li>)}</ol>}
  </section>;
}
