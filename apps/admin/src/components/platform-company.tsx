"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { platform } from "../lib/platform";
import { OdooFormView, toPayload, useOdooForm, type FormSchema, type Values } from "./odoo-form";
import styles from "./platform-app.module.css";

type User = { id: string; name: string; email: string; role: string; active: boolean; mustChangePassword: boolean; sessions: number };
type Activity = { id: string; actor: string; module: string; action: string; ip: string; before: unknown; after: unknown; createdAt: string };
type Detail = {
  company: { id: string; name: string; slug: string; active: boolean; createdAt: string; odooCompanyId: number | null };
  users: User[];
  roles: Array<{ key: string; label: string }>;
  activity: Activity[];
};
type Ask = { title: string; label: string; run: (reason: string) => Promise<void> };
type Secret = { email: string; password: string; created: boolean };

export const actionLabels: Record<string, string> = {
  create_company: "Empresa cadastrada", update_company: "Cadastro atualizado", activate_company: "Acesso reativado",
  suspend_company: "Acesso suspenso", link_odoo_company: "Empresa criada no Odoo", update_odoo_company: "Cadastro no Odoo atualizado",
  create_user: "Usuário criado", update_user: "Usuário alterado", activate_user: "Usuário desbloqueado",
  deactivate_user: "Usuário bloqueado", reset_password: "Senha redefinida", revoke_sessions: "Sessões encerradas",
  change_password: "Senha trocada pelo usuário", create: "Registro criado", update: "Registro alterado",
  activate: "Registro ativado", deactivate: "Registro desativado",
};
const moduleLabels: Record<string, string> = { platform: "Administração ERA", users: "Usuários", tenant: "Empresa", branches: "Filiais" };
const date = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const reasonOf = (value: unknown) => value && typeof value === "object" && "reason" in value ? String((value as { reason: unknown }).reason ?? "") : "";
const message = (cause: unknown, fallback: string) => cause instanceof Error ? cause.message : fallback;

export function CompanyDetail(props: { companyId: string; onBack: () => void; onChanged: () => void }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false } } }));
  return <QueryClientProvider client={client}><Company {...props} /></QueryClientProvider>;
}

