import {
  Body,
  ConflictException,
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
} from "@nestjs/common";
import { z } from "zod";
import { AuthRequest, Permission, parse } from "./auth";
import { Domain, OdooClient } from "./odoo";
import { OdooScope, auditAction } from "./odoo-scope";

// Produtos vivem no Odoo (product.template). A ERA consulta e grava por meio da
// API do Odoo e registra cada alteração na própria auditoria.
const MODEL = "product.template";
const price = z
  .string()
  .regex(
    /^\d{1,12}(\.\d{1,2})?$/,
    "Informe um valor positivo com até duas casas decimais",
  );
const fields = {
  name: z.string().trim().min(2).max(200),
  sku: z.string().trim().min(1).max(64),
  barcode: z.string().trim().max(64).nullable(),
  salePrice: price,
  cost: price,
  categoryId: z.number().int().positive(),
  uomId: z.number().int().positive(),
  type: z.enum(["consu", "service"]),
  tracksStock: z.boolean(),
};
export const odooProductInput = z
  .object({
    ...fields,
    barcode: fields.barcode.optional(),
    cost: fields.cost.default("0"),
    categoryId: fields.categoryId.optional(),
    uomId: fields.uomId.optional(),
    type: fields.type.default("consu"),
    tracksStock: fields.tracksStock.default(true),
  })
  .strict();
export const odooProductUpdate = z
  .object(fields)
  .partial()
  .extend({ active: z.boolean().optional() })
  .strict()
  .refine(
    (value) => Object.values(value).some((v) => v !== undefined),
    "Informe ao menos um campo para alterar",
  );
