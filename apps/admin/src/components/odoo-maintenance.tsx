"use client";
import { useState } from "react";
import { Cog, Wrench } from "lucide-react";
import {
  type AppKind,
  type Ref,
  Badge,
  OdooApp,
  dateLabel,
  refName,
} from "./odoo-app";

type Request = {
  id: number;
  name: string;
  equipment: Ref;
  type: string;
  stage: Ref;
  technician: Ref;
  team: Ref;
  requested: string | null;
  scheduled: string | null;
  closed: string | null;
  priority: number;
  blocked: boolean;
  archived: boolean;
};
type Equipment = {
  id: number;
  name: string;
  category: Ref;
  serial: string | null;
  model: string | null;
  employee: Ref;
  department: Ref;
  location: string | null;
  team: Ref;
  openRequests: number;
  active: boolean;
};
const requestBadge = (r: Request) =>
  r.archived ? (
    <Badge stage="cancelled" label="Arquivada" />
  ) : r.closed ? (
    <Badge stage="done" label="Concluída" />
  ) : r.blocked ? (
    <Badge stage="waiting" label="Bloqueada" />
  ) : (
    <Badge stage="open" label="Em aberto" />
  );
const typeLabel = (r: Request) =>
  r.type === "preventive" ? "Preventiva" : "Corretiva";
const equipmentBadge = (e: Equipment) =>
  e.active ? (
    <Badge stage="ready" label="Ativo" />
  ) : (
    <Badge stage="cancelled" label="Arquivado" />
  );
const usedBy = (e: Equipment) =>
  e.employee?.name ?? e.department?.name ?? e.location ?? "—";

const REQUESTS: AppKind<Request> = {
  endpoint: "odoo/maintenance",
  permission: "maintenance",
  eyebrow: "MANUTENÇÃO",
  title: "Solicitações de manutenção",
  description:
    "Abra e acompanhe manutenções corretivas e preventivas: equipamento, equipe, técnico, agenda e etapa, com os campos do Odoo.",
  icon: <Wrench size={18} />,
  noun: {
    one: "Solicitação",
    many: "Solicitações",
    new: "Nova solicitação",
    empty: "Nenhuma solicitação em aberto",
  },
  filters: [
    ["open", "Em aberto"],
    ["done", "Concluídas"],
    ["archived", "Arquivadas"],
    ["all", "Todas"],
  ],
  searchPlaceholder: "Buscar por solicitação ou equipamento…",
  columns: [
    { label: "Solicitação", render: (r) => r.name },
    { label: "Equipamento", render: (r) => refName(r.equipment) },
    { label: "Tipo", render: typeLabel },
    { label: "Etapa", render: (r) => refName(r.stage) },
    { label: "Técnico", render: (r) => refName(r.technician) },
    { label: "Agendada", render: (r) => dateLabel(r.scheduled) },
    { label: "Situação", render: requestBadge },
  ],
  facts: (r) => [
    ["Situação", requestBadge(r)],
    ["Equipamento", refName(r.equipment)],
    ["Tipo", typeLabel(r)],
    ["Solicitada em", dateLabel(r.requested)],
  ],
  actions: [
    {
      name: "archive",
      label: "Arquivar",
      variant: "outline",
      when: (r) => !r.archived,
      confirm: (r) => "Arquivar a solicitação " + r.name + " no Odoo?",
    },
    {
      name: "reopen",
      label: "Reabrir",
      variant: "outline",
      when: (r) => r.archived,
    },
  ],
  titleOf: (r) => r.name,
};

const EQUIPMENT: AppKind<Equipment> = {
  endpoint: "odoo/equipment",
  permission: "maintenance",
  eyebrow: "MANUTENÇÃO",
  title: "Equipamentos",
  description:
    "Cadastro dos equipamentos: categoria, fabricante, modelo, número de série, quem usa, garantia e manutenção preventiva.",
  icon: <Cog size={18} />,
  noun: {
    one: "Equipamento",
    many: "Equipamentos",
    new: "Novo equipamento",
    empty: "Nenhum equipamento cadastrado",
  },
  filters: [
    ["active", "Ativos"],
    ["archived", "Arquivados"],
    ["all", "Todos"],
  ],
  searchPlaceholder: "Buscar por nome, série ou modelo…",
  columns: [
    { label: "Equipamento", render: (e) => e.name },
    { label: "Categoria", render: (e) => refName(e.category) },
    { label: "Nº de série", render: (e) => e.serial ?? "—" },
    { label: "Usado por", render: usedBy },
    { label: "Equipe", render: (e) => refName(e.team) },
    {
      label: "Manutenções abertas",
      numeric: true,
      render: (e) => e.openRequests,
    },
    { label: "Situação", render: equipmentBadge },
  ],
  facts: (e) => [
    ["Situação", equipmentBadge(e)],
    ["Categoria", refName(e.category)],
    ["Usado por", usedBy(e)],
    ["Manutenções abertas", e.openRequests],
  ],
  actions: [
    {
      name: "archive",
      label: "Arquivar",
      variant: "outline",
      active: false,
      when: (e) => e.active,
      confirm: (e) => "Arquivar o equipamento " + e.name + " no Odoo?",
    },
    {
      name: "unarchive",
      label: "Reativar",
      variant: "outline",
      active: true,
      when: (e) => !e.active,
    },
  ],
  titleOf: (e) => e.name,
};

export function OdooMaintenance(props: {
  permissions: string[];
}) {
  const [tab, setTab] = useState<"requests" | "equipment">("requests");
  return (
    <>
      <div className="odoo-tabs" role="tablist">
        {(
          [
            ["requests", "Solicitações"],
            ["equipment", "Equipamentos"],
          ] as const
        ).map(([key, label]) => (
          <button
            type="button"
            role="tab"
            key={key}
            aria-selected={key === tab}
            className={key === tab ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "requests" ? (
        <OdooApp key={tab} kind={REQUESTS} {...props} />
      ) : (
        <OdooApp key={tab} kind={EQUIPMENT} {...props} />
      )}
    </>
  );
}
