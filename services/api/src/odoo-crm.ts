import { Inject, Injectable } from "@nestjs/common";
import { OdooScope } from "./odoo-scope";
import { OdooForms } from "./odoo-form";
import { AppConfig, OdooApp, appController, call, ref, text } from "./odoo-app";

// Oportunidades e leads do CRM (crm.lead). O formulário é o do Odoo, com a
// localização brasileira (CNPJ, IE...); a etapa do funil é um campo do
// formulário. Ganhar, perder e reabrir usam as ações do próprio Odoo.
const MODEL = "crm.lead";
export type LeadOutcome = "open" | "won" | "lost";
export function leadOutcome(row: Record<string, unknown>) {
  if (!row.active) return "lost";
  return Number(row.probability) >= 100 ? "won" : "open";
}
export const CRM: AppConfig = {
  model: MODEL,
  module: "odoo.crm",
  notFound: "Oportunidade não encontrada",
  form: { hidden: ["company_id"] },
  // Perdidas ficam arquivadas no Odoo; a ERA também as mostra.
  domain: [["active", "in", [true, false]]],
  fields: [
    "name",
    "type",
    "partner_id",
    "partner_name",
    "contact_name",
    "email_from",
    "phone",
    "expected_revenue",
    "probability",
    "stage_id",
    "user_id",
    "team_id",
    "company_currency",
    "date_deadline",
    "priority",
    "lost_reason_id",
    "active",
  ],
  search: [
    "name",
    "partner_id.name",
    "partner_name",
    "contact_name",
    "email_from",
  ],
  order: "priority desc, id desc",
  filters: {
    open: [
      ["active", "=", true],
      ["probability", "<", 100],
    ],
    won: [
      ["active", "=", true],
      ["probability", "=", 100],
    ],
    lost: [["active", "=", false]],
    all: [],
  },
  defaultFilter: "open",
  newContext: () => ({ default_type: "opportunity" }),
  toEra: (row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    partner: ref(row.partner_id),
    company: text(row.partner_name),
    contact: text(row.contact_name),
    email: text(row.email_from),
    phone: text(row.phone),
    revenue: Number(row.expected_revenue ?? 0).toFixed(2),
    probability: Number(row.probability ?? 0),
    stage: ref(row.stage_id),
    salesperson: ref(row.user_id),
    team: ref(row.team_id),
    currency: ref(row.company_currency)?.name ?? null,
    deadline: text(row.date_deadline),
    priority: Number(row.priority ?? 0),
    lostReason: ref(row.lost_reason_id),
    outcome: leadOutcome(row),
  }),
  actions: {
    won: { allowed: (s) => s.outcome === "open", run: call("action_set_won") },
    // Motivo da perda opcional, como no assistente do Odoo.
    lost: {
      allowed: (s) => s.outcome !== "lost",
      run: async ({ odoo, companyId, model, id, body }) => {
        const reason = Number(body.lostReasonId);
        await odoo.execute(companyId, model, "action_set_lost", [[id]], {
          ...(Number.isInteger(reason) && reason > 0
            ? { lost_reason_id: reason }
            : {}),
        });
      },
    },
    // Reabrir uma perdida; o Odoo recalcula a probabilidade. Uma ganha volta
    // ao funil mudando a etapa no formulário, como no Odoo.
    reopen: {
      allowed: (s) => s.outcome === "lost",
      run: call("action_unarchive"),
    },
  },
};

@Injectable()
export class OdooCrm extends OdooApp {
  constructor(
    @Inject(OdooScope) scope: OdooScope,
    @Inject(OdooForms) forms: OdooForms,
  ) {
    super(scope, forms, CRM);
  }
}
export const OdooCrmController = appController("odoo/crm", "crm", OdooCrm);
