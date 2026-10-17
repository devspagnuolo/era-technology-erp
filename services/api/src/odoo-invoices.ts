import {
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UnprocessableEntityException,
} from "@nestjs/common";
import { z } from "zod";
import { AuthRequest, Permission, parse } from "./auth";
import { Domain } from "./odoo";
import { OdooScope } from "./odoo-scope";
import { OdooForms } from "./odoo-form";
import { OdooRecords, forAudit, recordId } from "./odoo-records";

// Faturas de cliente (contas a receber) e de fornecedor (contas a pagar),
// com notas de crédito, em account.move. O formulário completo vem da tela de
// fatura do Odoo; impostos, vencimentos e lançamentos contábeis são do Odoo.
const MODEL = "account.move";
const TYPES = {
  customer: ["out_invoice", "out_refund"],
  vendor: ["in_invoice", "in_refund"],
} as const;
type Side = keyof typeof TYPES;
const ALL_TYPES = [...TYPES.customer, ...TYPES.vendor];
const searchInput = z.object({
  side: z.enum(["customer", "vendor"]).default("customer"),
  q: z.string().trim().max(100).default(""),
  stage: z.enum(["all", "draft", "open", "paid", "cancelled"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const newInput = z.object({
  side: z.enum(["customer", "vendor"]).default("customer"),
  refund: z.enum(["0", "1"]).default("0"),
});
const actionInput = z.enum(["post", "pay", "draft", "cancel"]);
type Action = z.infer<typeof actionInput>;

type Many2one = [number, string] | false;
type OdooInvoice = {
  id: number;
  name: string;
  move_type: string;
  partner_id: Many2one;
  invoice_date: string | false;
  invoice_date_due: string | false;
  ref: string | false;
  amount_untaxed: number;
  amount_tax: number;
  amount_total: number;
  amount_residual: number;
  currency_id: Many2one;
  state: "draft" | "posted" | "cancel";
  payment_state: string;
};
const FIELDS = [
  "name",
  "move_type",
  "partner_id",
  "invoice_date",
  "invoice_date_due",
  "ref",
  "amount_untaxed",
  "amount_tax",
  "amount_total",
  "amount_residual",
  "currency_id",
  "state",
  "payment_state",
];
const money = (value: number) => value.toFixed(2);

export type InvoiceStage = "draft" | "open" | "paid" | "cancelled";
// Em aberto = confirmada e ainda não paga (inclui pagamento parcial).
export function invoiceStage(state: string, payment: string): InvoiceStage {
  if (state === "draft") return "draft";
  if (state === "cancel") return "cancelled";
  return ["paid", "in_payment", "reversed"].includes(payment) ? "paid" : "open";
}
export function toEraInvoice(invoice: OdooInvoice) {
  return {
    id: invoice.id,
    number: invoice.name && invoice.name !== "/" ? invoice.name : null,
    type: invoice.move_type,
    refund: invoice.move_type.endsWith("_refund"),
    partner: invoice.partner_id
      ? { id: invoice.partner_id[0], name: invoice.partner_id[1] }
      : null,
    date: invoice.invoice_date || null,
    due: invoice.invoice_date_due || null,
    reference: invoice.ref || null,
    untaxed: money(invoice.amount_untaxed),
    taxes: money(invoice.amount_tax),
    total: money(invoice.amount_total),
    residual: money(invoice.amount_residual),
    currency: invoice.currency_id ? invoice.currency_id[1] : null,
    stage: invoiceStage(invoice.state, invoice.payment_state),
    state: invoice.state,
    payment: invoice.payment_state,
  };
}
const STAGE_DOMAIN: Record<Exclude<InvoiceStage, never>, Domain> = {
  draft: [["state", "=", "draft"]],
  open: [
    ["state", "=", "posted"],
    ["payment_state", "in", ["not_paid", "partial"]],
  ],
  paid: [
    ["state", "=", "posted"],
    ["payment_state", "in", ["paid", "in_payment", "reversed"]],
  ],
  cancelled: [["state", "=", "cancel"]],
};

@Injectable()
export class OdooInvoices {
  readonly records: OdooRecords;
  constructor(
    @Inject(OdooScope) private scope: OdooScope,
    @Inject(OdooForms) forms: OdooForms,
  ) {
    this.records = new OdooRecords(scope, forms, {
      model: MODEL,
      module: "odoo.invoices",
      notFound: "Fatura não encontrada",
      form: { hidden: ["company_id"] },
      // Só faturas e notas de crédito; lançamentos contábeis ficam no Odoo.
      domain: [["move_type", "in", ALL_TYPES]],
      // O tipo é somente leitura na tela do Odoo; ao criar, vem em "extra".
      prepare: ({ values, extra, current }) => {
        if (current) return;
        if (!ALL_TYPES.includes(extra.move_type as never))
          throw new UnprocessableEntityException("Tipo de fatura inválido");
        values.move_type = extra.move_type;
      },
    });
  }

  async list(req: AuthRequest, raw: unknown) {
    const { side, q, stage, page, pageSize } = parse(searchInput, raw);
    const companyId = await this.scope.company(req);
    const domain: Domain = [
      ["company_id", "=", companyId],
      ["move_type", "in", [...TYPES[side]]],
    ];
    if (stage !== "all") domain.push(...STAGE_DOMAIN[stage]);
    if (q)
      domain.push(
        "|",
        "|",
        ["name", "ilike", q],
        ["partner_id.name", "ilike", q],
        ["ref", "ilike", q],
      );
    const odoo = this.scope.odoo;
    const [items, total] = await Promise.all([
      odoo.execute<OdooInvoice[]>(companyId, MODEL, "search_read", [domain], {
        fields: FIELDS,
        offset: (page - 1) * pageSize,
        limit: pageSize,
        order: "invoice_date desc, id desc",
      }),
      odoo.execute<number>(companyId, MODEL, "search_count", [domain]),
    ]);
    return { items: items.map(toEraInvoice), total, page, pageSize };
  }

  async form(req: AuthRequest, id?: number, raw?: unknown) {
    if (id) {
      const form = await this.records.form(req, id);
      return { ...form, summary: await this.summary(req, id) };
    }
    const { side, refund } = parse(newInput, raw ?? {});
    const type = TYPES[side][refund === "1" ? 1 : 0];
    const form = await this.records.form(req, undefined, {
      default_move_type: type,
    });
    return {
      ...form,
      values: { ...form.values, move_type: type },
      summary: null,
    };
  }

  async summary(req: AuthRequest, id: number) {
    const companyId = await this.scope.company(req);
    const [invoice] = await this.scope.odoo.execute<OdooInvoice[]>(
      companyId,
      MODEL,
      "search_read",
      [
        [
          ["id", "=", id],
          ["company_id", "=", companyId],
          ["move_type", "in", ALL_TYPES],
        ],
      ],
      { fields: FIELDS },
    );
    if (!invoice)
      throw new UnprocessableEntityException("Fatura não encontrada");
    return toEraInvoice(invoice);
  }

  async run(req: AuthRequest, id: number, action: Action) {
    const companyId = await this.scope.company(req);
    const before = await this.summary(req, id);
    const allowed: Record<Action, boolean> = {
      post: before.state === "draft",
      pay: before.stage === "open",
      draft: before.state === "cancel" || before.stage === "open",
      cancel: before.state === "draft",
    };
    if (!allowed[action])
      throw new UnprocessableEntityException(
        "Esta ação não está disponível para a fatura atual",
      );
    const odoo = this.scope.odoo;
    if (action === "pay") {
      // Pagamento integral do saldo, no diário e forma padrão do Odoo.
      const context = { active_model: MODEL, active_ids: [id] };
      const [wizard] = await odoo.execute<number[]>(
        companyId,
        "account.payment.register",
        "create",
        [[{}]],
        { context },
      );
      await odoo.execute(
        companyId,
        "account.payment.register",
        "action_create_payments",
        [[wizard]],
        { context },
      );
    } else {
      const method = {
        post: "action_post",
        draft: "button_draft",
        cancel: "button_cancel",
      }[action];
      await odoo.execute(companyId, MODEL, method, [[id]]);
    }
    const after = await this.summary(req, id);
    await this.scope.audit(
      req,
      "odoo.invoices",
      MODEL,
      action,
      id,
      forAudit(before),
      forAudit(after),
    );
    return after;
  }
}

@Controller("odoo/invoices")
export class OdooInvoicesController {
  constructor(@Inject(OdooInvoices) private invoices: OdooInvoices) {}
  @Get() @Permission("invoices:read") list(
    @Req() req: AuthRequest,
    @Query() query: unknown,
  ) {
    return this.invoices.list(req, query);
  }
  @Get("form") @Permission("invoices:create") newForm(
    @Req() req: AuthRequest,
    @Query() query: unknown,
  ) {
    return this.invoices.form(req, undefined, query);
  }
  @Get(":id/form") @Permission("invoices:read") form(
    @Req() req: AuthRequest,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.invoices.form(req, id);
  }
  @Post("onchange") @Permission("invoices:read") onchange(
    @Req() req: AuthRequest,
    @Body() body: unknown,
    @Query("id") id?: string,
  ) {
    return this.invoices.records.onchange(req, body, recordId(id));
  }
  @Post("lookup") @Permission("invoices:read") lookup(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.invoices.records.lookup(req, body);
  }
  @Post() @Permission("invoices:create") create(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.invoices.records.create(req, body);
  }
  @Patch(":id") @Permission("invoices:update") update(
    @Req() req: AuthRequest,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.invoices.records.update(req, id, body);
  }
  @Post(":id/:action") @Permission("invoices:post") run(
    @Req() req: AuthRequest,
    @Param("id", ParseIntPipe) id: number,
    @Param("action") action: string,
  ) {
    return this.invoices.run(req, id, parse(actionInput, action));
  }
}