function Company({ companyId, onBack, onChanged }: { companyId: string; onBack: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTab] = useState<"data" | "users" | "activity">("data");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [secret, setSecret] = useState<Secret | null>(null);
  const path = "companies/" + encodeURIComponent(companyId);

  const load = useCallback(async () => {
    try { setDetail(await platform<Detail>(path)); }
    catch (cause) { setError(message(cause, "Falha ao carregar a empresa")); }
  }, [path]);
  useEffect(() => { void load(); }, [load]);

  async function run(work: () => Promise<string | void>) {
    setError(""); setNotice(""); setBusy(true);
    try { const done = await work(); if (done) setNotice(done); await load(); onChanged(); }
    catch (cause) { setError(message(cause, "Não foi possível concluir a operação")); }
    finally { setBusy(false); }
  }
  const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });

  if (!detail) return <section className={styles.panel}>{error ? <p role="alert" className={styles.error}>{error}</p> : <p className={styles.empty}>Carregando empresa…</p>}</section>;
  const c = detail.company;
  const roleLabel = new Map(detail.roles.map(r => [r.key, r.label]));
  const openSessions = detail.users.reduce((sum, u) => sum + u.sessions, 0);

  return <>
    <div className={styles.pageTitle}><div>
      <button className={styles.textButton} onClick={onBack}>← Clientes e empresas</button>
      <h1>{c.name}</h1>
      <p><a href={"/" + c.slug} target="_blank" rel="noreferrer">erp.eratechnology.com.br/{c.slug}</a> · cadastrada em {new Date(c.createdAt).toLocaleDateString("pt-BR")} ·{" "}
        <span className={c.active ? styles.active : styles.inactive}>{c.active ? "Ativa" : "Suspensa"}</span>{" "}
        <span className={c.odooCompanyId ? styles.active : styles.inactive}>{c.odooCompanyId ? "Criada no Odoo" : "Pendente no Odoo"}</span></p>
    </div><div className={styles.actions}>
      <button className={styles.secondary} disabled={busy || !openSessions} onClick={() => setAsk({ title: "Encerrar as " + openSessions + " sessões abertas desta empresa? Todos precisarão entrar de novo.", label: "Encerrar sessões",
        run: reason => run(async () => { const r = await platform<{ revoked: number }>(path + "/sessions/revoke", json("POST", { reason })); return r.revoked + " sessões encerradas."; }) })}>Encerrar sessões</button>
      {c.active
        ? <button className={styles.secondary} disabled={busy} onClick={() => setAsk({ title: "Suspender o acesso de " + c.name + "? Todas as sessões serão encerradas.", label: "Suspender acesso",
            run: reason => run(async () => { await platform(path, json("PATCH", { active: false, reason })); return "Acesso suspenso."; }) })}>Suspender acesso</button>
        : <button className={styles.primary} disabled={busy} onClick={() => void run(async () => { await platform(path, json("PATCH", { active: true })); return "Acesso reativado."; })}>Reativar acesso</button>}
    </div></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
    {secret && <div className={styles.secret} role="status"><div><strong>{secret.created ? "Usuário criado." : "Senha redefinida."} Senha temporária de {secret.email}:</strong>
      <code>{secret.password}</code><small>Ela aparece só agora. Envie ao usuário por um canal seguro; no primeiro acesso ele define uma senha pessoal.</small></div>
      <div className={styles.actions}><button className={styles.subtle} onClick={() => void navigator.clipboard?.writeText(secret.password)}>Copiar</button><button className={styles.subtle} onClick={() => setSecret(null)}>Fechar</button></div></div>}
    {ask && <ReasonPrompt ask={ask} busy={busy} onClose={() => setAsk(null)} />}
    <div className={styles.tabs} role="tablist">
      {([["data", "Dados da empresa"], ["users", "Usuários e acessos (" + detail.users.length + ")"], ["activity", "Auditoria"]] as const).map(([key, label]) =>
        <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? styles.tabActive : styles.tab} onClick={() => setTab(key)}>{label}</button>)}
    </div>
    {tab === "data" && <>
      <EraData key={c.name + c.slug} company={c} busy={busy} onSave={change => run(async () => {
        const r = await platform<{ odooError: string | null }>(path, json("PATCH", change));
        if (r.odooError) throw new Error("Cadastro ERA salvo, mas o nome não foi atualizado no Odoo: " + r.odooError);
        return change.slug && change.slug !== c.slug ? "Endereço alterado. O acesso agora é /" + change.slug + "." : "Cadastro atualizado.";
      })} />
      {c.odooCompanyId
        ? <OdooCompany path={path} onSaved={() => { setNotice("Cadastro da empresa atualizado no Odoo."); void load(); onChanged(); }} />
        : <section className={styles.panel}><div className={styles.panelHead}><div><h2>Cadastro fiscal e endereço</h2><p>A empresa ainda não existe no Odoo. Crie-a para editar CNPJ, endereço e demais dados.</p></div>
          <button className={styles.primary} disabled={busy} onClick={() => void run(async () => {
            const r = await platform<{ odooCompanyId: number | null; odooError: string | null }>(path + "/odoo", { method: "POST" });
            if (!r.odooCompanyId) throw new Error("Não foi possível criar a empresa no Odoo: " + (r.odooError ?? "erro desconhecido"));
            return "Empresa criada no Odoo.";
          })}>Criar no Odoo</button></div></section>}
    </>}
    {tab === "users" && <Users users={detail.users} roles={detail.roles} roleLabel={roleLabel} busy={busy}
      onCreate={input => run(async () => {
        const r = await platform<{ temporaryPassword: string }>(path + "/users", json("POST", input));
        setSecret({ email: input.email, password: r.temporaryPassword, created: true });
      })}
      onUpdate={(user, change) => run(async () => { await platform(path + "/users/" + user.id, json("PATCH", change)); return "Usuário " + user.name + " atualizado."; })}
      onBlock={user => setAsk({ title: "Bloquear " + user.name + "? As sessões dele serão encerradas.", label: "Bloquear usuário",
        run: reason => run(async () => { await platform(path + "/users/" + user.id, json("PATCH", { active: false, reason })); return user.name + " bloqueado."; }) })}
      onUnblock={user => void run(async () => { await platform(path + "/users/" + user.id, json("PATCH", { active: true })); return user.name + " desbloqueado."; })}
      onReset={user => setAsk({ title: "Gerar uma senha temporária para " + user.name + "? A senha atual deixa de valer e as sessões são encerradas.", label: "Redefinir senha",
        run: reason => run(async () => {
          const r = await platform<{ temporaryPassword: string }>(path + "/users/" + user.id + "/password", json("POST", { reason }));
          setSecret({ email: user.email, password: r.temporaryPassword, created: false });
        }) })} />}
    {tab === "activity" && <section className={styles.panel}><div className={styles.panelHead}><div><h2>Auditoria da empresa</h2><p>Últimas 100 alterações feitas pela administração ERA e pelos usuários da empresa.</p></div></div>
      {detail.activity.length === 0 ? <p className={styles.empty}>Nenhuma alteração registrada.</p> :
        <div className={styles.tableWrap}><table><thead><tr><th>QUANDO</th><th>O QUE</th><th>QUEM</th><th>ORIGEM</th><th>MOTIVO</th><th>DETALHES</th></tr></thead><tbody>
          {detail.activity.map(a => <tr key={a.id}><td>{date(a.createdAt)}</td>
            <td><strong>{actionLabels[a.action] ?? a.action.replaceAll("_", " ")}</strong><small>{moduleLabels[a.module] ?? a.module}</small></td>
            <td>{a.actor}</td><td>{a.ip}</td><td>{reasonOf(a.after) || "—"}</td>
            <td>{a.before || a.after ? <details><summary>Ver</summary><pre className={styles.diff}>{JSON.stringify({ antes: a.before, depois: a.after }, null, 2)}</pre></details> : "—"}</td></tr>)}
        </tbody></table></div>}
    </section>}
  </>;
}

