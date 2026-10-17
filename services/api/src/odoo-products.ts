import {
  Body,
  ConflictException,
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
} from "@nestjs/common";
import { z } from "zod";
import { AuthRequest, Permission, parse } from "./auth";
import { Domain, OdooClient } from "./odoo";
import { OdooScope } from "./odoo-scope";
import { OdooForms } from "./odoo-form";
import { OdooRecords, recordId } from "./odoo-records";

// Produtos vivem no Odoo (product.template). A ERA consulta e grava por meio da
// API do Odoo e registra cada alteração na própria auditoria. O formulário
// completo vem da própria tela de produto do Odoo (ver odoo-form.ts).
const MODEL = "product.template";
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
@Injectable()
export class OdooProducts {
  private optionalFields: Promise<string[]> | null = null;
  private odoo: OdooClient;
  readonly records: OdooRecords;
  constructor(
    @Inject(OdooScope) private scope: OdooScope,
    @Inject(OdooForms) forms: OdooForms,
  ) {
    this.odoo = scope.odoo;
    this.records = new OdooRecords(scope, forms, {
      model: MODEL,
      module: "odoo.products",
      notFound: "Produto não encontrado",
      form: { hidden: ["company_id"] },
      prepare: async ({ companyId, values, current }) => {
        const sku = values.default_code;
        if (typeof sku === "string" && sku !== current?.default_code)
          await this.assertUniqueSku(companyId, sku, current?.id as number);
      },
    });
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

@Controller("odoo/products")
export class OdooProductsController {
  constructor(@Inject(OdooProducts) private products: OdooProducts) {}
  @Get() @Permission("products:read") list(
    @Req() req: AuthRequest,
    @Query() query: unknown,
  ) {
    return this.products.list(req, query);
  }
  @Get("form") @Permission("products:create") newForm(@Req() req: AuthRequest) {
    return this.products.records.form(req);
  }
  @Get(":id/form") @Permission("products:read") form(
    @Req() req: AuthRequest,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.products.records.form(req, id);
  }
  @Post("onchange") @Permission("products:read") onchange(
    @Req() req: AuthRequest,
    @Body() body: unknown,
    @Query("id") id?: string,
  ) {
    return this.products.records.onchange(req, body, recordId(id));
  }
  @Post("lookup") @Permission("products:read") lookup(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.products.records.lookup(req, body);
  }
  @Post() @Permission("products:create") create(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.products.records.create(req, body);
  }
  @Patch(":id") @Permission("products:update") update(
    @Req() req: AuthRequest,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.products.records.update(req, id, body);
  }
}
