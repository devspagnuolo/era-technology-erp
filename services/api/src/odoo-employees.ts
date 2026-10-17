import { Inject, Injectable } from "@nestjs/common";
import { OdooScope } from "./odoo-scope";
import { OdooForms } from "./odoo-form";
import { AppConfig, OdooApp, appController, ref, text } from "./odoo-app";

// Funcionários (hr.employee) com o formulário completo do Odoo: dados de
// trabalho, currículo, informações pessoais e definições de RH. Arquivar um
// funcionário (desligamento) usa os campos de saída do próprio formulário.
export const EMPLOYEES: AppConfig = {
  model: "hr.employee",
  module: "odoo.employees",
  notFound: "Funcionário não encontrado",
  form: { hidden: ["company_id"] },
  domain: [["active", "in", [true, false]]],
  fields: [
    "name",
    "job_title",
    "job_id",
    "department_id",
    "parent_id",
    "work_email",
    "work_phone",
    "mobile_phone",
    "employee_type",
    "active",
  ],
  search: ["name", "job_title", "department_id.name", "work_email"],
  order: "name, id",
  filters: {
    active: [["active", "=", true]],
    archived: [["active", "=", false]],
    all: [],
  },
  defaultFilter: "active",
  toEra: (row) => ({
    id: row.id,
    name: row.name,
    jobTitle: text(row.job_title),
    job: ref(row.job_id),
    department: ref(row.department_id),
    manager: ref(row.parent_id),
    email: text(row.work_email),
    phone: text(row.work_phone) ?? text(row.mobile_phone),
    type: row.employee_type,
    active: !!row.active,
  }),
};

@Injectable()
export class OdooEmployees extends OdooApp {
  constructor(
    @Inject(OdooScope) scope: OdooScope,
    @Inject(OdooForms) forms: OdooForms,
  ) {
    super(scope, forms, EMPLOYEES);
  }
}
export const OdooEmployeesController = appController(
  "odoo/employees",
  "employees",
  OdooEmployees,
);
