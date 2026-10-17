import {
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  NotFoundException,
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

// Orçamentos e pedidos de venda vivem no Odoo (sale.order); a ERA só oferece a
// tela. Preço, impostos e totais são sempre calculados pelo Odoo.
const MODEL = "sale.order";
const LINE_MODEL = "sale.order.line";
const price = z
  .string()
  .regex(
    /^\d{1,12}(\.\d{1,2})?$/,
    "Informe um valor positivo com até duas casas decimais",
  );
const line = z
  .object({
    productId: z.number().int().positive(),
    quantity: z.number().positive().max(1_000_000),
    // Sem preço, o Odoo aplica o preço de venda do produto.
    price: price.optional(),
    discount: z.number().min(0).max(100).optional(),
  })
  .strict();
const fields = {
  customerId: z.number().int().positive(),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD")
    .nullable(),
  customerRef: z.string().trim().max(120).nullable(),
  note: z.string().trim().max(2000).nullable(),
  lines: z.array(line).min(1, "Inclua ao menos um item").max(200),
};
export const saleInput = z
  .object({
    ...fields,
    validUntil: fields.validUntil.optional(),
    customerRef: fields.customerRef.optional(),
    note: fields.note.optional(),
  })
  .strict();
export const saleUpdate = z
  .object(fields)
  .partial()
  .strict()
  .refine(
    (value) => Object.values(value).some((v) => v !== undefined),
    "Informe ao menos um campo para alterar",
  );
const searchInput = z.object({
  q: z.string().trim().max(100).default(""),
  stage: z.enum(["all", "quotation", "order", "cancelled"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const optionsInput = z.object({
  q: z.string().trim().max(100).default(""),
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
  note: string | false;
  amount_untaxed: number;
  amount_tax: number;
  amount_total: number;
  currency_id: Many2one;
  invoice_status: string | false;
  order_line?: number[];
};
type OdooLine = {
  id: number;
  product_id: Many2one;
  name: string;
  product_uom_qty: number;
  price_unit: number;
  discount: number;
  price_subtotal: number;
  price_total: number;
  product_uom: Many2one;
  qty_delivered: number;
  qty_invoiced: number;
  display_type: string | false;
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
const LINE_FIELDS = [
  "product_id",
  "name",
  "product_uom_qty",
  "price_unit",
  "discount",
  "price_subtotal",
  "price_total",
  "product_uom",
  "qty_delivered",
  "qty_invoiced",
  "display_type",
];
const ref = (value: Many2one) =>
  value ? { id: value[0], name: value[1] } : null;
const money = (value: number) => value.toFixed(2);
// O Odoo guarda observações como HTML; a ERA trabalha com texto simples.
export const plainNote = (html: string | false) =>
  html
    ? html
        .replace(/<br\s*\/?>|<\/p>\s*<p[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .trim() || null
    : null;
const htmlNote = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split("\n")
    .map((part) => "<p>" + part + "</p>")
    .join("");

export function stageOf(state: OdooOrder["state"]) {
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
export function toEraLine(item: OdooLine) {
  return {
    id: item.id,
    product: ref(item.product_id),
    description: item.name,
    quantity: item.product_uom_qty,
    uom: item.product_uom ? item.product_uom[1] : null,
    price: money(item.price_unit),
    discount: item.discount,
    subtotal: money(item.price_subtotal),
    total: money(item.price_total),
    delivered: item.qty_delivered,
    invoiced: item.qty_invoiced,
  };
}
export function toOdooSale(input: z.infer<typeof saleUpdate>) {
  const values: Record<string, unknown> = {};
  if (input.customerId !== undefined) values.partner_id = input.customerId;
  if (input.validUntil !== undefined)
    values.validity_date = input.validUntil || false;
  if (input.customerRef !== undefined)
    values.client_order_ref = input.customerRef || false;
  if (input.note !== undefined)
    values.note = input.note ? htmlNote(input.note) : false;
  if (input.lines !== undefined)
    // Substitui todos os itens: (5) limpa e (0) cria cada linha informada.
    values.order_line = [
      [5, 0, 0],
      ...input.lines.map((item) => {
        const values: Record<string, unknown> = {
          product_id: item.productId,
          product_uom_qty: item.quantity,
        };
        if (item.price !== undefined) values.price_unit = Number(item.price);
        if (item.discount !== undefined) values.discount = item.discount;
        return [0, 0, values];
      }),
    ];
  return values;
}

@Injectable()
export class OdooSales {
  private odoo: OdooClient;
  constructor(@Inject(OdooScope) private scope: OdooScope) {
    this.odoo = scope.odoo;
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

  // Clientes e produtos vendáveis da empresa, para montar o orçamento.
  async options(req: AuthRequest, raw: unknown) {
    const { q } = parse(optionsInput, raw);
    const companyId = await this.scope.company(req);
    const customers: Domain = [
      ["company_id", "=", companyId],
      ["parent_id", "=", false],
    ];
    const products: Domain = [
      ["company_id", "=", companyId],
      ["sale_ok", "=", true],
    ];
    if (q) {
      customers.push("|", ["name", "ilike", q], ["vat", "ilike", q]);
      products.push(
        "|",
        "|",
        ["name", "ilike", q],
        ["default_code", "ilike", q],
        ["barcode", "ilike", q],
      );
    }
    const [partners, variants] = await Promise.all([
      this.odoo.execute<
        Array<{ id: number; name: string; vat: string | false }>
      >(companyId, "res.partner", "search_read", [customers], {
        fields: ["name", "vat"],
        order: "name asc",
        limit: 50,
      }),
      this.odoo.execute<
        Array<{
          id: number;
          name: string;
          default_code: string | false;
          lst_price: number;
        }>
      >(companyId, "product.product", "search_read", [products], {
        fields: ["name", "default_code", "lst_price"],
        order: "name asc",
        limit: 50,
      }),
    ]);
    return {
      customers: partners.map((p) => ({
        id: p.id,
        name: p.name,
        document: p.vat || null,
      })),
      products: variants.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.default_code || null,
        price: money(p.lst_price),
      })),
    };
  }

  async get(req: AuthRequest, id: number) {
    return this.read(await this.scope.company(req), id);
  }

  async create(req: AuthRequest, raw: unknown) {
    const input = parse(saleInput, raw);
    const companyId = await this.scope.company(req);
    await this.assertReferences(companyId, input);
    const values = { ...toOdooSale(input), company_id: companyId };
    const [id] = await this.odoo.execute<number[]>(companyId, MODEL, "create", [
      [values],
    ]);
    const after = await this.read(companyId, id);
    await this.scope.audit(req, "odoo.sales", MODEL, "create", id, null, after);
    return after;
  }

  async update(req: AuthRequest, id: number, raw: unknown) {
    const input = parse(saleUpdate, raw);
    const companyId = await this.scope.company(req);
    const before = await this.read(companyId, id);
    if (before.stage !== "quotation")
      throw new UnprocessableEntityException(
        "Somente orçamentos podem ser alterados",
      );
    await this.assertReferences(companyId, input);
    await this.odoo.execute(companyId, MODEL, "write", [
      [id],
      toOdooSale(input),
    ]);
    const after = await this.read(companyId, id);
    await this.scope.audit(
      req,
      "odoo.sales",
      MODEL,
      "update",
      id,
      before,
      after,
    );
    return after;
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
    const before = await this.read(companyId, id);
    if (!from.includes(before.stage))
      throw new UnprocessableEntityException(
        "Esta ação não está disponível para o documento atual",
      );
    // disable_cancel_warning evita o assistente de e-mail do cancelamento.
    await this.odoo.execute(companyId, MODEL, method, [[id]], {
      context: { disable_cancel_warning: true },
    });
    const after = await this.read(companyId, id);
    await this.scope.audit(req, "odoo.sales", MODEL, action, id, before, after);
    return after;
  }

  private async read(companyId: number, id: number) {
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
      { fields: [...LIST_FIELDS, "note", "order_line"] },
    );
    if (!order) throw new NotFoundException("Pedido não encontrado");
    const lines = await this.odoo.execute<OdooLine[]>(
      companyId,
      LINE_MODEL,
      "search_read",
      [[["order_id", "=", id]]],
      { fields: LINE_FIELDS, order: "sequence asc, id asc" },
    );
    return {
      ...toEraSale(order),
      note: plainNote(order.note),
      lines: lines.filter((item) => !item.display_type).map(toEraLine),
    };
  }

  // Cliente e produtos precisam pertencer à empresa Odoo vinculada ao tenant.
  private async assertReferences(
    companyId: number,
    input: { customerId?: number; lines?: Array<{ productId: number }> },
  ) {
    if (input.customerId !== undefined) {
      const found = await this.odoo.execute<number>(
        companyId,
        "res.partner",
        "search_count",
        [
          [
            ["id", "=", input.customerId],
            ["company_id", "=", companyId],
          ],
        ],
      );
      if (!found) throw new NotFoundException("Cliente não encontrado");
    }
    if (input.lines) {
      const ids = [...new Set(input.lines.map((item) => item.productId))];
      const found = await this.odoo.execute<number>(
        companyId,
        "product.product",
        "search_count",
        [
          [
            ["id", "in", ids],
            ["company_id", "=", companyId],
            ["sale_ok", "=", true],
          ],
        ],
      );
      if (found !== ids.length)
        throw new NotFoundException("Produto não encontrado");
    }
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
  @Get("options") @Permission("sales:create") options(
    @Req() req: AuthRequest,
    @Query() query: unknown,
  ) {
    return this.sales.options(req, query);
  }
  @Get(":id") @Permission("sales:read") get(
    @Req() req: AuthRequest,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.sales.get(req, id);
  }
  @Post() @Permission("sales:create") create(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.sales.create(req, body);
  }
  @Patch(":id") @Permission("sales:update") update(
    @Req() req: AuthRequest,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.sales.update(req, id, body);
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
