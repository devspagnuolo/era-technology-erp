import { Inject, Injectable } from "@nestjs/common";
import { OdooScope } from "./odoo-scope";
import { OdooForms } from "./odoo-form";
import { AppConfig, OdooApp, appController, call, ref, text } from "./odoo-app";

// Ordens de produção (mrp.production) com o formulário do Odoo: produto,
// lista de materiais, componentes e operação. O Odoo reserva os componentes e
// dá entrada no produto acabado; a ERA dispara as etapas.
const MODEL = "mrp.production";
export const PRODUCTION_STAGES = {
  draft: ["draft"],
  confirmed: ["confirmed"],
  progress: ["progress", "to_close"],
  done: ["done"],
  cancelled: ["cancel"],
} as const;
export type ProductionStage = keyof typeof PRODUCTION_STAGES;
export function productionStage(state: string): ProductionStage {
  for (const [stage, states] of Object.entries(PRODUCTION_STAGES))
    if ((states as readonly string[]).includes(state))
      return stage as ProductionStage;
  return "draft";
}
const states = (...stages: ProductionStage[]) =>
  stages.flatMap((s) => [...PRODUCTION_STAGES[s]]);

export const MANUFACTURING: AppConfig = {
  model: MODEL,
  module: "odoo.manufacturing",
  notFound: "Ordem de produção não encontrada",
  form: { hidden: ["company_id"] },
  fields: [
    "name",
    "product_id",
    "product_qty",
    "qty_producing",
    "product_uom_id",
    "bom_id",
    "state",
    "reservation_state",
    "components_availability",
    "date_start",
    "date_finished",
    "user_id",
    "origin",
    "priority",
  ],
  search: ["name", "product_id.name", "origin"],
  order: "priority desc, date_start desc, id desc",
  filters: {
    open: [["state", "in", states("draft", "confirmed", "progress")]],
    draft: [["state", "in", states("draft")]],
    confirmed: [["state", "in", states("confirmed")]],
    progress: [["state", "in", states("progress")]],
    done: [["state", "in", states("done")]],
    cancelled: [["state", "in", states("cancelled")]],
    all: [],
  },
  defaultFilter: "open",
  toEra: (row) => ({
    id: row.id,
    number: row.name,
    product: ref(row.product_id),
    quantity: Number(row.product_qty ?? 0),
    producing: Number(row.qty_producing ?? 0),
    unit: ref(row.product_uom_id)?.name ?? null,
    bom: ref(row.bom_id),
    stage: productionStage(String(row.state)),
    state: row.state,
    reserved: row.reservation_state === "assigned",
    availability: text(row.components_availability),
    start: text(row.date_start),
    finished: text(row.date_finished),
    responsible: ref(row.user_id),
    origin: text(row.origin),
  }),
  actions: {
    confirm: {
      allowed: (s) => s.stage === "draft",
      run: call("action_confirm"),
    },
    assign: {
      allowed: (s) => ["confirmed", "progress"].includes(String(s.stage)),
      run: call("action_assign"),
    },
    // Sem quantidade informada, o Odoo produz a quantidade total e consome os
    // componentes; backorder ou consumo divergente pedem o assistente do Odoo.
    done: {
      allowed: (s) => ["confirmed", "progress"].includes(String(s.stage)),
      run: call("button_mark_done", { skip_redirection: true }),
    },
    cancel: {
      allowed: (s) =>
        ["draft", "confirmed", "progress"].includes(String(s.stage)),
      run: call("action_cancel"),
    },
  },
};

@Injectable()
export class OdooManufacturing extends OdooApp {
  constructor(
    @Inject(OdooScope) scope: OdooScope,
    @Inject(OdooForms) forms: OdooForms,
  ) {
    super(scope, forms, MANUFACTURING);
  }
}
export const OdooManufacturingController = appController(
  "odoo/manufacturing",
  "manufacturing",
  OdooManufacturing,
  "manufacturing:produce",
);
