"use client";
import { Handshake } from "lucide-react";
import {
  type AppKind,
  type Ref,
  Badge,
  OdooApp,
  dateLabel,
  money,
  refName,
} from "./odoo-app";

type Outcome = "open" | "won" | "lost";
type Lead = {
  id: number;
  name: string;
  partner: Ref;
  company: string | null;
  contact: string | null;
  email: string | null;
  revenue: string;
  probability: number;
  stage: Ref;
  salesperson: Ref;
  currency: string | null;
  deadline: string | null;
  lostReason: Ref;
  outcome: Outcome;
};
const outcome: Record<Outcome, [string, string]> = {
  open: ["open", "Em andamento"],
  won: ["done", "Ganha"],
  lost: ["cancelled", "Perdida"],
};
const badge = (lead: Lead) => {
  const [stage, label] = outcome[lead.outcome];
  return <Badge stage={stage} label={label} />;
};
const customer = (lead: Lead) =>
  lead.partner?.name ?? lead.company ?? lead.contact ?? "—";

const CRM: AppKind<Lead> = {
  endpoint: "odoo/crm",
  permission: "crm",
  eyebrow: "CRM",
  title: "CRM",
  description:
    "Acompanhe oportunidades no funil de vendas: cliente, receita esperada, etapa e responsável. As etapas e a probabilidade seguem as regras do Odoo.",
  icon: <Handshake size={18} />,
  noun: {
    one: "Oportunidade",
    many: "Oportunidades",
    new: "Nova oportunidade",
    empty: "Nenhuma oportunidade em andamento",
  },
  filters: [
    ["open", "Em andamento"],
    ["won", "Ganhas"],
    ["lost", "Perdidas"],
    ["all", "Todas"],
  ],
  searchPlaceholder: "Buscar por oportunidade, cliente, contato ou e-mail…",
  columns: [
    { label: "Oportunidade", render: (l) => l.name },
    { label: "Cliente", render: customer },
    { label: "Etapa", render: (l) => refName(l.stage) },
    { label: "Responsável", render: (l) => refName(l.salesperson) },
    {
      label: "Receita esperada",
      numeric: true,
      render: (l) => money(l.revenue, l.currency),
    },
    {
      label: "Probabilidade",
      numeric: true,
      render: (l) => l.probability + "%",
    },
    { label: "Situação", render: badge },
  ],
  facts: (l) => [
    ["Situação", badge(l)],
    ["Etapa", refName(l.stage)],
    ["Receita esperada", money(l.revenue, l.currency)],
    ["Probabilidade", l.probability + "%"],
    ["Fechamento previsto", dateLabel(l.deadline)],
    ...(l.lostReason
      ? ([["Motivo da perda", l.lostReason.name]] as Array<[string, string]>)
      : []),
  ],
  actions: [
    {
      name: "won",
      label: "Marcar como ganha",
      when: (l) => l.outcome === "open",
    },
    {
      name: "lost",
      label: "Marcar como perdida",
      variant: "outline",
      when: (l) => l.outcome !== "lost",
      confirm: (l) => "Marcar " + l.name + " como perdida no Odoo?",
    },
    {
      name: "reopen",
      label: "Reabrir",
      variant: "outline",
      when: (l) => l.outcome === "lost",
    },
  ],
  titleOf: (l) => l.name,
  odooPath: "/odoo/action-crm.crm_lead_action_pipeline",
};

export function OdooCrm(props: { permissions: string[]; odooUrl: string }) {
  return <OdooApp kind={CRM} {...props} />;
}
