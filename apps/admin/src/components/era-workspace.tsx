"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Boxes,
  CalendarDays,
  ChartNoAxesCombined,
  CheckSquare,
  CircleHelp,
  ContactRound,
  Factory,
  FileText,
  FolderKanban,
  LayoutDashboard,
  MessageSquare,
  Puzzle,
  ReceiptText,
  Search,
  Settings2,
  ShoppingCart,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { HIDDEN_APPS, type Menu, type RunTarget } from "./odoo-run";

export type EraView =
  | "home"
  | "modules"
  | "apps"
  | "products"
  | "contacts"
  | "sales"
  | "purchases"
  | "inventory"
  | "invoices"
  | "crm"
  | "manufacturing"
  | "projects"
  | "employees"
  | "maintenance"
  | "timeoff"
  | "expenses"
  | "audit"
  | "users"
  | "branches"
  | "profiles";

type ModuleGroup = "Rotina" | "Comercial" | "Operação" | "Equipe" | "Sistema";

type EraModule = {
  name: string;
  group: ModuleGroup;
  description: string;
  icon: LucideIcon;
  featured?: boolean;
  // Tela própria da ERA; sem ela (ou sem permissão), o módulo abre no
  // motor genérico de aplicativos, também dentro da ERA.
  view?: EraView;
  run: RunTarget;
};

export const ERA_MODULES: EraModule[] = [
  {
    name: "Mensagens",
    run: { app: "mail.menu_root_discuss" },
    group: "Rotina",
    description: "Conversas internas e notificações do trabalho.",
    icon: MessageSquare,
  },
  {
    name: "Calendário",
    run: { app: "calendar.mail_menu_calendar" },
    group: "Rotina",
    description: "Compromissos e agenda da equipe.",
    icon: CalendarDays,
  },
  {
    name: "Lista de tarefas",
    run: { app: "project_todo.menu_todo_todos" },
    group: "Rotina",
    description: "Organize atividades rápidas e pendências.",
    icon: CheckSquare,
  },
  {
    name: "Contatos",
    run: { app: "contacts.menu_contacts" },
    group: "Comercial",
    description: "Clientes, fornecedores e outros contatos.",
    icon: ContactRound,
    view: "contacts",
  },
  {
    name: "CRM",
    run: { app: "crm.crm_menu_root" },
    group: "Comercial",
    description: "Acompanhe oportunidades e relacionamento comercial.",
    icon: UsersRound,
    featured: true,
    view: "crm",
  },
  {
    name: "Vendas",
    run: { app: "sale.sale_menu_root" },
    group: "Comercial",
    description: "Orçamentos e pedidos de venda.",
    icon: ShoppingCart,
    featured: true,
    view: "sales",
  },
  {
    name: "Fiscal",
    run: { app: "l10n_br_fiscal.fiscal_menu" },
    group: "Comercial",
    description: "Base fiscal brasileira; emissão requer configuração própria.",
    icon: FileText,
  },
  {
    name: "Painéis",
    run: { app: "spreadsheet_dashboard.spreadsheet_dashboard_menu_root" },
    group: "Rotina",
    description: "Indicadores e visões de acompanhamento.",
    icon: ChartNoAxesCombined,
  },
  {
    name: "Faturamento",
    run: { app: "account.menu_finance" },
    group: "Comercial",
    description: "Faturas e documentos financeiros de clientes.",
    icon: ReceiptText,
    featured: true,
    view: "invoices",
  },
  {
    name: "Projeto",
    run: { app: "project.menu_main_pm" },
    group: "Operação",
    description: "Projetos, etapas e tarefas de entrega.",
    icon: FolderKanban,
    view: "projects",
  },
  {
    name: "Compras",
    run: { app: "purchase.menu_purchase_root" },
    group: "Operação",
    description: "Solicitações, cotações e pedidos de compra.",
    icon: ShoppingCart,
    view: "purchases",
  },
  {
    name: "Inventário",
    run: { app: "stock.menu_stock_root" },
    group: "Operação",
    description: "Produtos, depósitos e movimentações de estoque.",
    icon: Boxes,
    featured: true,
    view: "inventory",
  },
  {
    name: "Fabricação",
    run: { app: "mrp.menu_mrp_root" },
    group: "Operação",
    description: "Ordens e processos de produção, se aplicáveis ao negócio.",
    icon: Factory,
    view: "manufacturing",
  },
  {
    name: "Manutenção",
    run: { app: "maintenance.menu_maintenance_title" },
    group: "Operação",
    description: "Equipamentos e solicitações de manutenção.",
    icon: Wrench,
    view: "maintenance",
  },
  {
    name: "Funcionários",
    run: { app: "hr.menu_hr_root" },
    group: "Equipe",
    description: "Cadastro e organização da equipe.",
    icon: UsersRound,
    view: "employees",
  },
  {
    name: "Folga",
    run: { app: "hr_holidays.menu_hr_holidays_root" },
    group: "Equipe",
    description: "Solicitações e calendário de ausências.",
    icon: CalendarDays,
    view: "timeoff",
  },
  {
    name: "Despesas",
    run: { app: "hr_expense.menu_hr_expense_root" },
    group: "Equipe",
    description: "Registro e revisão de despesas da equipe.",
    icon: ReceiptText,
    view: "expenses",
  },
  {
    name: "Aplicativos",
    run: { screen: "store" },
    group: "Sistema",
    description: "Instale, atualize ou remova aplicativos do Odoo.",
    icon: Puzzle,
  },
  {
    name: "Definições",
    run: { screen: "settings" },
    group: "Sistema",
    description: "Configurações de cada aplicativo instalado.",
    icon: Settings2,
  },
];

