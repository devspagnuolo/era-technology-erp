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

export type EraView =
  | "home"
  | "modules"
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
  // Tela da ERA para o módulo; sem ela, o atalho abre o Odoo.
  view?: EraView;
};

export const ERA_MODULES: EraModule[] = [
  {
    name: "Mensagens",
    group: "Rotina",
    description: "Conversas internas e notificações do trabalho.",
    icon: MessageSquare,
  },
  {
    name: "Calendário",
    group: "Rotina",
    description: "Compromissos e agenda da equipe.",
    icon: CalendarDays,
  },
  {
    name: "Lista de tarefas",
    group: "Rotina",
    description: "Organize atividades rápidas e pendências.",
    icon: CheckSquare,
  },
  {
    name: "Contatos",
    group: "Comercial",
    description: "Clientes, fornecedores e outros contatos.",
    icon: ContactRound,
    view: "contacts",
  },
  {
    name: "CRM",
    group: "Comercial",
    description: "Acompanhe oportunidades e relacionamento comercial.",
    icon: UsersRound,
    featured: true,
    view: "crm",
  },
  {
    name: "Vendas",
    group: "Comercial",
    description: "Orçamentos e pedidos de venda.",
    icon: ShoppingCart,
    featured: true,
    view: "sales",
  },
  {
    name: "Fiscal",
    group: "Comercial",
    description: "Base fiscal brasileira; emissão requer configuração própria.",
    icon: FileText,
  },
  {
    name: "Painéis",
    group: "Rotina",
    description: "Indicadores e visões de acompanhamento disponíveis no Odoo.",
    icon: ChartNoAxesCombined,
  },
  {
    name: "Faturamento",
    group: "Comercial",
    description: "Faturas e documentos financeiros de clientes.",
    icon: ReceiptText,
    featured: true,
    view: "invoices",
  },
  {
    name: "Projeto",
    group: "Operação",
    description: "Projetos, etapas e tarefas de entrega.",
    icon: FolderKanban,
    view: "projects",
  },
  {
    name: "Compras",
    group: "Operação",
    description: "Solicitações, cotações e pedidos de compra.",
    icon: ShoppingCart,
    view: "purchases",
  },
  {
    name: "Inventário",
    group: "Operação",
    description: "Produtos, depósitos e movimentações de estoque.",
    icon: Boxes,
    featured: true,
    view: "inventory",
  },
  {
    name: "Fabricação",
    group: "Operação",
    description: "Ordens e processos de produção, se aplicáveis ao negócio.",
    icon: Factory,
    view: "manufacturing",
  },
  {
    name: "Manutenção",
    group: "Operação",
    description: "Equipamentos e solicitações de manutenção.",
    icon: Wrench,
    view: "maintenance",
  },
  {
    name: "Funcionários",
    group: "Equipe",
    description: "Cadastro e organização da equipe.",
    icon: UsersRound,
    view: "employees",
  },
  {
    name: "Folga",
    group: "Equipe",
    description: "Solicitações e calendário de ausências.",
    icon: CalendarDays,
    view: "timeoff",
  },
  {
    name: "Despesas",
    group: "Equipe",
    description: "Registro e revisão de despesas da equipe.",
    icon: ReceiptText,
    view: "expenses",
  },
  {
    name: "Aplicativos",
    group: "Sistema",
    description: "Consulte os aplicativos disponíveis na instalação Odoo.",
    icon: Puzzle,
  },
  {
    name: "Definições",
    group: "Sistema",
    description: "Preferências e configuração do ambiente Odoo.",
    icon: Settings2,
  },
];

const groups: ModuleGroup[] = ["Rotina", "Comercial", "Operação", "Equipe", "Sistema"];

function OdooLink({ href, className, children }: {
  href: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

// Módulo com tela na ERA (e permissão do usuário) abre aqui; os demais, no Odoo.
function ModuleLink({
  item,
  odooUrl,
  views,
  onViewChange,
  className,
  children,
}: {
  item: EraModule;
  odooUrl: string;
  views: EraView[];
  onViewChange: (view: EraView) => void;
  className: string;
  children: React.ReactNode;
}) {
  if (item.view && views.includes(item.view)) {
    const view = item.view;
    return (
      <button type="button" className={className} onClick={() => onViewChange(view)}>
        {children}
      </button>
    );
  }
  return (
    <OdooLink className={className} href={odooUrl}>
      {children}
    </OdooLink>
  );
}

export function EraDashboard({
  name,
  odooUrl,
  views,
  onViewChange,
}: {
  name: string;
  odooUrl: string;
  views: EraView[];
  onViewChange: (view: EraView) => void;
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
            <OdooLink className="era-primary-link" href={odooUrl}>
              Abrir o Odoo <ArrowUpRight size={16} />
            </OdooLink>
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
            <ModuleLink key={item.name} item={item} odooUrl={odooUrl} views={views} onViewChange={onViewChange} className="era-shortcut">
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
          <span>Abra o Odoo e navegue usando o menu que já conhece.</span>
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
        O Odoo é o motor operacional e a fonte oficial dos cadastros. A ERA organiza os acessos; integração direta e autenticação única ainda serão construídas por etapas.
      </p>
    </div>
  );
}

export function EraModuleCenter({
  odooUrl,
  views,
  onViewChange,
}: {
  odooUrl: string;
  views: EraView[];
  onViewChange: (view: EraView) => void;
}) {
  const [query, setQuery] = useState("");
  const filteredModules = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return ERA_MODULES;
    return ERA_MODULES.filter((item) =>
      `${item.name} ${item.group} ${item.description}`.toLocaleLowerCase("pt-BR").includes(normalized),
    );
  }, [query]);

  return (
    <div className="era-module-center">
      <div className="era-section-heading era-module-title">
        <div>
          <span className="era-eyebrow">CENTRAL ERA</span>
          <h1>Módulos</h1>
          <p>Acesse os processos integrados à ERA ou abra os demais módulos no ambiente Odoo.</p>
        </div>
        <OdooLink className="era-primary-link" href={odooUrl}>
          Abrir o Odoo <ArrowUpRight size={16} />
        </OdooLink>
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
                  <ModuleLink key={item.name} item={item} odooUrl={odooUrl} views={views} onViewChange={onViewChange} className="era-module-card">
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
        Os dados operacionais permanecem no Odoo. Apenas os módulos integrados à ERA abrem dentro desta interface; os demais são acessados no Odoo.
      </div>
    </div>
  );
}