function ReasonPrompt({ ask, busy, onClose }: { ask: Ask; busy: boolean; onClose: () => void }) {
  const [reason, setReason] = useState("");
  return <form className={styles.ask} onSubmit={async (event: FormEvent) => { event.preventDefault(); await ask.run(reason.trim()); onClose(); }}>
    <strong>{ask.title}</strong>
    <label>Motivo (fica registrado na auditoria)<input value={reason} onChange={e => setReason(e.target.value)} minLength={3} maxLength={300} required autoFocus /></label>
    <div className={styles.actions}><button className={styles.primary} disabled={busy}>{busy ? "Aplicando…" : ask.label}</button><button type="button" className={styles.secondary} onClick={onClose}>Cancelar</button></div>
  </form>;
}

function EraData({ company, busy, onSave }: { company: Detail["company"]; busy: boolean; onSave: (change: { name?: string; slug?: string }) => Promise<void> }) {
  const [name, setName] = useState(company.name);
  const [slug, setSlug] = useState(company.slug);
  const change = { ...(name.trim() !== company.name && { name: name.trim() }), ...(slug !== company.slug && { slug }) };
  return <section className={styles.panel}><div className={styles.panelHead}><div><h2>Acesso na ERA</h2><p>Nome exibido e endereço que os usuários usam para entrar.</p></div></div>
    <form className={styles.form} onSubmit={event => {
      event.preventDefault();
      if (change.slug && !confirm("Trocar o endereço de acesso? O endereço antigo deixa de funcionar e os usuários precisam usar /" + change.slug + ".")) return;
      void onSave(change);
    }}>
      <label>Nome da empresa<input value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={120} /></label>
      <label>Endereço de acesso<input value={slug} onChange={e => setSlug(e.target.value.toLowerCase())} pattern="[a-z0-9]+(-[a-z0-9]+)*" required /></label>
      <p>O nome também é atualizado na empresa do Odoo.</p>
      <button disabled={busy || !Object.keys(change).length}>Salvar acesso</button>
    </form></section>;
}

// Cadastro completo da empresa no Odoo (mesma tela do Odoo: CNPJ, endereço,
// inscrições, dados fiscais da localização brasileira...).
function OdooCompany({ path, onSaved }: { path: string; onSaved: () => void }) {
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const state = useOdooForm({});
  const { reset } = state;
  const load = useCallback(async () => {
    setError("");
    try { const form = await platform<{ schema: FormSchema; values: Values }>(path + "/odoo/form"); setSchema(form.schema); reset(form.values); }
    catch (cause) { setError(message(cause, "Falha ao carregar o cadastro do Odoo")); }
  }, [path, reset]);
  useEffect(() => { void load(); }, [load]);
  const request = useCallback(<T,>(p: string, init?: RequestInit) => platform<T>(p, init), []);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!schema) return;
    setSaving(true); setError("");
    try {
      const values = await platform<Values>(path + "/odoo", { method: "PATCH", body: JSON.stringify({ values: toPayload(schema, state.changed) }) });
      reset(values); onSaved();
    } catch (cause) { setError(message(cause, "Falha ao gravar no Odoo")); }
    finally { setSaving(false); }
  }
  return <section className={styles.panel}><div className={styles.panelHead}><div><h2>Cadastro da empresa no Odoo</h2><p>Todos os campos do cadastro de empresa do Odoo, inclusive os fiscais. Gravado direto no Odoo.</p></div></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!schema ? (!error && <p className={styles.empty}>Carregando o cadastro do Odoo…</p>) :
      <form onSubmit={save} className={styles.odooForm}>
        <OdooFormView schema={schema} values={state.values} onChange={state.change} scope={{ endpoint: path + "/odoo", request }} />
        <div className={styles.actions}><button className={styles.primary} disabled={saving || state.dirty.size === 0}>{saving ? "Gravando no Odoo…" : "Salvar cadastro"}</button>
          <button type="button" className={styles.secondary} disabled={saving || state.dirty.size === 0} onClick={() => void load()}>Descartar alterações</button></div>
      </form>}
  </section>;
}