const groups: ModuleGroup[] = ["Rotina", "Comercial", "Operação", "Equipe", "Sistema"];

// Módulo com tela na ERA (e permissão do usuário) abre nela; os demais, no
// motor genérico de aplicativos. Nada leva o usuário ao Odoo.
function ModuleLink({
  item,
  views,
  onViewChange,
  onRun,
  className,
  children,
}: {
  item: EraModule;
  views: EraView[];
  onViewChange: (view: EraView) => void;
  onRun: (target: RunTarget) => void;
  className: string;
  children: React.ReactNode;
}) {
  const view = item.view && views.includes(item.view) ? item.view : null;
  return (
    <button
      type="button"
      className={className}
      onClick={() => (view ? onViewChange(view) : onRun(item.run))}
    >
      {children}
    </button>
  );
}

export function EraDashboard({
  name,
  views,
  onViewChange,
  onRun,
}: {
  name: string;
  views: EraView[];
  onViewChange: (view: EraView) => void;
  onRun: (target: RunTarget) => void;
}) {
  const shortcuts = ERA_MODULES.filter((item) => item.featured);

  return (
    <div className="era-dashboard">
      <section className="era-welcome">
        <div className="era-welcome-copy">
          <span className="era-eyebrow">PAINEL DE CONTROLE</span>
          <h1>Visão geral</h1>
          <p>Bem-vindo, {name.split(" ")[0]}. Acesse os processos e cadastros da sua empresa.</p>
          <div className="era-welcome-actions">
            <button type="button" className="era-primary-link" onClick={() => onRun({})}>
              Todos os aplicativos <ArrowUpRight size={16} />
            </button>
            <button className="era-quiet-button" onClick={() => onViewChange("modules")}>
              Ver todos os módulos
            </button>
          </div>
        </div>
        <div className="era-welcome-footnote">ERP ERA · Odoo Community como núcleo operacional</div>
      </section>

      <div className="era-section-heading">
        <div>
          <span className="era-eyebrow">ACESSO RÁPIDO</span>
          <h2>Rotinas principais</h2>
        </div>
        <button className="era-text-link" onClick={() => onViewChange("modules")}>
          Ver todos <ArrowUpRight size={15} />
        </button>
      </div>

      <section className="era-shortcuts" aria-label="Módulos principais">
        {shortcuts.map((item) => {
          const Icon = item.icon;
          return (
            <ModuleLink key={item.name} item={item} views={views} onViewChange={onViewChange} onRun={onRun} className="era-shortcut">
              <span className="era-module-icon"><Icon size={20} /></span>
              <span className="era-shortcut-text">
                <strong>{item.name}</strong>
                <small>{item.description}</small>
              </span>
              <ArrowUpRight className="era-card-arrow" size={17} />
            </ModuleLink>
          );
        })}
      </section>

      <div className="era-section-heading era-lower-heading">
        <div>
          <span className="era-eyebrow">CONFIGURAÇÃO</span>
          <h2>Administração inicial</h2>
        </div>
        <span className="era-build-badge">AMBIENTE DE TESTES</span>
      </div>
      <section className="era-setup-grid">
        <button className="era-setup-card" onClick={() => onViewChange("modules")}>
          <span className="era-setup-number">01</span>
          <strong>Explore os módulos</strong>
          <span>Todos os aplicativos do Odoo funcionam aqui, com os mesmos menus.</span>
          <span className="era-setup-action">Ver central de módulos <ArrowUpRight size={14} /></span>
        </button>
        <button className="era-setup-card" onClick={() => onViewChange("products")}>
          <span className="era-setup-number">02</span>
          <strong>Produtos e estoque</strong>
          <span>Consulte e cadastre produtos na ERA; tudo é gravado no Odoo.</span>
          <span className="era-setup-action">Abrir produtos <ArrowUpRight size={14} /></span>
        </button>
        <div className="era-setup-note">
          <CircleHelp size={19} />
          <div>
            <strong>Sem dados definitivos por enquanto</strong>
            <span>Use informações fictícias durante a construção. Dados fiscais e da empresa podem esperar.</span>
          </div>
        </div>
      </section>
      <p className="era-integration-note">
        O Odoo é o motor operacional e a fonte oficial dos cadastros. Tudo é feito pela ERA: cadastros, aprovações, relatórios, instalação de aplicativos e configurações.
      </p>
    </div>
  );
}

