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
  LayoutGrid,
  Building2,
  ShieldCheck,
  LogOut,
  Layers3,
  House,
  LayoutDashboard,
  ContactRound,
  ShoppingCart,
  Truck,
  Warehouse,
  ReceiptText,
  Handshake,
  Factory,
  FolderKanban,
  IdCard,
  CalendarDays,
  CheckSquare,
  ChartNoAxesCombined,
  FileText,
  MessageSquare,
  Puzzle,
  Settings2,
  Wrench,
  ChevronDown,
  Search,
  Menu,
  X,
} from "lucide-react";
import { api, useSession } from "../lib/session";
import { Button } from "../components/ui/button";
import { CorePanel } from "../components/core-panel";
import { OdooProducts } from "../components/odoo-products";
import { OdooContacts } from "../components/odoo-contacts";
import { OdooOrders, PURCHASES, SALES } from "../components/odoo-orders";
import { OdooTransfers } from "../components/odoo-transfers";
import { OdooInvoices } from "../components/odoo-invoices";
import { OdooCrm } from "../components/odoo-crm";
import { OdooManufacturing } from "../components/odoo-manufacturing";
import { OdooProjects } from "../components/odoo-projects";
import { OdooEmployees } from "../components/odoo-employees";
import { OdooMaintenance } from "../components/odoo-maintenance";
import { OdooTimeOff } from "../components/odoo-time-off";
import { OdooExpenses } from "../components/odoo-expenses";
import { OdooRun, type RunTarget } from "../components/odoo-run";
import { EraLogo } from "../components/era-logo";
import {
  EraDashboard,
  EraModuleCenter,
  type EraView,
} from "../components/era-workspace";

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
          ERA ERP
        </h1>
        <p>
          Gestão empresarial com os dados operacionais no Odoo.
        </p>
        <div className="login-foot">
          <Layers3 size={20} /> Comercial, operações e administração em um só lugar.
        </div>
      </section>
      <section className="login-form">
        <form onSubmit={handleSubmit((data) => login.mutate(data))}>
          <div className="icon-tile">
            <Building2 />
          </div>
          <h2>Acesso ao ERA ERP</h2>
          <p>Informe suas credenciais para entrar no sistema.</p>
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
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ overview: true, commercial: true, operations: true, people: false, productivity: false, administration: false });
  const [navQuery, setNavQuery] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Aplicativo do Odoo aberto dentro da ERA (tela "apps").
  const [runTarget, setRunTarget] = useState<RunTarget>({});
  const [selectedOdooModule, setSelectedOdooModule] = useState<string | null>(null);
  const openRun = (target: RunTarget, label: string | null = null) => {
    setRunTarget(target);
    setSelectedOdooModule(label);
    setView("apps");
  };
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
    apps: "Aplicativos",
    products: "Produtos",
    contacts: "Clientes e fornecedores",
    sales: "Vendas",
    purchases: "Compras",
    inventory: "Estoque",
    invoices: "Faturas",
    crm: "CRM",
    manufacturing: "Fabricação",
    projects: "Projetos",
    employees: "Funcionários",
    maintenance: "Manutenção",
    timeoff: "Folga",
    expenses: "Despesas",
    audit: "Auditoria",
    users: "Usuários",
    branches: "Filiais",
    profiles: "Perfis",
  };
  const permissions = user.data?.permissions ?? [];
  // Telas da ERA que o usuário pode abrir (atalhos dos módulos).
  const viewPermissions: Partial<Record<EraView, string>> = {
    products: "products:read",
    contacts: "contacts:read",
    sales: "sales:read",
    purchases: "purchases:read",
    inventory: "inventory:read",
    invoices: "invoices:read",
    crm: "crm:read",
    manufacturing: "manufacturing:read",
    projects: "projects:read",
    employees: "employees:read",
    maintenance: "maintenance:read",
    timeoff: "timeoff:read",
    expenses: "expenses:read",
  };
  const views = (Object.keys(viewPermissions) as EraView[]).filter((v) =>
    permissions.includes(viewPermissions[v]!),
  );
  const navigation: Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
    items: Array<{ label: string; icon: React.ReactNode; view?: EraView; run?: RunTarget; permission?: string }>;
  }> = [
    { key: "overview", label: "Visão geral", icon: <House size={17} />, items: [
      { label: "Painel inicial", icon: <LayoutDashboard size={16} />, view: "home" },
      { label: "Central de módulos", icon: <Layers3 size={16} />, view: "modules" },
      { label: "Todos os aplicativos", icon: <LayoutGrid size={16} />, run: {}, permission: "odoo:read" },
    ] },
    { key: "commercial", label: "Comercial e financeiro", icon: <Handshake size={17} />, items: [
      { label: "CRM", icon: <Handshake size={16} />, view: "crm", permission: "crm:read" },
      { label: "Contatos", icon: <ContactRound size={16} />, view: "contacts", permission: "contacts:read" },
      { label: "Vendas", icon: <ShoppingCart size={16} />, view: "sales", permission: "sales:read" },
      { label: "Faturamento", icon: <ReceiptText size={16} />, view: "invoices", permission: "invoices:read" },
      { label: "Fiscal", icon: <FileText size={16} />, run: { app: "l10n_br_fiscal.fiscal_menu" }, permission: "odoo:read" },
    ] },
    { key: "operations", label: "Operações", icon: <Warehouse size={17} />, items: [
      { label: "Produtos", icon: <Package size={16} />, view: "products", permission: "products:read" },
      { label: "Estoque", icon: <Warehouse size={16} />, view: "inventory", permission: "inventory:read" },
      { label: "Compras", icon: <Truck size={16} />, view: "purchases", permission: "purchases:read" },
      { label: "Fabricação", icon: <Factory size={16} />, view: "manufacturing", permission: "manufacturing:read" },
      { label: "Manutenção", icon: <Wrench size={16} />, view: "maintenance", permission: "maintenance:read" },
      { label: "Projetos", icon: <FolderKanban size={16} />, view: "projects", permission: "projects:read" },
    ] },
    { key: "people", label: "Pessoas", icon: <IdCard size={17} />, items: [
      { label: "Funcionários", icon: <IdCard size={16} />, view: "employees", permission: "employees:read" },
      { label: "Folgas e ausências", icon: <CalendarDays size={16} />, view: "timeoff", permission: "timeoff:read" },
      { label: "Despesas", icon: <ReceiptText size={16} />, view: "expenses", permission: "expenses:read" },
    ] },
    { key: "productivity", label: "Produtividade", icon: <ChartNoAxesCombined size={17} />, items: [
      { label: "Mensagens", icon: <MessageSquare size={16} />, run: { app: "mail.menu_root_discuss" }, permission: "odoo:read" },
      { label: "Calendário", icon: <CalendarDays size={16} />, run: { app: "calendar.mail_menu_calendar" }, permission: "odoo:read" },
      { label: "Tarefas", icon: <CheckSquare size={16} />, run: { app: "project_todo.menu_todo_todos" }, permission: "odoo:read" },
      { label: "Painéis", icon: <ChartNoAxesCombined size={16} />, run: { app: "spreadsheet_dashboard.spreadsheet_dashboard_menu_root" }, permission: "odoo:read" },
    ] },
    { key: "administration", label: "Administração", icon: <Settings2 size={17} />, items: [
      { label: "Usuários", icon: <ContactRound size={16} />, view: "users", permission: "users:read" },
      { label: "Filiais", icon: <Building2 size={16} />, view: "branches", permission: "core:read" },
      { label: "Perfis e permissões", icon: <ShieldCheck size={16} />, view: "profiles", permission: "profiles:read" },
      { label: "Auditoria", icon: <ShieldCheck size={16} />, view: "audit", permission: "audit:read" },
      { label: "Loja de aplicativos", icon: <Puzzle size={16} />, run: { screen: "store" }, permission: "odoo:read" },
      { label: "Configurações dos aplicativos", icon: <Settings2 size={16} />, run: { screen: "settings" }, permission: "odoo:admin" },
    ] },
  ];
  const normalizedNavQuery = navQuery.trim().toLocaleLowerCase("pt-BR");
  return (
    <div className="shell era-shell">
      <aside className={mobileNavOpen ? "era-sidebar is-open" : "era-sidebar"}>
        <div className="era-brand"><EraLogo className="sidebar-logo" /></div>
        <div className="workspace-label">MENU PRINCIPAL <span>ERP</span></div>
        <label className="era-nav-search">
          <Search size={16} />
          <input aria-label="Buscar no menu" placeholder="Buscar menu…" value={navQuery} onChange={(event) => setNavQuery(event.target.value)} />
          {navQuery && <button type="button" aria-label="Limpar busca" onClick={() => setNavQuery("")}><X size={14} /></button>}
        </label>
        <nav className="era-navigation" aria-label="Navegação principal">
          {navigation.map((group) => {
            const items = group.items.filter((item) =>
              (!item.permission || permissions.includes(item.permission)) &&
              (!normalizedNavQuery || item.label.toLocaleLowerCase("pt-BR").includes(normalizedNavQuery)),
            );
            if (!items.length) return null;
            const expanded = normalizedNavQuery ? true : !!expandedGroups[group.key];
            const active = items.some((item) => item.view === view || item.label === selectedOdooModule);
            return (
              <section className={active ? "era-nav-group has-active" : "era-nav-group"} key={group.key}>
                <button
                  type="button"
                  className="era-nav-group-trigger"
                  aria-expanded={expanded}
                  onClick={() => setExpandedGroups((current) => ({ ...current, [group.key]: !current[group.key] }))}
                >
                  <span className="era-nav-group-icon">{group.icon}</span>
                  <span>{group.label}</span>
                  <ChevronDown size={15} className={expanded ? "era-chevron expanded" : "era-chevron"} />
                </button>
                {expanded && <div className="era-nav-submenu">
                  {items.map((item) => {
                    const isActive = item.view === view || item.label === selectedOdooModule;
                    return (
                      <button
                        type="button"
                        key={item.label}
                        className={isActive ? "era-nav-subitem active" : "era-nav-subitem"}
                        aria-current={isActive ? "page" : undefined}
                        onClick={() => {
                          if (item.run) openRun(item.run, item.label);
                          else { setSelectedOdooModule(null); setView(item.view!); }
                          setMobileNavOpen(false);
                        }}
                      >
                        <span className="era-nav-subicon">{item.icon}</span>{item.label}
                      </button>
                    );
                  })}
                </div>}
              </section>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="avatar">{user.data?.name?.slice(0, 1) || "E"}</div>
          <div className="sidebar-user-copy">
            <strong>{user.data?.name || "Carregando…"}</strong>
            <small>{user.data?.tenant.name}</small>
          </div>
          <button aria-label="Sair" onClick={() => logout.mutate()} disabled={logout.isPending}><LogOut size={17} /></button>
        </div>
      </aside>
      <div className="main">
        <header className="era-topbar">
          <button type="button" className="era-mobile-menu" aria-label={mobileNavOpen ? "Fechar menu" : "Abrir menu"} onClick={() => setMobileNavOpen((open) => !open)}>
            {mobileNavOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
          <div className="era-breadcrumb">
            <span className="era-breadcrumb-product">ERA ERP</span><span className="era-breadcrumb-separator">/</span> {selectedOdooModule || viewLabels[view]}
          </div>
          <div className="company">
            <Building2 size={16} />
            {user.data?.tenant.name || "Empresa de demonstração"}
          </div>
        </header>
        <main className="content era-content" onClick={() => mobileNavOpen && setMobileNavOpen(false)}>
          {(user.error || logout.error) && (
            <p role="alert" className="error">
              {user.error?.message || logout.error?.message}
            </p>
          )}
          {view === "home" ? (
            <EraDashboard
              name={user.data?.name || "equipe ERA"}
              onRun={(target) => openRun(target)}
              views={views}
              onViewChange={(nextView) => { setSelectedOdooModule(null); setView(nextView); }}
            />
          ) : view === "modules" ? (
            <EraModuleCenter
              onRun={(target) => openRun(target)}
              views={views}
              onViewChange={(nextView) => { setSelectedOdooModule(null); setView(nextView); }}
            />
          ) : view === "apps" ? (
            <OdooRun
              permissions={permissions}
              target={runTarget}
              onTarget={(target) => openRun(target)}
            />
          ) : view === "users" || view === "branches" || view === "profiles" ? (
            <CorePanel
              key={view}
              view={view}
              permissions={user.data?.permissions ?? []}
              currentUserId={user.data?.id ?? ""}
            />
          ) : view === "crm" ? (
            <OdooCrm permissions={permissions} />
          ) : view === "manufacturing" ? (
            <OdooManufacturing
              permissions={permissions}
            />
          ) : view === "projects" ? (
            <OdooProjects permissions={permissions} />
          ) : view === "employees" ? (
            <OdooEmployees permissions={permissions} />
          ) : view === "maintenance" ? (
            <OdooMaintenance permissions={permissions} />
          ) : view === "timeoff" ? (
            <OdooTimeOff permissions={permissions} />
          ) : view === "expenses" ? (
            <OdooExpenses permissions={permissions} />
          ) : view === "invoices" ? (
            <OdooInvoices
              permissions={user.data?.permissions ?? []}
            />
          ) : view === "inventory" ? (
            <OdooTransfers
              permissions={user.data?.permissions ?? []}
            />
          ) : view === "sales" || view === "purchases" ? (
            <OdooOrders
              key={view}
              kind={view === "sales" ? SALES : PURCHASES}
              permissions={user.data?.permissions ?? []}
            />
          ) : view === "contacts" ? (
            <OdooContacts
              permissions={user.data?.permissions ?? []}
            />
          ) : view === "products" ? (
            <OdooProducts
              permissions={user.data?.permissions ?? []}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">CONTROLE E RASTREABILIDADE</p>
                  <h1>Auditoria</h1>
                  <p>
                    Acompanhe as últimas 100 operações registradas na empresa.
                  </p>
                </div>
              </div>
              <section className="table-card table-scroll">
                {audits.isPending ? (
                  <div className="empty">Carregando registros…</div>
                ) : audits.error ? (
                  <p className="error" role="alert">
                    {audits.error.message}
                  </p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Módulo</th>
                        <th>Ação</th>
                        <th>Usuário</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audits.data?.map((a) => (
                        <tr key={a.id}>
                          <td>
                            {new Date(a.createdAt).toLocaleString("pt-BR")}
                          </td>
                          <td>{a.module}</td>
                          <td>{a.action}</td>
                          <td className="mono">{a.actorId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {audits.data?.length === 0 && (
                  <div className="empty">Nenhuma operação registrada.</div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
