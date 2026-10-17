"use client";
import { CalendarDays } from "lucide-react";
import {
  type AppKind,
  type Ref,
  Badge,
  OdooApp,
  dateLabel,
  refName,
} from "./odoo-app";

type Leave = {
  id: number;
  employee: Ref;
  type: Ref;
  from: string | null;
  to: string | null;
  duration: string | null;
  days: number;
  stage: "pending" | "approved" | "refused";
  state: string;
  reason: string | null;
  department: Ref;
};
const stages: Record<Leave["stage"], [string, string]> = {
  pending: ["waiting", "Aguardando aprovação"],
  approved: ["done", "Aprovada"],
  refused: ["cancelled", "Recusada"],
};
const leaveBadge = (l: Leave) => {
  const [stage, label] = stages[l.stage];
  return (
    <Badge
      stage={stage}
      label={l.state === "validate1" ? "Aguardando 2ª aprovação" : label}
    />
  );
};
const period = (l: Leave) =>
  l.from === l.to
    ? dateLabel(l.from)
    : dateLabel(l.from) + " a " + dateLabel(l.to);
const titleOf = (l: Leave) => refName(l.employee) + " · " + refName(l.type);

const TIME_OFF: AppKind<Leave> = {
  endpoint: "odoo/time-off",
  permission: "timeoff",
  actionPermission: "timeoff:approve",
  eyebrow: "FOLGA",
  title: "Folgas",
  description:
    "Pedidos de folga da equipe: tipo, período em dias, meio período ou horas e motivo. O Odoo calcula a duração e o saldo; aprove ou recuse aqui.",
  icon: <CalendarDays size={18} />,
  noun: {
    one: "Folga",
    many: "Pedidos de folga",
    new: "Novo pedido de folga",
    empty: "Nenhum pedido aguardando aprovação",
  },
  filters: [
    ["pending", "Aguardando aprovação"],
    ["approved", "Aprovadas"],
    ["refused", "Recusadas"],
    ["all", "Todas"],
  ],
  searchPlaceholder: "Buscar por funcionário, tipo ou motivo…",
  columns: [
    { label: "Funcionário", render: (l) => refName(l.employee) },
    { label: "Tipo", render: (l) => refName(l.type) },
    { label: "Período", render: period },
    { label: "Duração", render: (l) => l.duration ?? "—" },
    { label: "Departamento", render: (l) => refName(l.department) },
    { label: "Situação", render: leaveBadge },
  ],
  facts: (l) => [
    ["Situação", leaveBadge(l)],
    ["Tipo", refName(l.type)],
    ["Período", period(l)],
    ["Duração", l.duration ?? "—"],
  ],
  actions: [
    {
      name: "approve",
      label: "Aprovar",
      when: (l) => l.stage === "pending",
    },
    {
      name: "refuse",
      label: "Recusar",
      variant: "outline",
      when: (l) => l.stage !== "refused",
      confirm: (l) => "Recusar a folga de " + refName(l.employee) + "?",
    },
    {
      name: "reset",
      label: "Voltar para aprovação",
      variant: "outline",
      when: (l) => l.stage === "refused",
    },
  ],
  titleOf,
};

export function OdooTimeOff(props: { permissions: string[] }) {
  return <OdooApp kind={TIME_OFF} {...props} />;
}
