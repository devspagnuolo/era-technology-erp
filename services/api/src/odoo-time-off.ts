import { Inject, Injectable } from "@nestjs/common";
import { OdooScope } from "./odoo-scope";
import { OdooForms } from "./odoo-form";
import { AppConfig, OdooApp, appController, call, ref, text } from "./odoo-app";

// Folgas (hr.leave) com o formulário do Odoo: funcionário, tipo de folga,
// período (dias inteiros, meio período ou horas) e motivo. O Odoo calcula a
// duração e o saldo; a ERA aprova, recusa e reabre os pedidos.
export const LEAVE_STAGES = {
  pending: ["confirm", "validate1"],
  approved: ["validate"],
  refused: ["refuse", "cancel"],
} as const;
export type LeaveStage = keyof typeof LEAVE_STAGES;
export function leaveStage(state: string): LeaveStage {
  if ((LEAVE_STAGES.approved as readonly string[]).includes(state))
    return "approved";
  if ((LEAVE_STAGES.refused as readonly string[]).includes(state))
    return "refused";
  return "pending";
}

export const TIME_OFF: AppConfig = {
  model: "hr.leave",
  module: "odoo.time-off",
  notFound: "Pedido de folga não encontrado",
  // A folga pertence à empresa do funcionário; o Odoo preenche a empresa.
  company: { field: "employee_company_id", write: false },
  form: { hidden: ["company_id"] },
  fields: [
    "employee_id",
    "holiday_status_id",
    "request_date_from",
    "request_date_to",
    "duration_display",
    "number_of_days",
    "state",
    "name",
    "department_id",
  ],
  search: ["employee_id.name", "holiday_status_id.name", "name"],
  order: "request_date_from desc, id desc",
  filters: {
    pending: [["state", "in", [...LEAVE_STAGES.pending]]],
    approved: [["state", "in", [...LEAVE_STAGES.approved]]],
    refused: [["state", "in", [...LEAVE_STAGES.refused]]],
    all: [],
  },
  defaultFilter: "pending",
  toEra: (row) => ({
    id: row.id,
    employee: ref(row.employee_id),
    type: ref(row.holiday_status_id),
    from: text(row.request_date_from),
    to: text(row.request_date_to),
    duration: text(row.duration_display),
    days: Number(row.number_of_days ?? 0),
    stage: leaveStage(String(row.state)),
    state: row.state,
    reason: text(row.name),
    department: ref(row.department_id),
  }),
  actions: {
    // Com dupla aprovação, o primeiro clique faz a 1ª aprovação e o segundo
    // valida, como no Odoo.
    approve: {
      allowed: (s) => s.stage === "pending",
      run: async (ctx) =>
        call(
          ctx.summary.state === "validate1"
            ? "action_validate"
            : "action_approve",
        )(ctx),
    },
    refuse: {
      allowed: (s) => s.stage !== "refused",
      run: call("action_refuse"),
    },
    reset: {
      allowed: (s) => s.stage === "refused",
      run: call("action_reset_confirm"),
    },
  },
};

@Injectable()
export class OdooTimeOff extends OdooApp {
  constructor(
    @Inject(OdooScope) scope: OdooScope,
    @Inject(OdooForms) forms: OdooForms,
  ) {
    super(scope, forms, TIME_OFF);
  }
}
export const OdooTimeOffController = appController(
  "odoo/time-off",
  "timeoff",
  OdooTimeOff,
  "timeoff:approve",
);
