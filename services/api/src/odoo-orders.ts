import {
  Body,
  Controller,
  Get,
  Inject,
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
import { FormOptions, OdooForms } from "./odoo-form";
import { OdooRecords, forAudit, recordId } from "./odoo-records";

// Pedidos do Odoo (venda, compra): cotação → pedido → cancelado. A ERA lista,
// abre o formulário completo do Odoo e dispara as mudanças de situação; preços,
// impostos e totais são sempre calculados pelo Odoo.
export type Stage = "quotation" | "order" | "cancelled";
export type OrderConfig = {
  model: string;
  module: string; // nome do módulo na auditoria ERA
  notFound: string;
  form: FormOptions;
  stages: Record<Stage, string[]>; // situações do Odoo em cada etapa ERA
  confirmFrom: string[]; // situações que podem ser confirmadas
  reference: string; // referência do parceiro (cliente/fornecedor)
  methods: { confirm: string; cancel: string; reopen: string };
};

type Many2one = [number, string] | false;
export type OdooOrder = {
  id: number;
  name: string;
  partner_id: Many2one;
  state: string;
  date_order: string;
  amount_untaxed: number;
  amount_tax: number;
  amount_total: number;
  currency_id: Many2one;
  invoice_status: string | false;
  [reference: string]: unknown;
};
const searchInput = z.object({
  q: z.string().trim().max(100).default(""),
  stage: z.enum(["all", "quotation", "order", "cancelled"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const money = (value: number) => value.toFixed(2);

export function stageOf(stages: Record<Stage, string[]>, state: string): Stage {
  if (stages.order.includes(state)) return "order";
  if (stages.cancelled.includes(state)) return "cancelled";
  return "quotation";
}

export class OdooOrders {
  readonly records: OdooRecords;
  constructor(
    private scope: OdooScope,
    forms: OdooForms,
    private config: OrderConfig,
  ) {
    this.records = new OdooRecords(scope, forms, config);
  }

  private get fields() {
    return [
      "name",
      "partner_id",
      "state",
      "date_order",
      this.config.reference,
      "amount_untaxed",
      "amount_tax",
      "amount_total",
      "currency_id",
      "invoice_status",
    ];
  }

  toEra(order: OdooOrder) {
    return {
      id: order.id,
      number: order.name,
      partner: order.partner_id
        ? { id: order.partner_id[0], name: order.partner_id[1] }
        : null,
      stage: stageOf(this.config.stages, order.state),
      state: order.state,
      date: order.date_order,
      reference: (order[this.config.reference] as string | false) || null,
      untaxed: money(order.amount_untaxed),
      taxes: money(order.amount_tax),
      total: money(order.amount_total),
      currency: order.currency_id ? order.currency_id[1] : null,
      invoiceStatus: order.invoice_status || "no",
    };
  }

  async list(req: AuthRequest, raw: unknown) {
    const { q, stage, page, pageSize } = parse(searchInput, raw);
    const companyId = await this.scope.company(req);
    const domain: Domain = [["company_id", "=", companyId]];
    if (stage !== "all")
      domain.push(["state", "in", [...this.config.stages[stage]]]);
    if (q)
      domain.push(
        "|",
        "|",
        ["name", "ilike", q],
        ["partner_id.name", "ilike", q],
        [this.config.reference, "ilike", q],
      );
    const odoo = this.scope.odoo;
    const [items, total] = await Promise.all([
      odoo.execute<OdooOrder[]>(
        companyId,
        this.config.model,
        "search_read",
        [domain],
        {
          fields: this.fields,
          offset: (page - 1) * pageSize,
          limit: pageSize,
          order: "date_order desc, id desc",
        },
      ),
      odoo.execute<number>(companyId, this.config.model, "search_count", [
        domain,
      ]),
    ]);
    return { items: items.map((o) => this.toEra(o)), total, page, pageSize };
  }

  // Formulário completo + resumo (número, situação, totais) para o cabeçalho.
  async form(req: AuthRequest, id?: number) {
    const form = await this.records.form(req, id);
    return { ...form, summary: id ? await this.summary(req, id) : null };
  }

  async summary(req: AuthRequest, id: number) {
    const companyId = await this.scope.company(req);
    const [order] = await this.scope.odoo.execute<OdooOrder[]>(
      companyId,
      this.config.model,
      "search_read",
      [
        [
          ["id", "=", id],
          ["company_id", "=", companyId],
        ],
      ],
      { fields: this.fields },
    );
    if (!order) throw new UnprocessableEntityException(this.config.notFound);
    return this.toEra(order);
  }

  confirm(req: AuthRequest, id: number) {
    return this.transition(req, id, "confirm", this.config.confirmFrom);
  }
  cancel(req: AuthRequest, id: number) {
    const { quotation, order } = this.config.stages;
    return this.transition(req, id, "cancel", [...quotation, ...order]);
  }
  reopen(req: AuthRequest, id: number) {
    return this.transition(req, id, "reopen", this.config.stages.cancelled);
  }

  private async transition(
    req: AuthRequest,
    id: number,
    action: keyof OrderConfig["methods"],
    from: string[],
  ) {
    const companyId = await this.scope.company(req);
    const before = await this.summary(req, id);
    if (!from.includes(before.state))
      throw new UnprocessableEntityException(
        "Esta ação não está disponível para o documento atual",
      );
    // disable_cancel_warning evita o assistente de e-mail do cancelamento.
    await this.scope.odoo.execute(
      companyId,
      this.config.model,
      this.config.methods[action],
      [[id]],
      { context: { disable_cancel_warning: true } },
    );
    const after = await this.summary(req, id);
    await this.scope.audit(
      req,
      this.config.module,
      this.config.model,
      action,
      id,
      forAudit(before),
      forAudit(after),
    );
    return after;
  }
}

// Rotas iguais para cada tipo de pedido; muda só o caminho e as permissões.
export function ordersController(
  path: string,
  permission: string,
  service: abstract new (...args: never[]) => { orders: OdooOrders },
) {
  @Controller(path)
  class OrdersController {
    constructor(@Inject(service) private service: { orders: OdooOrders }) {}
    get orders() {
      return this.service.orders;
    }
    @Get() @Permission(permission + ":read") list(
      @Req() req: AuthRequest,
      @Query() query: unknown,
    ) {
      return this.orders.list(req, query);
    }
    @Get("form") @Permission(permission + ":create") newForm(
      @Req() req: AuthRequest,
    ) {
      return this.orders.form(req);
    }
    @Get(":id/form") @Permission(permission + ":read") form(
      @Req() req: AuthRequest,
      @Param("id", ParseIntPipe) id: number,
    ) {
      return this.orders.form(req, id);
    }
    @Post("onchange") @Permission(permission + ":read") onchange(
      @Req() req: AuthRequest,
      @Body() body: unknown,
      @Query("id") id?: string,
    ) {
      return this.orders.records.onchange(req, body, recordId(id));
    }
    @Post("lookup") @Permission(permission + ":read") lookup(
      @Req() req: AuthRequest,
      @Body() body: unknown,
    ) {
      return this.orders.records.lookup(req, body);
    }
    @Post() @Permission(permission + ":create") create(
      @Req() req: AuthRequest,
      @Body() body: unknown,
    ) {
      return this.orders.records.create(req, body);
    }
    @Patch(":id") @Permission(permission + ":update") update(
      @Req() req: AuthRequest,
      @Param("id", ParseIntPipe) id: number,
      @Body() body: unknown,
    ) {
      return this.orders.records.update(req, id, body);
    }
    @Post(":id/confirm") @Permission(permission + ":confirm") confirm(
      @Req() req: AuthRequest,
      @Param("id", ParseIntPipe) id: number,
    ) {
      return this.orders.confirm(req, id);
    }
    @Post(":id/cancel") @Permission(permission + ":confirm") cancel(
      @Req() req: AuthRequest,
      @Param("id", ParseIntPipe) id: number,
    ) {
      return this.orders.cancel(req, id);
    }
    @Post(":id/reopen") @Permission(permission + ":update") reopen(
      @Req() req: AuthRequest,
      @Param("id", ParseIntPipe) id: number,
    ) {
      return this.orders.reopen(req, id);
    }
  }
  return OrdersController;
}
