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

// Clientes e fornecedores vivem no Odoo (res.partner); a ERA só oferece a tela.
const MODEL = "res.partner";
const searchInput = z.object({
  q: z.string().trim().max(100).default(""),
  role: z.enum(["all", "customer", "supplier"]).default("all"),
  status: z.enum(["active", "archived", "all"]).default("active"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

type OdooPartner = {
  id: number;
  name: string;
  is_company: boolean;
  vat: string | false;
  email: string | false;
  phone: string | false;
  street: string | false;
  city: string | false;
  zip: string | false;
  customer_rank?: number;
  supplier_rank?: number;
  active: boolean;
};
const READ_FIELDS = [
  "name",
  "is_company",
  "vat",
  "email",
  "phone",
  "street",
  "city",
  "zip",
  "active",
];
const RANKS = ["customer_rank", "supplier_rank"];
const text = (value: string | false) => value || null;
export function toEraContact(partner: OdooPartner) {
  return {
    id: partner.id,
    name: partner.name,
    kind: partner.is_company ? "company" : "person",
    document: text(partner.vat),
    email: text(partner.email),
    phone: text(partner.phone),
    street: text(partner.street),
    city: text(partner.city),
    zip: text(partner.zip),
    customer: (partner.customer_rank ?? 0) > 0,
    supplier: (partner.supplier_rank ?? 0) > 0,
    active: partner.active,
  };
}
@Injectable()
export class OdooContacts {
  private odoo: OdooClient;
  private ranks: Promise<boolean> | null = null;
  readonly records: OdooRecords;
  constructor(
    @Inject(OdooScope) private scope: OdooScope,
    @Inject(OdooForms) forms: OdooForms,
  ) {
    this.odoo = scope.odoo;
    this.records = new OdooRecords(scope, forms, {
      model: MODEL,
      module: "odoo.contacts",
      notFound: "Contato não encontrado",
      form: { hidden: ["company_id"] },
      domain: [["parent_id", "=", false]],
      prepare: async ({ companyId, values, extra, current }) => {
        const document = values.vat ?? values.vat_formatted_cnpj;
        if (typeof document === "string" && document) {
          const digits = document.replace(/\D/g, "");
          const previous = String(current?.vat ?? "").replace(/\D/g, "");
          if (digits !== previous)
            await this.assertUniqueDocument(
              companyId,
              document,
              current?.id as number,
            );
        }
        // Papéis de cliente/fornecedor (Faturamento) ficam fora da tela do Odoo.
        if (await this.hasRanks(companyId)) {
          if (typeof extra.customer === "boolean")
            values.customer_rank = extra.customer ? 1 : 0;
          if (typeof extra.supplier === "boolean")
            values.supplier_rank = extra.supplier ? 1 : 0;
        }
      },
    });
  }

  async list(req: AuthRequest, raw: unknown) {
    const { q, role, status, page, pageSize } = parse(searchInput, raw);
    const companyId = await this.scope.company(req);
    const ranks = await this.hasRanks(companyId);
    // Somente contatos principais da empresa vinculada (sem endereços filhos).
    const domain: Domain = [
      ["company_id", "=", companyId],
      ["parent_id", "=", false],
    ];
    if (status !== "all") domain.push(["active", "=", status === "active"]);
    if (role !== "all" && ranks) domain.push([role + "_rank", ">", 0]);
    if (q)
      domain.push(
        "|",
        "|",
        "|",
        ["name", "ilike", q],
        ["vat", "ilike", q],
        ["email", "ilike", q],
        ["phone", "ilike", q],
      );
    const context = { active_test: false };
    const [items, total] = await Promise.all([
      this.odoo.execute<OdooPartner[]>(
        companyId,
        MODEL,
        "search_read",
        [domain],
        {
          fields: [...READ_FIELDS, ...(ranks ? RANKS : [])],
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
    return {
      items: items.map(toEraContact),
      total,
      page,
      pageSize,
      roles: ranks,
    };
  }

  // Formulário completo + papéis atuais (cliente/fornecedor).
  async form(req: AuthRequest, id?: number) {
    const form = await this.records.form(req, id);
    const companyId = await this.scope.company(req);
    const ranks = await this.hasRanks(companyId);
    let roles: { customer: boolean; supplier: boolean } | null = null;
    if (ranks) {
      roles = { customer: !id, supplier: false };
      if (id) {
        const [row] = await this.odoo.execute<OdooPartner[]>(
          companyId,
          MODEL,
          "search_read",
          [[["id", "=", id], ["company_id", "=", companyId]]],
          { fields: RANKS, context: { active_test: false } },
        );
        roles = {
          customer: (row?.customer_rank ?? 0) > 0,
          supplier: (row?.supplier_rank ?? 0) > 0,
        };
      }
    }
    return { ...form, roles };
  }

  private async assertUniqueDocument(
    companyId: number,
    document: string,
    id?: number,
  ) {
    const digits = document.replace(/\D/g, "");
    const candidates = [...new Set([document, digits].filter(Boolean))];
    const domain: Domain = [
      ["company_id", "=", companyId],
      ["vat", "in", candidates],
    ];
    if (id) domain.push(["id", "!=", id]);
    const count = await this.odoo.execute<number>(
      companyId,
      MODEL,
      "search_count",
      [domain],
      { context: { active_test: false } },
    );
    if (count)
      throw new ConflictException("CPF/CNPJ já cadastrado nesta empresa");
  }

  private hasRanks(companyId: number) {
    this.ranks ??= this.odoo
      .execute<Record<string, unknown>>(
        companyId,
        MODEL,
        "fields_get",
        [RANKS],
        {
          attributes: ["type"],
        },
      )
      .then((found) => RANKS.every((name) => name in found));
    this.ranks.catch(() => (this.ranks = null));
    return this.ranks;
  }
}

@Controller("odoo/contacts")
export class OdooContactsController {
  constructor(@Inject(OdooContacts) private contacts: OdooContacts) {}
  @Get() @Permission("contacts:read") list(
    @Req() req: AuthRequest,
    @Query() query: unknown,
  ) {
    return this.contacts.list(req, query);
  }
  @Get("form") @Permission("contacts:create") newForm(@Req() req: AuthRequest) {
    return this.contacts.form(req);
  }
  @Get(":id/form") @Permission("contacts:read") form(
    @Req() req: AuthRequest,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.contacts.form(req, id);
  }
  @Post("onchange") @Permission("contacts:read") onchange(
    @Req() req: AuthRequest,
    @Body() body: unknown,
    @Query("id") id?: string,
  ) {
    return this.contacts.records.onchange(req, body, recordId(id));
  }
  @Post("lookup") @Permission("contacts:read") lookup(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.contacts.records.lookup(req, body);
  }
  @Post() @Permission("contacts:create") create(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.contacts.records.create(req, body);
  }
  @Patch(":id") @Permission("contacts:update") update(
    @Req() req: AuthRequest,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.contacts.records.update(req, id, body);
  }
}
