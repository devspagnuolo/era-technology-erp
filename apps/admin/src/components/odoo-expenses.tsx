"use client";
import { useState } from "react";
import { FileStack, ReceiptText } from "lucide-react";
import {
  type AppKind,
  type Ref,
  Badge,
  OdooApp,
  dateLabel,
  money,
  refName,
} from "./odoo-app";

type Expense = {
  id: number;
  name: string;
  employee: Ref;
  category: Ref;
  date: string | null;
  total: string;
  currency: string | null;
  paidBy: string;
  state: string;
  report: Ref;
};
type Report = {
  id: number;
  name: string;
  employee: Ref;
  total: string;
  residual: string;
  currency: string | null;
  paidBy: string;
  state: string;
  payment: string | false;
  date: string | null;
};
const expenseStates: Record<string, [string, string]> = {
  draft: ["draft", "A enviar"],
  reported: ["open", "Em relatório"],
  submitted: ["waiting", "Enviada"],
  approved: ["ready", "Aprovada"],
  done: ["paid", "Paga"],
  refused: ["cancelled", "Recusada"],
};
const reportStates: Record<string, [string, string]> = {
  draft: ["draft", "Rascunho"],
  submit: ["waiting", "Enviado"],
  approve: ["ready", "Aprovado"],
  post: ["open", "Contabilizado"],
  done: ["paid", "Pago"],
  cancel: ["cancelled", "Recusado"],
};
const badge = (states: Record<string, [string, string]>, state: string) => {
  const [stage, label] = states[state] ?? ["open", state];
  return <Badge stage={stage} label={label} />;
};
const paidBy = (mode: string) =>
  mode === "company_account" ? "Empresa" : "Funcionário (reembolsar)";

const EXPENSES: AppKind<Expense> = {
  endpoint: "odoo/expenses",
  permission: "expenses",
  eyebrow: "DESPESAS",
  title: "Despesas",
  description:
    "Lance despesas com categoria, valor, impostos, data, quem pagou e conta analítica. Envie para virar um relatório de despesas no Odoo.",
  icon: <ReceiptText size={18} />,
  noun: {
    one: "Despesa",
    many: "Despesas",
    new: "Nova despesa",
    empty: "Nenhuma despesa lançada",
  },
  filters: [
    ["all", "Todas"],
    ["draft", "A enviar"],
    ["open", "Em andamento"],
    ["done", "Pagas"],
    ["refused", "Recusadas"],
  ],
  searchPlaceholder: "Buscar por descrição, funcionário ou categoria…",
  columns: [
    { label: "Despesa", render: (e) => e.name },
    { label: "Funcionário", render: (e) => refName(e.employee) },
    { label: "Categoria", render: (e) => refName(e.category) },
    { label: "Data", render: (e) => dateLabel(e.date) },
    { label: "Pago por", render: (e) => paidBy(e.paidBy) },
    {
      label: "Total",
      numeric: true,
      render: (e) => money(e.total, e.currency),
    },
    { label: "Situação", render: (e) => badge(expenseStates, e.state) },
  ],
  facts: (e) => [
    ["Situação", badge(expenseStates, e.state)],
    ["Total", money(e.total, e.currency)],
    ["Pago por", paidBy(e.paidBy)],
    ["Relatório", refName(e.report)],
  ],
  actions: [
    {
      name: "submit",
      label: "Criar relatório",
      when: (e) => e.state === "draft",
    },
  ],
  titleOf: (e) => e.name,
};

const REPORTS: AppKind<Report> = {
  endpoint: "odoo/expense-reports",
  permission: "expenses",
  actionPermission: "expenses:approve",
  eyebrow: "DESPESAS",
  title: "Relatórios de despesas",
  description:
    "Relatórios que agrupam as despesas: envie, aprove, contabilize e registre o reembolso ao funcionário, como no Odoo.",
  icon: <FileStack size={18} />,
  noun: {
    one: "Relatório",
    many: "Relatórios",
    new: "Novo relatório",
    empty: "Nenhum relatório em andamento",
  },
  filters: [
    ["open", "Em andamento"],
    ["draft", "Rascunho"],
    ["submitted", "Enviados"],
    ["approved", "Aprovados"],
    ["posted", "Contabilizados"],
    ["done", "Pagos"],
    ["refused", "Recusados"],
    ["all", "Todos"],
  ],
  searchPlaceholder: "Buscar por relatório ou funcionário…",
  columns: [
    { label: "Relatório", render: (r) => r.name },
    { label: "Funcionário", render: (r) => refName(r.employee) },
    { label: "Data", render: (r) => dateLabel(r.date) },
    {
      label: "Total",
      numeric: true,
      render: (r) => money(r.total, r.currency),
    },
    {
      label: "A pagar",
      numeric: true,
      render: (r) => money(r.residual, r.currency),
    },
    { label: "Situação", render: (r) => badge(reportStates, r.state) },
  ],
  facts: (r) => [
    ["Situação", badge(reportStates, r.state)],
    ["Total", money(r.total, r.currency)],
    ["A pagar", money(r.residual, r.currency)],
    ["Pago por", paidBy(r.paidBy)],
  ],
  actions: [
    {
      name: "submit",
      label: "Enviar para aprovação",
      when: (r) => r.state === "draft",
    },
    { name: "approve", label: "Aprovar", when: (r) => r.state === "submit" },
    {
      name: "post",
      label: "Contabilizar",
      when: (r) => r.state === "approve",
    },
    {
      name: "pay",
      label: "Registrar pagamento",
      when: (r) => r.state === "post",
      confirm: (r) =>
        "Registrar o pagamento de " +
        money(r.residual, r.currency) +
        " no diário padrão do Odoo?",
    },
    {
      name: "reset",
      label: "Voltar para rascunho",
      variant: "outline",
      when: (r) => ["submit", "approve", "cancel"].includes(r.state),
    },
  ],
  titleOf: (r) => r.name,
};

export function OdooExpenses(props: {
  permissions: string[];
}) {
  const [tab, setTab] = useState<"expenses" | "reports">("expenses");
  return (
    <>
      <div className="odoo-tabs" role="tablist">
        {(
          [
            ["expenses", "Despesas"],
            ["reports", "Relatórios"],
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
      {tab === "expenses" ? (
        <OdooApp key={tab} kind={EXPENSES} {...props} />
      ) : (
        <OdooApp key={tab} kind={REPORTS} {...props} />
      )}
    </>
  );
}
