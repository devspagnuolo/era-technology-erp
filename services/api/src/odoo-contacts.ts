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

// Clientes e fornecedores vivem no Odoo (res.partner); a ERA só oferece a tela.
const MODEL = "res.partner";
const optionalText = (max: number) => z.string().trim().max(max).nullable();
const fields = {
  name: z.string().trim().min(2).max(200),
  kind: z.enum(["person", "company"]),
  document: optionalText(32),
  email: z.string().trim().email().max(200).nullable().or(z.literal("")),
  phone: optionalText(40),
  street: optionalText(200),
  city: optionalText(120),
  zip: optionalText(16),
  customer: z.boolean(),
  supplier: z.boolean(),
};
export const contactInput = z
  .object({
    ...fields,
    kind: fields.kind.default("company"),
    document: fields.document.optional(),
    email: fields.email.optional(),
    phone: fields.phone.optional(),
    street: fields.street.optional(),
    city: fields.city.optional(),
    zip: fields.zip.optional(),
    customer: fields.customer.default(true),
    supplier: fields.supplier.default(false),
  })
  .strict();
export const contactUpdate = z
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
export function toOdooContact(
  input: z.infer<typeof contactUpdate>,
  ranks: boolean,
) {
  const values: Record<string, unknown> = {};
  if (input.name !== undefined) values.name = input.name;
  if (input.kind !== undefined) values.is_company = input.kind === "company";
  const plain = {
    document: "vat",
    email: "email",
    phone: "phone",
    street: "street",
    city: "city",
    zip: "zip",
  } as const;
  for (const [key, field] of Object.entries(plain)) {
    const value = input[key as keyof typeof plain];
    if (value !== undefined) values[field] = value || false;
  }
  // Os papéis de cliente/fornecedor existem com o módulo de Faturamento.
  if (ranks && input.customer !== undefined)
    values.customer_rank = input.customer ? 1 : 0;
  if (ranks && input.supplier !== undefined)
    values.supplier_rank = input.supplier ? 1 : 0;
  if (input.active !== undefined) values.active = input.active;
  return values;
}

@Injectable()
export class OdooContacts {
  private odoo: OdooClient;
  private ranks: Promise<boolean> | null = null;
  constructor(@Inject(OdooScope) private scope: OdooScope) {
    this.odoo = scope.odoo;
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

  async create(req: AuthRequest, raw: unknown) {
    const input = parse(contactInput, raw);
    const companyId = await this.scope.company(req);
    if (input.document)
      await this.assertUniqueDocument(companyId, input.document);
    const values = {
      ...toOdooContact(input, await this.hasRanks(companyId)),
      company_id: companyId,
    };
    const [id] = await this.odoo.execute<number[]>(companyId, MODEL, "create", [
      [values],
    ]);
    const after = await this.read(companyId, id);
    await this.scope.audit(
      req,
      "odoo.contacts",
      MODEL,
      "create",
      id,
      null,
      after,
    );
    return after;
  }

  async update(req: AuthRequest, id: number, raw: unknown) {
    const input = parse(contactUpdate, raw);
    const companyId = await this.scope.company(req);
    const before = await this.read(companyId, id);
    if (input.document && input.document !== before.document)
      await this.assertUniqueDocument(companyId, input.document, id);
    await this.odoo.execute(companyId, MODEL, "write", [
      [id],
      toOdooContact(input, await this.hasRanks(companyId)),
    ]);
    const after = await this.read(companyId, id);
    await this.scope.audit(
      req,
      "odoo.contacts",
      MODEL,
      auditAction(input.active, before.active),
      id,
      before,
      after,
    );
    return after;
  }

  private async read(companyId: number, id: number) {
    const ranks = await this.hasRanks(companyId);
    const [partner] = await this.odoo.execute<OdooPartner[]>(
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
        fields: [...READ_FIELDS, ...(ranks ? RANKS : [])],
        context: { active_test: false },
      },
    );
    if (!partner) throw new NotFoundException("Contato não encontrado");
    return toEraContact(partner);
  }

  private async assertUniqueDocument(
    companyId: number,
    document: string,
    id?: number,
  ) {
    const domain: Domain = [
      ["company_id", "=", companyId],
      ["vat", "=", document],
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
  @Post() @Permission("contacts:create") create(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.contacts.create(req, body);
  }
  @Patch(":id") @Permission("contacts:update") update(
    @Req() req: AuthRequest,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.contacts.update(req, id, body);
  }
}
