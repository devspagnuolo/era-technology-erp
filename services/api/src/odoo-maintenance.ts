import { Inject, Injectable } from "@nestjs/common";
import { OdooScope } from "./odoo-scope";
import { OdooForms } from "./odoo-form";
import { AppConfig, OdooApp, appController, call, ref, text } from "./odoo-app";

// Manutenção: solicitações (maintenance.request) e equipamentos
// (maintenance.equipment) com os formulários do Odoo. A etapa da solicitação
// é um campo do formulário; arquivar e reabrir usam as ações do Odoo.
export const REQUESTS: AppConfig = {
  model: "maintenance.request",
  module: "odoo.maintenance",
  notFound: "Solicitação de manutenção não encontrada",
  form: { hidden: ["company_id"] },
  fields: [
    "name",
    "equipment_id",
    "maintenance_type",
    "stage_id",
    "user_id",
    "maintenance_team_id",
    "request_date",
    "schedule_date",
    "close_date",
    "priority",
    "kanban_state",
    "archive",
  ],
  search: ["name", "equipment_id.name"],
  order: "priority desc, schedule_date, id desc",
  filters: {
    open: [
      ["archive", "=", false],
      ["stage_id.done", "=", false],
    ],
    done: [
      ["archive", "=", false],
      ["stage_id.done", "=", true],
    ],
    archived: [["archive", "=", true]],
    all: [],
  },
  defaultFilter: "open",
  toEra: (row) => ({
    id: row.id,
    name: row.name,
    equipment: ref(row.equipment_id),
    type: row.maintenance_type,
    stage: ref(row.stage_id),
    technician: ref(row.user_id),
    team: ref(row.maintenance_team_id),
    requested: text(row.request_date),
    scheduled: text(row.schedule_date),
    closed: text(row.close_date),
    priority: Number(row.priority ?? 0),
    blocked: row.kanban_state === "blocked",
    archived: !!row.archive,
  }),
  actions: {
    archive: {
      allowed: (s) => !s.archived,
      run: call("archive_equipment_request"),
    },
    reopen: {
      allowed: (s) => !!s.archived,
      run: call("reset_equipment_request"),
    },
  },
};

export const EQUIPMENT: AppConfig = {
  model: "maintenance.equipment",
  module: "odoo.equipment",
  notFound: "Equipamento não encontrado",
  form: { hidden: ["company_id"] },
  domain: [["active", "in", [true, false]]],
  fields: [
    "name",
    "category_id",
    "serial_no",
    "model",
    "employee_id",
    "department_id",
    "location",
    "maintenance_team_id",
    "maintenance_open_count",
    "active",
  ],
  search: ["name", "serial_no", "model", "category_id.name"],
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
    category: ref(row.category_id),
    serial: text(row.serial_no),
    model: text(row.model),
    employee: ref(row.employee_id),
    department: ref(row.department_id),
    location: text(row.location),
    team: ref(row.maintenance_team_id),
    openRequests: Number(row.maintenance_open_count ?? 0),
    active: !!row.active,
  }),
};

@Injectable()
export class OdooMaintenance extends OdooApp {
  constructor(
    @Inject(OdooScope) scope: OdooScope,
    @Inject(OdooForms) forms: OdooForms,
  ) {
    super(scope, forms, REQUESTS);
  }
}
@Injectable()
export class OdooEquipment extends OdooApp {
  constructor(
    @Inject(OdooScope) scope: OdooScope,
    @Inject(OdooForms) forms: OdooForms,
  ) {
    super(scope, forms, EQUIPMENT);
  }
}
export const OdooMaintenanceController = appController(
  "odoo/maintenance",
  "maintenance",
  OdooMaintenance,
);
export const OdooEquipmentController = appController(
  "odoo/equipment",
  "maintenance",
  OdooEquipment,
);