// Grupo da central para a categoria que o Odoo dá ao aplicativo.
const AREA_GROUP: Record<NonNullable<Menu["area"]>, ModuleGroup> = {
  commercial: "Comercial",
  operations: "Operação",
  people: "Equipe",
  productivity: "Rotina",
  other: "Sistema",
};

export function EraModuleCenter({
  views,
  apps = [],
  onViewChange,
  onRun,
}: {
  views: EraView[];
  // Aplicativos instalados no Odoo: os que a lista fixa não cobre entram no
  // grupo da sua categoria, inclusive os recém-instalados pela loja.
  apps?: Menu[];
  onViewChange: (view: EraView) => void;
  onRun: (target: RunTarget) => void;
}) {
  const [query, setQuery] = useState("");
  const filteredModules = useMemo(() => {
    const covered = new Set(ERA_MODULES.map((m) => m.run.app));
    const all: EraModule[] = [
      ...ERA_MODULES,
      ...apps
        .filter((a) => !covered.has(a.xmlid) && !HIDDEN_APPS.includes(a.xmlid))
        .map((a) => ({
          name: a.name,
          group: AREA_GROUP[a.area ?? "other"],
          description: "Aplicativo instalado no Odoo.",
          icon: Puzzle,
          run: { app: a.xmlid },
        })),
    ];
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return all;
    return all.filter((item) =>
      `${item.name} ${item.group} ${item.description}`.toLocaleLowerCase("pt-BR").includes(normalized),
    );
  }, [query, apps]);

  return (
    <div className="era-module-center">
      <div className="era-section-heading era-module-title">
        <div>
          <span className="era-eyebrow">CENTRAL ERA</span>
          <h1>Módulos</h1>
          <p>Todos os processos da empresa, com o Odoo como motor por trás.</p>
        </div>
        <button type="button" className="era-primary-link" onClick={() => onRun({})}>
          Todos os aplicativos <ArrowUpRight size={16} />
        </button>
      </div>
      <label className="era-module-search">
        <Search size={18} />
        <input
          aria-label="Buscar módulos"
          placeholder="Busque por módulo ou área…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span>{filteredModules.length} itens</span>
      </label>
      {groups.map((group) => {
        const items = filteredModules.filter((item) => item.group === group);
        if (!items.length) return null;
        return (
          <section className="era-module-group" key={group}>
            <h2>{group}</h2>
            <div className="era-module-grid">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <ModuleLink key={item.name} item={item} views={views} onViewChange={onViewChange} onRun={onRun} className="era-module-card">
                    <span className="era-module-icon"><Icon size={19} /></span>
                    <span className="era-module-copy">
                      <strong>{item.name}</strong>
                      <small>{item.description}</small>
                    </span>
                    <ArrowUpRight className="era-card-arrow" size={16} />
                  </ModuleLink>
                );
              })}
            </div>
          </section>
        );
      })}
      {filteredModules.length === 0 && (
        <div className="era-no-modules">Nenhum módulo corresponde a “{query}”.</div>
      )}
      <div className="era-module-disclaimer">
        Os dados operacionais permanecem no Odoo, mas todos os módulos são usados dentro da ERA.
      </div>
    </div>
  );
}


