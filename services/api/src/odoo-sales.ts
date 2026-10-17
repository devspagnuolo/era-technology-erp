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
import { Domain, OdooClient } from "./odoo";
import { OdooScope } from "./odoo-scope";
import { OdooForms } from "./odoo-form";
import { OdooRecords, forAudit, recordId } from "./odoo-records";

// Orçamentos e pedidos de venda vivem no Odoo (sale.order); a ERA oferece a
// tela. O formulário completo (cabeçalho, itens e demais abas) vem da própria
// tela de pedido do Odoo; preços, impostos e totais são calculados por ele.
const MODEL = "sale.order";
const searchInput = z.object({
  q: z.string().trim().max(100).default(""),
  stage: z.enum(["all", "quotation", "order", "cancelled"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const STAGES = {
  quotation: ["draft", "sent"],
  order: ["sale"],
  cancelled: ["cancel"],
} as const;

type Many2one = [number, string] | false;
type OdooOrder = {
  id: number;
  name: string;
  partner_id: Many2one;
  state: "draft" | "sent" | "sale" | "cancel";
  date_order: string;
  validity_date: string | false;
  client_order_ref: string | false;
  amount_untaxed: number;
  amount_tax: number;
  amount_total: number;
  currency_id: Many2one;
  invoice_status: string | false;
};
const LIST_FIELDS = [
  "name",
  "partner_id",
  "state",
  "date_order",
  "validity_date",
  "client_order_ref",
  "amount_untaxed",
  "amount_tax",
  "amount_total",
  "currency_id",
  "invoice_status",
];
const ref = (value: Many2one) =>
  value ? { id: value[0], name: value[1] } : null;
const money = (value: number) => value.toFixed(2);

export function stageOf(state: string) {
  if (state === "sale") return "order";
  if (state === "cancel") return "cancelled";
  return "quotation";
}
export function toEraSale(order: OdooOrder) {
  return {
    id: order.id,
    number: order.name,
    customer: ref(order.partner_id),
    stage: stageOf(order.state),
    sent: order.state === "sent",
    date: order.date_order,
    validUntil: order.validity_date || null,
    customerRef: order.client_order_ref || null,
    untaxed: money(order.amount_untaxed),
    taxes: money(order.amount_tax),
    total: money(order.amount_total),
    currency: order.currency_id ? order.currency_id[1] : null,
    invoiceStatus: order.invoice_status || "no",
  };
}

@Injectable()
export class OdooSales {
  private odoo: OdooClient;
  readonly records: OdooRecords;
  constructor(
    @Inject(OdooScope) private scope: OdooScope,
    @Inject(OdooForms) forms: OdooForms,
  ) {
    this.odoo = scope.odoo;
    this.records = new OdooRecords(scope, forms, {
      model: MODEL,
      module: "odoo.sales",
      notFound: "Pedido não encontrado",
      // O Odoo escolhe a variante pelo modelo do produto no navegador; na ERA o
      // item usa diretamente o produto (variante).
      form: {
        hidden: ["company_id", "product_template_id"],
        labels: { product_id: "Produto" },
      },
    });
  }

  async list(req: AuthRequest, raw: unknown) {
    const { q, stage, page, pageSize } = parse(searchInput, raw);
    const companyId = await this.scope.company(req);
    const domain: Domain = [["company_id", "=", companyId]];
    if (stage !== "all") domain.push(["state", "in", [...STAGES[stage]]]);
    if (q)
      domain.push(
        "|",
        "|",
        ["name", "ilike", q],
        ["partner_id.name", "ilike", q],
        ["client_order_ref", "ilike", q],
      );
    const [items, total] = await Promise.all([
      this.odoo.execute<OdooOrder[]>(
        companyId,
        MODEL,
        "search_read",
        [domain],
        {
          fields: LIST_FIELDS,
          offset: (page - 1) * pageSize,
          limit: pageSize,
          order: "date_order desc, id desc",
        },
      ),
      this.odoo.execute<number>(companyId, MODEL, "search_count", [domain]),
    ]);
    return { items: items.map(toEraSale), total, page, pageSize };
  }

  // Formulário completo + resumo (número, situação, totais) para o cabeçalho.
  async form(req: AuthRequest, id?: number) {
    const form = await this.records.form(req, id);
    return { ...form, summary: id ? await this.summary(req, id) : null };
  }

  private async summary(req: AuthRequest, id: number) {
    const companyId = await this.scope.company(req);
    const [order] = await this.odoo.execute<OdooOrder[]>(
      companyId,
      MODEL,
      "search_read",
      [
        [
          ["id", "=", id],
          ["company_id", "=", companyId],
        ],
      ],
      { fields: LIST_FIELDS },
    );
    if (!order) throw new UnprocessableEntityException("Pedido não encontrado");
    return toEraSale(order);
  }

  confirm(req: AuthRequest, id: number) {
    return this.transition(req, id, "confirm", ["quotation"], "action_confirm");
  }
  cancel(req: AuthRequest, id: number) {
    return this.transition(
      req,
      id,
      "cancel",
      ["quotation", "order"],
      "action_cancel",
    );
  }
  reopen(req: AuthRequest, id: number) {
    return this.transition(req, id, "reopen", ["cancelled"], "action_draft");
  }

  private async transition(
    req: AuthRequest,
    id: number,
    action: string,
    from: string[],
    method: string,
  ) {
    const companyId = await this.scope.company(req);
    const before = await this.summary(req, id);
    if (!from.includes(before.stage))
      throw new UnprocessableEntityException(
        "Esta ação não está disponível para o documento atual",
      );
    // disable_cancel_warning evita o assistente de e-mail do cancelamento.
    await this.odoo.execute(companyId, MODEL, method, [[id]], {
      context: { disable_cancel_warning: true },
    });
    const after = await this.summary(req, id);
    await this.scope.audit(
      req,
      "odoo.sales",
      MODEL,
      action,
      id,
      forAudit(before),
      forAudit(after),
    );
    return after;
  }
}

@Controller("odoo/sales")
export class OdooSalesController {
  constructor(@Inject(OdooSales) private sales: OdooSales) {}
  @Get() @Permission("sales:read") list(
    @Req() req: AuthRequest,
    @Query() query: unknown,
  ) {
    return this.sales.list(req, query);
  }
  @Get("form") @Permission("sales:create") newForm(@Req() req: AuthRequest) {
    return this.sales.form(req);
  }
  @Get(":id/form") @Permission("sales:read") form(
    @Req() req: AuthRequest,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.sales.form(req, id);
  }
  @Post("onchange") @Permission("sales:read") onchange(
    @Req() req: AuthRequest,
    @Body() body: unknown,
    @Query("id") id?: string,
  ) {
    return this.sales.records.onchange(req, body, recordId(id));
  }
  @Post("lookup") @Permission("sales:read") lookup(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.sales.records.lookup(req, body);
  }
  @Post() @Permission("sales:create") create(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.sales.records.create(req, body);
  }
  @Patch(":id") @Permission("sales:update") update(
    @Req() req: AuthRequest,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.sales.records.update(req, id, body);
  }
  @Post(":id/confirm") @Permission("sales:confirm") confirm(
    @Req() req: AuthRequest,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.sales.confirm(req, id);
  }
  @Post(":id/cancel") @Permission("sales:confirm") cancel(
    @Req() req: AuthRequest,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.sales.cancel(req, id);
  }
  @Post(":id/reopen") @Permission("sales:update") reopen(
    @Req() req: AuthRequest,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.sales.reopen(req, id);
  }
}
