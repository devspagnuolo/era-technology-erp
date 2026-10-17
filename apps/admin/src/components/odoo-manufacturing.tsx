"use client";
import { Factory } from "lucide-react";
import {
  type AppKind,
  type Ref,
  Badge,
  OdooApp,
  dateLabel,
  refName,
} from "./odoo-app";

type Stage = "draft" | "confirmed" | "progress" | "done" | "cancelled";
type Production = {
  id: number;
  number: string;
  product: Ref;
  quantity: number;
  producing: number;
  unit: string | null;
  bom: Ref;
  stage: Stage;
  reserved: boolean;
  availability: string | null;
  start: string | null;
  finished: string | null;
  responsible: Ref;
  origin: string | null;
};
const stages: Record<Stage, [string, string]> = {
  draft: ["draft", "Rascunho"],
  confirmed: ["ready", "Confirmada"],
  progress: ["waiting", "Em produção"],
  done: ["done", "Concluída"],
  cancelled: ["cancelled", "Cancelada"],
};
const badge = (p: Production) => {
  const [stage, label] = stages[p.stage];
  return <Badge stage={stage} label={label} />;
};
const qty = (value: number, unit: string | null) =>
  value.toLocaleString("pt-BR") + (unit ? " " + unit : "");
const running = (p: Production) => ["confirmed", "progress"].includes(p.stage);

const MANUFACTURING: AppKind<Production> = {
  endpoint: "odoo/manufacturing",
  permission: "manufacturing",
  actionPermission: "manufacturing:produce",
  eyebrow: "FABRICAÇÃO",
  title: "Fabricação",
  description:
    "Planeje e conclua ordens de produção. O Odoo usa a lista de materiais para reservar os componentes e dar entrada no produto acabado.",
  icon: <Factory size={18} />,
  noun: {
    one: "Ordem de produção",
    many: "Ordens de produção",
    new: "Nova ordem de produção",
    empty: "Nenhuma ordem de produção em aberto",
  },
  filters: [
    ["open", "Em aberto"],
    ["draft", "Rascunhos"],
    ["confirmed", "Confirmadas"],
    ["progress", "Em produção"],
    ["done", "Concluídas"],
    ["cancelled", "Canceladas"],
    ["all", "Todas"],
  ],
  searchPlaceholder: "Buscar por número, produto ou origem…",
  columns: [
    { label: "Número", render: (p) => p.number },
    { label: "Produto", render: (p) => refName(p.product) },
    {
      label: "Quantidade",
      numeric: true,
      render: (p) => qty(p.quantity, p.unit),
    },
    { label: "Início", render: (p) => dateLabel(p.start) },
    { label: "Componentes", render: (p) => p.availability ?? "—" },
    { label: "Situação", render: badge },
  ],
  facts: (p) => [
    ["Situação", badge(p)],
    ["Produto", refName(p.product)],
    ["Quantidade", qty(p.quantity, p.unit)],
    ["Produzindo", qty(p.producing, p.unit)],
    ["Componentes", p.availability ?? "—"],
    ["Conclusão", dateLabel(p.finished)],
  ],
  actions: [
    { name: "confirm", label: "Confirmar", when: (p) => p.stage === "draft" },
    {
      name: "assign",
      label: "Verificar disponibilidade",
      variant: "outline",
      when: (p) => running(p) && !p.reserved,
    },
    {
      name: "done",
      label: "Concluir produção",
      when: running,
      confirm: (p) =>
        "Concluir " +
        p.number +
        "? O Odoo consome os componentes e dá entrada em " +
        qty(p.producing || p.quantity, p.unit) +
        ".",
    },
    {
      name: "cancel",
      label: "Cancelar",
      variant: "outline",
      when: (p) => p.stage === "draft" || running(p),
      confirm: (p) => "Cancelar " + p.number + " no Odoo?",
    },
  ],
  titleOf: (p) => p.number,
};

export function OdooManufacturing(props: {
  permissions: string[];
}) {
  return <OdooApp kind={MANUFACTURING} {...props} />;
}