const searchInput = z.object({
  q: z.string().trim().max(100).default(""),
  status: z.enum(["active", "archived", "all"]).default("active"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

type Many2one = [number, string] | false;
type OdooProduct = {
  id: number;
  name: string;
  default_code: string | false;
  barcode: string | false;
  list_price: number;
  standard_price: number;
  categ_id: Many2one;
  uom_id: Many2one;
  type: string;
  is_storable?: boolean;
  qty_available?: number;
  active: boolean;
};
const READ_FIELDS = [
  "name",
  "default_code",
  "barcode",
  "list_price",
  "standard_price",
  "categ_id",
  "uom_id",
  "type",
  "active",
];
const ref = (value: Many2one) =>
  value ? { id: value[0], name: value[1] } : null;
export function toEra(product: OdooProduct) {
  return {
    id: product.id,
    name: product.name,
    sku: product.default_code || "",
    barcode: product.barcode || null,
    salePrice: product.list_price.toFixed(2),
    cost: product.standard_price.toFixed(2),
    category: ref(product.categ_id),
    uom: ref(product.uom_id),
    type: product.type,
    tracksStock: product.is_storable ?? false,
    quantity: product.qty_available ?? null,
    active: product.active,
  };
}
export function toOdoo(input: z.infer<typeof odooProductUpdate>) {
  const values: Record<string, unknown> = {};
  if (input.name !== undefined) values.name = input.name;
  if (input.sku !== undefined) values.default_code = input.sku;
  if (input.barcode !== undefined) values.barcode = input.barcode || false;
  if (input.salePrice !== undefined)
    values.list_price = Number(input.salePrice);
  if (input.cost !== undefined) values.standard_price = Number(input.cost);
  if (input.categoryId !== undefined) values.categ_id = input.categoryId;
  if (input.uomId !== undefined) {
    values.uom_id = input.uomId;
    values.uom_po_id = input.uomId;
  }
  if (input.type !== undefined) values.type = input.type;
  if (input.tracksStock !== undefined)
    values.is_storable = input.type === "service" ? false : input.tracksStock;
  if (input.active !== undefined) values.active = input.active;
  return values;
}

@Injectable()
export class OdooProducts {
  private optionalFields: Promise<string[]> | null = null;
  private odoo: OdooClient;
  constructor(@Inject(OdooScope) private scope: OdooScope) {
    this.odoo = scope.odoo;
  }

  async list(req: AuthRequest, raw: unknown) {
    const { q, status, page, pageSize } = parse(searchInput, raw);
    const companyId = await this.scope.company(req);
    const domain: Domain = [["company_id", "=", companyId]];
    if (status !== "all") domain.push(["active", "=", status === "active"]);
    if (q)
      domain.push(
        "|",
        "|",
        ["name", "ilike", q],
        ["default_code", "ilike", q],
        ["barcode", "ilike", q],
      );
    const context = { active_test: false };
    const [items, total] = await Promise.all([
      this.odoo.execute<OdooProduct[]>(
        companyId,
        MODEL,
        "search_read",
        [domain],
        {
          fields: [...READ_FIELDS, ...(await this.extraFields(companyId))],
          offset: (page - 1) * pageSize,
          limit: pageSize,
          order: "name asc, id desc",
          context,
        },
      ),
      this.odoo.execute<number>(companyId, MODEL, "search_count", [domain], {
        context,
      }),
    ]);
    return { items: items.map(toEra), total, page, pageSize };
  }

  async options(req: AuthRequest) {
    const companyId = await this.scope.company(req);
    const [categories, uoms] = await Promise.all([
      this.odoo.execute<Array<{ id: number; complete_name: string }>>(
        companyId,
        "product.category",
        "search_read",
        [[]],
        { fields: ["complete_name"], order: "complete_name asc", limit: 500 },
      ),
      this.odoo.execute<Array<{ id: number; name: string }>>(
        companyId,
        "uom.uom",
        "search_read",
        [[]],
        { fields: ["name"], order: "name asc", limit: 500 },
      ),
    ]);
    return {
      categories: categories.map((c) => ({ id: c.id, name: c.complete_name })),
      uoms: uoms.map((u) => ({ id: u.id, name: u.name })),
    };
  }

  async create(req: AuthRequest, raw: unknown) {
    const input = parse(odooProductInput, raw);
    const companyId = await this.scope.company(req);
    await this.assertUniqueSku(companyId, input.sku);
    const values = { ...toOdoo(input), company_id: companyId };
    const [id] = await this.odoo.execute<number[]>(companyId, MODEL, "create", [
      [values],
    ]);
    const after = await this.read(companyId, id);
    await this.scope.audit(
      req,
      "odoo.products",
      MODEL,
      "create",
      id,
      null,
      after,
    );
    return after;
  }

  async update(req: AuthRequest, id: number, raw: unknown) {
    const input = parse(odooProductUpdate, raw);
    const companyId = await this.scope.company(req);
    const before = await this.read(companyId, id);
    if (input.sku !== undefined && input.sku !== before.sku)
      await this.assertUniqueSku(companyId, input.sku, id);
    // is_storable depende do tipo; mantém o tipo atual quando não informado.
    const values = toOdoo({ type: before.type as "consu", ...input });
    if (input.type === undefined) delete values.type;
    if (input.tracksStock === undefined) delete values.is_storable;
    await this.odoo.execute(companyId, MODEL, "write", [[id], values]);
    const after = await this.read(companyId, id);
    await this.scope.audit(
      req,
      "odoo.products",
      MODEL,
      auditAction(input.active, before.active),
      id,
      before,
      after,
    );
    return after;
  }

  private async read(companyId: number, id: number) {
    const [product] = await this.odoo.execute<OdooProduct[]>(
      companyId,
      MODEL,
      "search_read",
      [
        [
          ["id", "=", id],
          ["company_id", "=", companyId],
        ],
      ],
      {
        fields: [...READ_FIELDS, ...(await this.extraFields(companyId))],
        context: { active_test: false },
      },
    );
    if (!product) throw new NotFoundException("Produto não encontrado");
    return toEra(product);
  }

  private async assertUniqueSku(companyId: number, sku: string, id?: number) {
    const domain: Domain = [
      ["company_id", "=", companyId],
      ["default_code", "=", sku],
    ];
    if (id) domain.push(["id", "!=", id]);
    const count = await this.odoo.execute<number>(
      companyId,
      MODEL,
      "search_count",
      [domain],
      { context: { active_test: false } },
    );
    if (count) throw new ConflictException("SKU já cadastrado nesta empresa");
  }

  // Estoque (is_storable, qty_available) só existe com o módulo Inventário.
  private extraFields(companyId: number) {
    this.optionalFields ??= this.odoo
      .execute<Record<string, unknown>>(companyId, MODEL, "fields_get", [], {
        attributes: ["type"],
      })
      .then((all) =>
        ["is_storable", "qty_available"].filter((name) => name in all),
      );
    this.optionalFields.catch(() => (this.optionalFields = null));
    return this.optionalFields;
  }
}

@Controller("odoo")
export class OdooProductsController {
  constructor(@Inject(OdooProducts) private products: OdooProducts) {}
  @Get("products") @Permission("products:read") list(
    @Req() req: AuthRequest,
    @Query() query: unknown,
  ) {
    return this.products.list(req, query);
  }
  @Get("products/options") @Permission("products:read") options(
    @Req() req: AuthRequest,
  ) {
    return this.products.options(req);
  }
  @Post("products") @Permission("products:create") create(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.products.create(req, body);
  }
  @Patch("products/:id") @Permission("products:update") update(
    @Req() req: AuthRequest,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.products.update(req, id, body);
  }
}
