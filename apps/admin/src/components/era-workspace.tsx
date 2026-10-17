"use client";

import { useMemo, useState } from "react";
import { EraLogo } from "./era-logo";
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
  },
  {
    name: "CRM",
    group: "Comercial",
    description: "Acompanhe oportunidades e relacionamento comercial.",
    icon: UsersRound,
    featured: true,
  },
  {
    name: "Vendas",
    group: "Comercial",
    description: "Orçamentos e pedidos de venda.",
    icon: ShoppingCart,
    featured: true,
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
  },
  {
    name: "Projeto",
    group: "Operação",
    description: "Projetos, etapas e tarefas de entrega.",
    icon: FolderKanban,
  },
  {
    name: "Compras",
    group: "Operação",
    description: "Solicitações, cotações e pedidos de compra.",
    icon: ShoppingCart,
  },
  {
    name: "Inventário",
    group: "Operação",
    description: "Produtos, depósitos e movimentações de estoque.",
    icon: Boxes,
    featured: true,
  },
  {
    name: "Fabricação",
    group: "Operação",
    description: "Ordens e processos de produção, se aplicáveis ao negócio.",
    icon: Factory,
  },
  {
    name: "Manutenção",
    group: "Operação",
    description: "Equipamentos e solicitações de manutenção.",
    icon: Wrench,
  },
  {
    name: "Funcionários",
    group: "Equipe",
    description: "Cadastro e organização da equipe.",
    icon: UsersRound,
  },
  {
    name: "Folga",
    group: "Equipe",
    description: "Solicitações e calendário de ausências.",
    icon: CalendarDays,
  },
  {
    name: "Despesas",
    group: "Equipe",
    description: "Registro e revisão de despesas da equipe.",
    icon: ReceiptText,
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

export function EraDashboard({
  name,
  odooUrl,
  onViewChange,
}: {
  name: string;
  odooUrl: string;
  onViewChange: (view: EraView) => void;
}) {
  const greeting = new Date().getHours() < 12 ? "Bom dia" : new Date().getHours() < 18 ? "Boa tarde" : "Boa noite";
  const shortcuts = ERA_MODULES.filter((item) => item.featured);

  return (
    <div className="era-dashboard">
      <section className="era-welcome">
        <div className="era-welcome-copy">
          <span className="era-eyebrow">SEU ESPAÇO DE GESTÃO</span>
          <h1>{greeting}, {name.split(" ")[0]}.</h1>
          <p>Uma entrada mais simples para as rotinas do ERA ERP.</p>
          <div className="era-welcome-actions">
            <OdooLink className="era-primary-link" href={odooUrl}>
              Abrir o Odoo <ArrowUpRight size={16} />
            </OdooLink>
            <button className="era-quiet-button" onClick={() => onViewChange("modules")}>
              Ver todos os módulos
            </button>
          </div>
        </div>
        <EraLogo className="era-welcome-mark" />
        <div className="era-welcome-footnote">
          <span className="era-status-dot" />
          Odoo Community como núcleo · interface ERA em construção
        </div>
      </section>

      <div className="era-section-heading">
        <div>
          <span className="era-eyebrow">ACESSO RÁPIDO</span>
          <h2>Por onde você quer começar?</h2>
        </div>
        <button className="era-text-link" onClick={() => onViewChange("modules")}>
          Ver todos <ArrowUpRight size={15} />
        </button>
      </div>

      <section className="era-shortcuts" aria-label="Módulos principais">
        {shortcuts.map((item) => {
          const Icon = item.icon;
          return (
            <OdooLink key={item.name} className="era-shortcut" href={odooUrl}>
              <span className="era-module-icon"><Icon size={20} /></span>
              <span className="era-shortcut-text">
                <strong>{item.name}</strong>
                <small>{item.description}</small>
              </span>
              <ArrowUpRight className="era-card-arrow" size={17} />
            </OdooLink>
          );
        })}
      </section>

      <div className="era-section-heading era-lower-heading">
        <div>
          <span className="era-eyebrow">COMECE COM CALMA</span>
          <h2>Preparação do ambiente</h2>
        </div>
        <span className="era-build-badge">AMBIENTE DE CONSTRUÇÃO</span>
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
          <span>Consulte e atualize os cadastros operacionais diretamente no Odoo.</span>
          <span className="era-setup-action">Acessar pelo Odoo <ArrowUpRight size={14} /></span>
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

export function EraModuleCenter({ odooUrl }: { odooUrl: string }) {
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
          <p>Os atalhos levam ao ambiente Odoo; escolha o aplicativo desejado no menu de lá.</p>
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
                  <OdooLink key={item.name} className="era-module-card" href={odooUrl}>
                    <span className="era-module-icon"><Icon size={19} /></span>
                    <span className="era-module-copy">
                      <strong>{item.name}</strong>
                      <small>{item.description}</small>
                    </span>
                    <ArrowUpRight className="era-card-arrow" size={16} />
                  </OdooLink>
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
        O Odoo continua responsável pelos registros e operações. Esta central não sincroniza dados nem substitui o login do Odoo.
      </div>
    </div>
  );
}


