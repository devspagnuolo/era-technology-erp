"use client";
import { useEffect, useState } from "react";
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
import { Button } from "./ui/button";
import { CorePanel } from "./core-panel";
import { OdooProducts } from "./odoo-products";
import { OdooContacts } from "./odoo-contacts";
import { OdooOrders, PURCHASES, SALES } from "./odoo-orders";
import { OdooTransfers } from "./odoo-transfers";
import { OdooInvoices } from "./odoo-invoices";
import { OdooCrm } from "./odoo-crm";
import { OdooManufacturing } from "./odoo-manufacturing";
import { OdooProjects } from "./odoo-projects";
import { OdooEmployees } from "./odoo-employees";
import { OdooMaintenance } from "./odoo-maintenance";
import { OdooTimeOff } from "./odoo-time-off";
import { OdooExpenses } from "./odoo-expenses";
import { HIDDEN_APPS, OdooRun, type Menu as OdooMenu, type RunTarget } from "./odoo-run";
import { EraLogo } from "./era-logo";
import {
  EraDashboard,
  EraModuleCenter,
  type EraView,
} from "./era-workspace";

type User = {
  id: string;
  name: string;
  permissions: string[];
  tenant: { name: string; slug: string };
};
export default function EraApp({ tenantSlug }: { tenantSlug?: string }) {
  const generation = useSession((s) => s.generation);
  return <SessionWorkspace key={generation} tenantSlug={tenantSlug} />;
}
function SessionWorkspace({ tenantSlug }: { tenantSlug?: string }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <Workspace tenantSlug={tenantSlug} />
    </QueryClientProvider>
  );
}
function Login({ tenantSlug }: { tenantSlug?: string }) {
  const setSession = useSession((s) => s.setSession);
  const { register, handleSubmit } = useForm<{
    company: string;
    email: string;
    password: string;
  }>({ defaultValues: { company: tenantSlug ?? "era-demo" } });
  const login = useMutation({
    mutationFn: (input: { company: string; email: string; password: string }) =>
      api<{ accessToken: string; refreshToken: string }>("auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: setSession,
  });
  return (
    <main className="login login-erp">
      <header className="login-erp-header">
        <EraLogo className="login-logo" />
      </header>
      <section className="login-form" aria-labelledby="login-title">
        <div className="login-panel">
          <div className="login-panel-heading">
            <h1 id="login-title">Acesso ao ERA ERP</h1>
            <p>Informe suas credenciais para entrar no sistema.</p>
          </div>
          <form onSubmit={handleSubmit((data) => login.mutate(data))}>
            <label>
              Empresa
              <input
                {...register("company", { required: true })}
                autoComplete="organization"
                readOnly={!!tenantSlug}
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
            <Button type="submit" className="w-full login-submit" disabled={login.isPending}>
              {login.isPending ? "Entrando…" : "Acessar empresa"}
              <ArrowUpRight size={16} />
            </Button>
            <small>
              <ShieldCheck size={14} /> Acesso seguro ao ambiente da sua empresa
            </small>
          </form>
        </div>
      </section>
      <svg className="login-wave" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 86 C300 94 530 66 760 56 C1040 36 1190 46 1440 72 L1440 120 L0 120 Z" fill="#079ff0" />
      </svg>
    </main>
  );
}
function Workspace({ tenantSlug }: { tenantSlug?: string }) {
  const session = useSession((s) => s.session);
  if (!session) return <Login key={tenantSlug ?? "owner"} tenantSlug={tenantSlug} />;
  return <Catalog tenantSlug={tenantSlug} />;
}
function Catalog({ tenantSlug }: { tenantSlug?: string }) {
  const cache = useQueryClient();
  const setSession = useSession((s) => s.setSession);
  const [view, setView] = useState<EraView>("home");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ overview: true, commercial: true, operations: true, people: false, productivity: false, administration: false, other: false });
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
  useEffect(() => {
    if (tenantSlug && user.data && user.data.tenant.slug !== tenantSlug) {
      cache.clear();
      setSession(null);
    }
  }, [tenantSlug, user.data?.tenant.slug, cache, setSession]);
  const odooApps = useQuery({
    queryKey: ["odoo-run", "menus"],
    queryFn: () => api<OdooMenu[]>("odoo/run/menus"),
    enabled: !!user.data?.permissions.includes("odoo:read"),
    staleTime: 60000,
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
  if (tenantSlug && user.data && user.data.tenant.slug !== tenantSlug) {
    return (
      <main className="login login-erp" role="status">
        <section className="login-form">
          <div className="login-panel">
            <h1>Validando acesso da empresa…</h1>
            <p>A sessão anterior não corresponde a este endereço.</p>
          </div>
        </section>
      </main>
    );
  }
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
    // app: aplicativo do Odoo que o item já cobre (não se repete abaixo).
    items: Array<{ label: string; icon: React.ReactNode; view?: EraView; run?: RunTarget; app?: string; permission?: string }>;
  }> = [
    { key: "overview", label: "Visão geral", icon: <House size={17} />, items: [
      { label: "Painel inicial", icon: <LayoutDashboard size={16} />, view: "home" },
      { label: "Central de módulos", icon: <Layers3 size={16} />, view: "modules" },
      { label: "Todos os aplicativos", icon: <LayoutGrid size={16} />, run: {}, permission: "odoo:read" },
    ] },
    { key: "commercial", label: "Comercial e financeiro", icon: <Handshake size={17} />, items: [
      { label: "CRM", icon: <Handshake size={16} />, view: "crm", app: "crm.crm_menu_root", permission: "crm:read" },
      { label: "Contatos", icon: <ContactRound size={16} />, view: "contacts", app: "contacts.menu_contacts", permission: "contacts:read" },
      { label: "Vendas", icon: <ShoppingCart size={16} />, view: "sales", app: "sale.sale_menu_root", permission: "sales:read" },
      { label: "Faturamento", icon: <ReceiptText size={16} />, view: "invoices", app: "account.menu_finance", permission: "invoices:read" },
      { label: "Fiscal", icon: <FileText size={16} />, run: { app: "l10n_br_fiscal.fiscal_menu" }, permission: "odoo:read" },
    ] },
    { key: "operations", label: "Operações", icon: <Warehouse size={17} />, items: [
      { label: "Produtos", icon: <Package size={16} />, view: "products", permission: "products:read" },
      { label: "Estoque", icon: <Warehouse size={16} />, view: "inventory", app: "stock.menu_stock_root", permission: "inventory:read" },
      { label: "Compras", icon: <Truck size={16} />, view: "purchases", app: "purchase.menu_purchase_root", permission: "purchases:read" },
      { label: "Fabricação", icon: <Factory size={16} />, view: "manufacturing", app: "mrp.menu_mrp_root", permission: "manufacturing:read" },
      { label: "Manutenção", icon: <Wrench size={16} />, view: "maintenance", app: "maintenance.menu_maintenance_title", permission: "maintenance:read" },
      { label: "Projetos", icon: <FolderKanban size={16} />, view: "projects", app: "project.menu_main_pm", permission: "projects:read" },
    ] },
    { key: "people", label: "Pessoas", icon: <IdCard size={17} />, items: [
      { label: "Funcionários", icon: <IdCard size={16} />, view: "employees", app: "hr.menu_hr_root", permission: "employees:read" },
      { label: "Folgas e ausências", icon: <CalendarDays size={16} />, view: "timeoff", app: "hr_holidays.menu_hr_holidays_root", permission: "timeoff:read" },
      { label: "Despesas", icon: <ReceiptText size={16} />, view: "expenses", app: "hr_expense.menu_hr_expense_root", permission: "expenses:read" },
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
    { key: "other", label: "Outros aplicativos", icon: <LayoutGrid size={17} />, items: [] },
  ];
  // Aplicativos instalados no Odoo entram sozinhos no grupo da categoria que
  // o Odoo dá a eles (inclusive os instalados pela loja da ERA).
  const covered = new Set(
    navigation.flatMap((g) => g.items.map((i) => i.app ?? i.run?.app)),
  );
  for (const app of odooApps.data ?? []) {
    if (covered.has(app.xmlid) || HIDDEN_APPS.includes(app.xmlid)) continue;
    const group =
      navigation.find((g) => g.key === app.area) ??
      navigation.find((g) => g.key === "other");
    group?.items.push({
      label: app.name,
      icon: app.icon ? <img src={app.icon} alt="" className="era-nav-appicon" /> : <LayoutGrid size={16} />,
      run: { app: app.xmlid },
      permission: "odoo:read",
    });
  }
  const normalizeMenu = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const normalizedNavQuery = normalizeMenu(navQuery.trim());
  const matchesMenu = (label: string, group: string) => !normalizedNavQuery || normalizeMenu(label + " " + group).includes(normalizedNavQuery);
  const hasMenuResults = navigation.some(group => group.items.some(item =>
    (!item.permission || permissions.includes(item.permission)) && matchesMenu(item.label, group.label)));

  return (
    <div className="shell era-shell" onKeyDown={(event) => {
      if (event.key === "Escape") { setMobileNavOpen(false); setNavQuery(""); }
    }}>
      <a href="#era-main-content" className="era-skip-link">Ir para o conteúdo</a>
      <aside id="era-main-navigation" className={mobileNavOpen ? "era-sidebar is-open" : "era-sidebar"}>
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
              matchesMenu(item.label, group.label),
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
          {!hasMenuResults && <p className="era-nav-empty" role="status">Nenhum menu encontrado. Busque por uma rotina ou área, como vendas ou estoque.</p>}
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
          <button type="button" className="era-mobile-menu" aria-controls="era-main-navigation" aria-expanded={mobileNavOpen} aria-label={mobileNavOpen ? "Fechar menu" : "Abrir menu"} onClick={() => setMobileNavOpen((open) => !open)}>
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
        <main id="era-main-content" tabIndex={-1} className="content era-content" onClick={() => mobileNavOpen && setMobileNavOpen(false)}>
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
              apps={odooApps.data}
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
