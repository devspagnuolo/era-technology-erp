"use client";
import { useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  Package,
  ArrowUpRight,
  Building2,
  ShieldCheck,
  LogOut,
  Layers3,
  House,
  ContactRound,
} from "lucide-react";
import { api, useSession } from "../lib/session";
import { Button } from "../components/ui/button";
import { CorePanel } from "../components/core-panel";
import { OdooProducts } from "../components/odoo-products";
import { OdooContacts } from "../components/odoo-contacts";
import { EraLogo } from "../components/era-logo";
import {
  EraDashboard,
  EraModuleCenter,
  type EraView,
} from "../components/era-workspace";

const odooBaseUrl = (
  process.env.NEXT_PUBLIC_ODOO_URL || "https://era-odoo-poc.onrender.com"
).replace(/\/+$/, "");
const odooEntryUrl = odooBaseUrl.endsWith("/odoo")
  ? odooBaseUrl
  : `${odooBaseUrl}/odoo`;
type User = {
  id: string;
  name: string;
  permissions: string[];
  tenant: { name: string };
};
export default function Page() {
  const generation = useSession((s) => s.generation);
  return <SessionWorkspace key={generation} />;
}
function SessionWorkspace() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <Workspace />
    </QueryClientProvider>
  );
}
function Login() {
  const setSession = useSession((s) => s.setSession);
  const { register, handleSubmit } = useForm<{
    company: string;
    email: string;
    password: string;
  }>({ defaultValues: { company: "era-demo" } });
  const login = useMutation({
    mutationFn: (input: { company: string; email: string; password: string }) =>
      api<{ accessToken: string; refreshToken: string }>("auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: setSession,
  });
  return (
    <main className="login">
      <section className="login-story">
        <EraLogo className="login-logo" />
        <p className="eyebrow">ERP ERA · ODOO COMO MOTOR</p>
        <h1>
          Seu negócio.
          <br />
          Uma visão completa.
        </h1>
        <p>
          Uma experiência mais simples para acessar os módulos operacionais do Odoo.
        </p>
        <div className="login-foot">
          <Layers3 size={20} /> Uma base para cada próximo passo.
        </div>
      </section>
      <section className="login-form">
        <form onSubmit={handleSubmit((data) => login.mutate(data))}>
          <div className="icon-tile">
            <Building2 />
          </div>
          <h2>Bem-vindo ao ERP</h2>
          <p>Acesse o ambiente da sua empresa.</p>
          <label>
            Empresa
            <input
              {...register("company", { required: true })}
              autoComplete="organization"
              required
            />
          </label>
          <label>
            E-mail
            <input
              type="email"
              {...register("email", { required: true })}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              {...register("password", { required: true })}
              autoComplete="current-password"
              required
            />
          </label>
          {login.error && (
            <p role="alert" className="error">
              {login.error.message}
            </p>
          )}
          <Button className="w-full mt-3" disabled={login.isPending}>
            {login.isPending ? "Entrando…" : "Acessar empresa"}
            <ArrowUpRight size={16} />
          </Button>
          <small>
            <ShieldCheck size={14} /> Acesso seguro ao ambiente da sua empresa
          </small>
          <small className="login-odoo-note">
            O acesso ao Odoo pode solicitar um login separado.
          </small>
        </form>
      </section>
    </main>
  );
}
function Workspace() {
  const session = useSession((s) => s.session);
  if (!session) return <Login />;
  return <Catalog />;
}
function Catalog() {
  const cache = useQueryClient();
  const setSession = useSession((s) => s.setSession);
  const [view, setView] = useState<EraView>("home");
  const user = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("auth/me"),
  });
  const audits = useQuery({
    queryKey: ["audit"],
    queryFn: () =>
      api<
        Array<{
          id: string;
          createdAt: string;
          module: string;
          action: string;
          actorId: string;
          recordId: string;
        }>
      >("audit"),
    enabled:
      view === "audit" && !!user.data?.permissions.includes("audit:read"),
  });
  const logout = useMutation({
    mutationFn: () => api("auth/logout", { method: "POST" }),
    onSuccess: () => {
      cache.clear();
      setSession(null);
    },
  });
  const viewLabels: Record<EraView, string> = {
    home: "Visão geral",
    modules: "Módulos ERA",
    products: "Produtos",
    contacts: "Clientes e fornecedores",
    audit: "Auditoria",
    users: "Usuários",
    branches: "Filiais",
    profiles: "Perfis",
  };
  return (
    <div className="shell era-shell">
      <aside className="era-sidebar">
        <div className="era-brand">
          <EraLogo className="sidebar-logo" />
        </div>
        <div className="workspace-label">
          WORKSPACE <span>ERP</span>
        </div>
        <p className="nav-label">ESPAÇO ERA</p>
        <button
          className={view === "home" ? "nav active" : "nav"}
          onClick={() => setView("home")}
        >
          <House size={19} /> Visão geral
        </button>
        <button
          className={view === "modules" ? "nav active" : "nav"}
          onClick={() => setView("modules")}
        >
          <Layers3 size={19} /> Módulos Odoo
          <span className="era-nav-count">19</span>
        </button>
        <p className="nav-label">OPERAÇÃO NO ODOO</p>
        <button
          className={view === "products" ? "nav active" : "nav"}
          onClick={() => setView("products")}
        >
          <Package size={19} /> Produtos e estoque
        </button>
        {user.data?.permissions.includes("contacts:read") && (
          <button
            className={view === "contacts" ? "nav active" : "nav"}
            onClick={() => setView("contacts")}
          >
            <ContactRound size={19} /> Clientes e fornecedores
          </button>
        )}
        {user.data?.permissions.includes("audit:read") && (
          <>
            <p className="nav-label">ADMINISTRAÇÃO</p>
            <button
              className={view === "audit" ? "nav active" : "nav"}
              onClick={() => setView("audit")}
            >
              <ShieldCheck size={19} /> Auditoria
            </button>
          </>
        )}
        {(
          [
            { key: "branches", label: "Filiais", permission: "core:read" },
            { key: "users", label: "Usuários", permission: "users:read" },
            { key: "profiles", label: "Perfis", permission: "profiles:read" },
          ] as const
        )
          .filter((item) => user.data?.permissions.includes(item.permission))
          .map((item) => (
            <button
              key={item.key}
              className={view === item.key ? "nav active" : "nav"}
              onClick={() => setView(item.key)}
            >
              <Building2 size={19} />
              {item.label}
            </button>
          ))}
        <div className="sidebar-bottom">
          <div className="avatar">{user.data?.name?.slice(0, 1) || "E"}</div>
          <div>
            <strong>{user.data?.name || "Carregando…"}</strong>
            <small>{user.data?.tenant.name}</small>
          </div>
          <button
            aria-label="Sair"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="era-topbar">
          <div className="era-breadcrumb">ERA ERP <span>/</span> {viewLabels[view]}</div>
          <div className="company">
            <Building2 size={16} />
            {user.data?.tenant.name || "Empresa de demonstração"}
          </div>
        </header>
        <main className="content era-content">
          {(user.error || logout.error) && (
            <p role="alert" className="error">
              {user.error?.message || logout.error?.message}
            </p>
          )}
          {view === "home" ? (
            <EraDashboard
              name={user.data?.name || "equipe ERA"}
              odooUrl={odooEntryUrl}
              onViewChange={setView}
            />
          ) : view === "modules" ? (
            <EraModuleCenter odooUrl={odooEntryUrl} />
          ) : view === "users" || view === "branches" || view === "profiles" ? (
            <CorePanel
              key={view}
              view={view}
              permissions={user.data?.permissions ?? []}
              currentUserId={user.data?.id ?? ""}
            />
          ) : view === "contacts" ? (
            <OdooContacts
              permissions={user.data?.permissions ?? []}
              odooUrl={odooEntryUrl}
            />
          ) : view === "products" ? (
            <OdooProducts
              permissions={user.data?.permissions ?? []}
              odooUrl={odooEntryUrl}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">CONTROLE E RASTREABILIDADE</p>
                  <h1>Auditoria</h1>
                  <p>Acompanhe as últimas 100 operações registradas na empresa.</p>
                </div>
              </div>
              <section className="table-card table-scroll">
                  {audits.isPending ? (
                    <div className="empty">Carregando registros…</div>
                  ) : audits.error ? (
                    <p className="error" role="alert">{audits.error.message}</p>
                  ) : (
                    <table>
                      <thead><tr><th>Data</th><th>Módulo</th><th>Ação</th><th>Usuário</th></tr></thead>
                      <tbody>
                        {audits.data?.map((a) => (
                          <tr key={a.id}>
                            <td>{new Date(a.createdAt).toLocaleString("pt-BR")}</td>
                            <td>{a.module}</td><td>{a.action}</td><td className="mono">{a.actorId}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {audits.data?.length === 0 && <div className="empty">Nenhuma operação registrada.</div>}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