function Users({ users, roles, roleLabel, busy, onCreate, onUpdate, onBlock, onUnblock, onReset }: {
  users: User[]; roles: Detail["roles"]; roleLabel: Map<string, string>; busy: boolean;
  onCreate: (input: { name: string; email: string; role: string }) => Promise<void>;
  onUpdate: (user: User, change: { name?: string; email?: string; role?: string }) => Promise<void>;
  onBlock: (user: User) => void; onUnblock: (user: User) => void; onReset: (user: User) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", email: "", role: "OPERATOR" });
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: "", email: "", role: "" });
  return <section className={styles.panel}><div className={styles.toolbar}><div><h2>Usuários e acessos</h2><p>Usuários entram só pela ERA. Senhas novas são temporárias e trocadas no primeiro acesso.</p></div>
    <button className={styles.primary} onClick={() => setCreating(v => !v)}>{creating ? "Cancelar" : "+ Novo usuário"}</button></div>
    {creating && <form className={styles.form} onSubmit={async event => { event.preventDefault(); await onCreate(draft); setDraft({ name: "", email: "", role: "OPERATOR" }); setCreating(false); }}>
      <label>Nome<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} required minLength={2} /></label>
      <label>E-mail<input type="email" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} required /></label>
      <label>Perfil<select value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value })}>{roles.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}</select></label>
      <p>A ERA gera uma senha temporária, mostrada uma única vez.</p>
      <button disabled={busy}>Criar usuário</button></form>}
    {users.length === 0 ? <p className={styles.empty}>Nenhum usuário.</p> :
      <div className={styles.tableWrap}><table><thead><tr><th>USUÁRIO</th><th>PERFIL</th><th>SITUAÇÃO</th><th>SESSÕES</th><th>AÇÕES</th></tr></thead><tbody>
        {users.map(u => editing === u.id
          ? <tr key={u.id}><td colSpan={5}><form className={styles.form} onSubmit={async event => {
              event.preventDefault();
              const change = { ...(edit.name.trim() !== u.name && { name: edit.name.trim() }), ...(edit.email !== u.email && { email: edit.email }), ...(edit.role !== u.role && { role: edit.role }) };
              if (Object.keys(change).length) await onUpdate(u, change);
              setEditing(null);
            }}>
              <label>Nome<input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} required minLength={2} /></label>
              <label>E-mail<input type="email" value={edit.email} onChange={e => setEdit({ ...edit, email: e.target.value.toLowerCase() })} required /></label>
              <label>Perfil<select value={edit.role} onChange={e => setEdit({ ...edit, role: e.target.value })}>{roles.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}</select></label>
              <p>Trocar e-mail ou perfil encerra as sessões abertas do usuário.</p>
              <div className={styles.actions}><button disabled={busy}>Salvar</button><button type="button" className={styles.secondary} onClick={() => setEditing(null)}>Cancelar</button></div>
            </form></td></tr>
          : <tr key={u.id}><td><strong>{u.name}</strong><small>{u.email}</small></td><td>{roleLabel.get(u.role) ?? u.role}</td>
            <td><span className={u.active ? styles.active : styles.inactive}>{u.active ? "Ativo" : "Bloqueado"}</span>{u.mustChangePassword && <small>Senha temporária pendente</small>}</td>
            <td>{u.sessions}</td>
            <td className={styles.actions}>
              <button className={styles.subtle} disabled={busy} onClick={() => { setEditing(u.id); setEdit({ name: u.name, email: u.email, role: u.role }); }}>Editar</button>
              <button className={styles.subtle} disabled={busy} onClick={() => onReset(u)}>Redefinir senha</button>
              {u.active ? <button className={styles.subtle} disabled={busy} onClick={() => onBlock(u)}>Bloquear</button>
                : <button className={styles.subtle} disabled={busy} onClick={() => onUnblock(u)}>Desbloquear</button>}
            </td></tr>)}
      </tbody></table></div>}
  </section>;
}
