"use client";
import { IdCard } from "lucide-react";
import { type AppKind, type Ref, Badge, OdooApp, refName } from "./odoo-app";

type Employee = {
  id: number;
  name: string;
  jobTitle: string | null;
  job: Ref;
  department: Ref;
  manager: Ref;
  email: string | null;
  phone: string | null;
  active: boolean;
};
const badge = (e: Employee) =>
  e.active ? (
    <Badge stage="done" label="Ativo" />
  ) : (
    <Badge stage="cancelled" label="Desligado" />
  );

const EMPLOYEES: AppKind<Employee> = {
  endpoint: "odoo/employees",
  permission: "employees",
  eyebrow: "PESSOAS",
  title: "Funcionários",
  description:
    "Cadastro completo de funcionários: cargo, departamento, gestor, currículo, dados pessoais e definições de RH, gravados no Odoo.",
  icon: <IdCard size={18} />,
  noun: {
    one: "Funcionário",
    many: "Funcionários",
    new: "Novo funcionário",
    empty: "Nenhum funcionário cadastrado",
  },
  filters: [
    ["active", "Ativos"],
    ["archived", "Desligados"],
    ["all", "Todos"],
  ],
  searchPlaceholder: "Buscar por nome, cargo, departamento ou e-mail…",
  columns: [
    { label: "Nome", render: (e) => e.name },
    { label: "Cargo", render: (e) => e.jobTitle ?? refName(e.job) },
    { label: "Departamento", render: (e) => refName(e.department) },
    { label: "Gestor", render: (e) => refName(e.manager) },
    { label: "E-mail", render: (e) => e.email ?? "—" },
    { label: "Situação", render: badge },
  ],
  facts: (e) => [
    ["Situação", badge(e)],
    ["Cargo", e.jobTitle ?? refName(e.job)],
    ["Departamento", refName(e.department)],
    ["Gestor", refName(e.manager)],
  ],
  // O desligamento usa os campos de saída da aba de informações profissionais.
  actions: [
    {
      name: "archive",
      label: "Desligar",
      variant: "outline",
      active: false,
      when: (e) => e.active,
      confirm: (e) =>
        "Desligar " + e.name + "? O cadastro fica arquivado no Odoo.",
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
  odooPath: "/odoo/employees",
};

export function OdooEmployees(props: {
  permissions: string[];
  odooUrl: string;
}) {
  return <OdooApp kind={EMPLOYEES} {...props} />;
}
