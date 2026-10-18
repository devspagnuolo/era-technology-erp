"use client";
import { useEffect, useState, type FormEvent } from "react";
import { EraLogo } from "./era-logo";
import styles from "./platform-app.module.css";

type Company = {
  id: string; name: string; slug: string; active: boolean; createdAt: string;
  users: { name: string; email: string; active: boolean }[];
};
type Owner = { email: string };
type CreateForm = { name: string; slug: string; adminName: string; adminEmail: string; adminPassword: string };
const blank: CreateForm = { name: "", slug: "", adminName: "", adminEmail: "", adminPassword: "" };

async function platform<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch("/v1/platform/" + path, {
    ...init, credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "Não foi possível concluir a operação");
  return body as T;
}

export function PlatformApp() {
  const [owner, setOwner] = useState<Owner | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [form, setForm] = useState<CreateForm>(blank);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refreshCompanies() {
    const items = await platform<Company[]>("companies");
    setCompanies(items);
  }
  useEffect(() => {
    platform<Owner>("me").then(async user => {
      setOwner(user);
      await refreshCompanies();
    }).catch(() => setOwner(null)).finally(() => setLoading(false));
  }, []);
  async function login(event: FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const user = await platform<Owner>("login", { method: "POST", body: JSON.stringify({ email, password }) });
      setPassword(""); setOwner(user);
      await refreshCompanies();
      history.replaceState(null, "", "/platform");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao entrar"); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError("");
    try {
      await platform("logout", { method: "POST" });
      setOwner(null); setCompanies([]); history.replaceState(null, "", "/");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao sair"); }
    finally { setBusy(false); }
  }
  async function createCompany(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice(""); setBusy(true);
    try {
      await platform("companies", { method: "POST", body: JSON.stringify(form) });
      setForm(blank); setCreating(false); await refreshCompanies();
      setNotice("Empresa cadastrada. O administrador poderá acessar pelo endereço indicado.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao cadastrar empresa"); }
    finally { setBusy(false); }
  }
  async function changeCompany(company: Company, change: { name?: string; active?: boolean }) {
    setError(""); setNotice(""); setBusy(true);
    try {
      await platform("companies/" + encodeURIComponent(company.id), { method: "PATCH", body: JSON.stringify(change) });
      await refreshCompanies();
      setNotice("Cadastro atualizado.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao atualizar empresa"); }
    finally { setBusy(false); }
  }
  if (loading) return <main className={styles.center}>Carregando acesso ERA…</main>;
  if (!owner) return (
    <main className={styles.login}>
      <header className={styles.brand}><EraLogo className="login-logo" /></header>
      <section className={styles.loginCard}>
        <p className={styles.kicker}>ADMINISTRAÇÃO ERA TECHNOLOGY</p>
        <h1>Acesso do proprietário</h1>
        <p>Entre para gerenciar as empresas do ERA ERP.</p>
        <form onSubmit={login}>
          <label>E-mail<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>
          <label>Senha<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          <button disabled={busy} type="submit">{busy ? "Entrando…" : "Entrar no painel ERA"}</button>
        </form>
        <small>O acesso de cada empresa usa seu endereço próprio: /nome-da-empresa</small>
      </section>
    </main>
  );
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <EraLogo className="sidebar-logo" />
        <p>ADMINISTRAÇÃO DA PLATAFORMA</p>
        <strong>Visão geral</strong>
        <a href="#empresas">Empresas contratantes</a>
        <div className={styles.owner}><span>{owner.email}</span><button onClick={logout} disabled={busy}>Sair</button></div>
      </aside>
      <main className={styles.main}>
        <header className={styles.topbar}><span>ERA ERP / Administração</span><span>Proprietário</span></header>
        <div className={styles.content}>
          <p className={styles.kicker}>PAINEL DO PROPRIETÁRIO</p>
          <h1>Gestão de empresas</h1>
          <p>Cadastre clientes, acompanhe o acesso e suspenda ou reative empresas.</p>
          <div className={styles.stats}>
            <div><strong>{companies.length}</strong><span>Empresas cadastradas</span></div>
            <div><strong>{companies.filter(c => c.active).length}</strong><span>Ativas</span></div>
            <div><strong>{companies.filter(c => !c.active).length}</strong><span>Suspensas</span></div>
          </div>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          {notice && <p role="status" className={styles.notice}>{notice}</p>}
          <section id="empresas" className={styles.panel}>
            <div className={styles.panelHead}><div><h2>Empresas</h2><p>Endereços e responsáveis cadastrados na ERA.</p></div>
              <button onClick={() => setCreating(v => !v)}>{creating ? "Cancelar" : "+ Nova empresa"}</button></div>
            {creating && <form className={styles.form} onSubmit={createCompany}>
              <label>Nome da empresa<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required minLength={2} maxLength={120} /></label>
              <label>Identificador no endereço<input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase() })} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="minha-empresa" required /></label>
              <label>Nome do administrador<input value={form.adminName} onChange={e => setForm({ ...form, adminName: e.target.value })} required /></label>
              <label>E-mail do administrador<input type="email" value={form.adminEmail} onChange={e => setForm({ ...form, adminEmail: e.target.value })} required /></label>
              <label>Senha inicial do administrador<input type="password" autoComplete="new-password" value={form.adminPassword} onChange={e => setForm({ ...form, adminPassword: e.target.value })} minLength={12} required /></label>
              <p>A empresa e o administrador serão criados juntos. Cadastros operacionais no Odoo exigem configuração separada.</p>
              <button disabled={busy} type="submit">{busy ? "Salvando…" : "Cadastrar empresa"}</button>
            </form>}
            {companies.length === 0 ? <p className={styles.empty}>Nenhuma empresa cadastrada.</p> :
              <div className={styles.tableWrap}><table><thead><tr><th>Empresa</th><th>Endereço</th><th>Administrador</th><th>Status</th><th>Ação</th></tr></thead>
                <tbody>{companies.map(c => <tr key={c.id}>
                  <td><strong>{c.name}</strong><small>Criada em {new Date(c.createdAt).toLocaleDateString("pt-BR")}</small></td>
                  <td><a href={"/" + c.slug} target="_blank" rel="noreferrer">/{c.slug}</a></td>
                  <td>{c.users[0]?.email ?? "Não informado"}</td>
                  <td><span className={c.active ? styles.active : styles.inactive}>{c.active ? "Ativa" : "Suspensa"}</span></td>
                  <td><button className={styles.subtle} disabled={busy} onClick={() => {
                    const name = prompt("Nome da empresa", c.name);
                    if (name && name.trim() !== c.name) void changeCompany(c, { name: name.trim() });
                  }}>Editar</button>
                  <button className={styles.subtle} disabled={busy} onClick={() => {
                    if (confirm(c.active ? "Suspender acesso desta empresa?" : "Reativar acesso desta empresa?"))
                      void changeCompany(c, { active: !c.active });
                  }}>{c.active ? "Suspender" : "Reativar"}</button></td>
                </tr>)}</tbody></table></div>}
          </section>
        </div>
      </main>
    </div>
  );
}
