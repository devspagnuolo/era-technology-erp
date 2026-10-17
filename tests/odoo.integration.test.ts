import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { OdooClient, parseCompanies } from "../services/api/src/odoo";
import { OdooProducts } from "../services/api/src/odoo-products";
import { OdooContacts } from "../services/api/src/odoo-contacts";
import { OdooSales } from "../services/api/src/odoo-sales";
import { OdooPurchases } from "../services/api/src/odoo-purchases";
import { OdooTransfers } from "../services/api/src/odoo-transfers";
import { OdooInvoices } from "../services/api/src/odoo-invoices";
import { OdooCrm } from "../services/api/src/odoo-crm";
import { OdooManufacturing } from "../services/api/src/odoo-manufacturing";
import { OdooProjects, OdooTasks } from "../services/api/src/odoo-projects";
import { OdooEmployees } from "../services/api/src/odoo-employees";
import { OdooScope } from "../services/api/src/odoo-scope";
import { OdooForms } from "../services/api/src/odoo-form";
import { OdooStatusController } from "../services/api/src/odoo-status";
import { Database } from "../services/api/src/database";
import { AuthRequest } from "../services/api/src/auth";
// Requer um Odoo de teste: TEST_ODOO_URL, TEST_ODOO_DB, TEST_ODOO_LOGIN,
// TEST_ODOO_API_KEY e TEST_ODOO_COMPANIES ("empresa-a:1,empresa-b:2").
const env = process.env;
const ready =
  env.TEST_ODOO_URL &&
  env.TEST_ODOO_DB &&
  env.TEST_ODOO_LOGIN &&
  env.TEST_ODOO_API_KEY &&
  env.TEST_ODOO_COMPANIES;
function scopeFor(db: Database, companies: Record<string, number>) {
  return new OdooScope(
    new OdooClient({
      url: env.TEST_ODOO_URL!,
      db: env.TEST_ODOO_DB!,
      login: env.TEST_ODOO_LOGIN!,
      apiKey: env.TEST_ODOO_API_KEY!,
      companies,
      timeoutMs: 15000,
    }),
    db,
  );
}
function fakeDb(audits: Array<{ action: string; recordId: string }>) {
  return {
    tenant: {
      findUnique: async ({ where }: { where: { id: string } }) => ({
        slug: where.id,
      }),
    },
    auditLog: {
      create: async ({
        data,
      }: {
        data: { action: string; recordId: string };
      }) => audits.push(data),
    },
  } as unknown as Database;
}
const as = (tenantId: string) =>
  ({
    principal: { tenantId, userId: "tester" },
    ip: "127.0.0.1",
  }) as AuthRequest;
type Ref = { id: number; name: string };
const services = (scope: OdooScope) => {
  const forms = new OdooForms(scope.odoo);
  return {
    products: new OdooProducts(scope, forms),
    contacts: new OdooContacts(scope, forms),
    sales: new OdooSales(scope, forms).orders,
    purchases: new OdooPurchases(scope, forms).orders,
    transfers: new OdooTransfers(scope, forms),
    invoices: new OdooInvoices(scope, forms),
    crm: new OdooCrm(scope, forms),
    manufacturing: new OdooManufacturing(scope, forms),
    projects: new OdooProjects(scope, forms),
    tasks: new OdooTasks(scope, forms),
    employees: new OdooEmployees(scope, forms),
  };
};

test(
  "produtos: formulário completo do Odoo, gravação e isolamento por empresa",
  { skip: !ready },
  async () => {
    const companies = parseCompanies(env.TEST_ODOO_COMPANIES!);
    const [a, b] = Object.keys(companies);
    const audits: Array<{ action: string; recordId: string }> = [];
    const db = fakeDb(audits);
    const { products } = services(scopeFor(db, companies));
    const sku = "ERA-" + randomUUID().slice(0, 8);
    const status = await new OdooStatusController(
      scopeFor(db, companies),
    ).status(as(a));
    assert.equal(status.connected, true);
    assert.equal(status.linked, true);
    const blank = await products.records.form(as(a));
    // Campos além do básico, vindos das abas do Odoo, sem a empresa.
    for (const name of ["name", "default_code", "list_price", "categ_id"])
      assert.ok(blank.schema.fields[name], name);
    assert.ok(blank.schema.sections.length > 1);
    assert.equal(blank.schema.fields.company_id, undefined);
    await assert.rejects(
      () =>
        products.records.create(as(a), {
          values: { name: "X", company_id: 2 },
        }),
      BadRequestException,
    );
    const created = await products.records.create(as(a), {
      values: {
        name: "Camiseta ERA",
        default_code: sku,
        list_price: 49.9,
        standard_price: 20,
      },
    });
    const id = created.id as number;
    assert.equal(created.list_price, 49.9);
    assert.equal(created.default_code, sku);
    const listA = await products.list(as(a), { q: sku });
    assert.equal(listA.total, 1);
    assert.equal(listA.items[0].salePrice, "49.90");
    assert.equal((await products.list(as(b), { q: sku })).total, 0);
    await assert.rejects(
      () => products.records.update(as(b), id, { values: { name: "Invasão" } }),
      NotFoundException,
    );
    await assert.rejects(
      () =>
        products.records.create(as(a), {
          values: { name: "Duplicado", default_code: sku },
        }),
      ConflictException,
    );
    const updated = await products.records.update(as(a), id, {
      values: { list_price: 59.9 },
    });
    assert.equal(updated.list_price, 59.9);
    assert.equal(updated.name, "Camiseta ERA");
    await products.records.update(as(a), id, { active: false });
    assert.equal((await products.list(as(a), { q: sku })).total, 0);
    assert.equal(
      (await products.list(as(a), { q: sku, status: "archived" })).total,
      1,
    );
    assert.deepEqual(
      audits.map((entry) => entry.action),
      ["create", "update", "deactivate"],
    );
    assert.equal(audits[0].recordId, "product.template:" + id);
  },
);

test(
  "contatos: formulário completo, papéis e isolamento por empresa",
  { skip: !ready },
  async () => {
    const companies = parseCompanies(env.TEST_ODOO_COMPANIES!);
    const [a, b] = Object.keys(companies);
    const audits: Array<{ action: string; recordId: string }> = [];
    const { contacts } = services(scopeFor(fakeDb(audits), companies));
    const tag = randomUUID().slice(0, 8);
    const blank = await contacts.form(as(a));
    assert.equal(blank.roles.customer, true);
    for (const name of ["name", "email", "street", "city", "country_id"])
      assert.ok(blank.schema.fields[name], name);
    const created = await contacts.records.create(as(a), {
      values: {
        name: "Fornecedor " + tag,
        ref: tag,
        email: "compras@example.com",
      },
      extra: { customer: false, supplier: true },
    });
    const id = created.id as number;
    const suppliers = await contacts.list(as(a), { q: tag, role: "supplier" });
    assert.equal(suppliers.total, 1);
    assert.equal(
      (await contacts.list(as(a), { q: tag, role: "customer" })).total,
      0,
    );
    assert.equal((await contacts.list(as(b), { q: tag })).total, 0);
    await assert.rejects(
      () => contacts.records.update(as(b), id, { values: { name: "Invasão" } }),
      NotFoundException,
    );
    const updated = await contacts.records.update(as(a), id, {
      values: { phone: "11 99999-0000" },
      extra: { customer: true },
    });
    assert.equal(updated.phone, "11 99999-0000");
    assert.equal(
      (await contacts.list(as(a), { q: tag, role: "customer" })).total,
      1,
    );
    await contacts.records.update(as(a), id, { active: false });
    assert.deepEqual(
      audits.map((entry) => entry.action),
      ["create", "update", "deactivate"],
    );
    assert.equal(audits[0].recordId, "res.partner:" + id);
  },
);

test(
  "vendas: orçamento é criado, recalculado, confirmado e cancelado no Odoo",
  { skip: !ready },
  async () => {
    const companies = parseCompanies(env.TEST_ODOO_COMPANIES!);
    const [a, b] = Object.keys(companies);
    const audits: Array<{ action: string; recordId: string }> = [];
    const { contacts, products, sales } = services(
      scopeFor(fakeDb(audits), companies),
    );
    const tag = randomUUID().slice(0, 8);
    const customer = await contacts.records.create(as(a), {
      values: { name: "Cliente " + tag },
    });
    await products.records.create(as(a), {
      values: {
        name: "Produto " + tag,
        default_code: "VND-" + tag,
        list_price: 40,
      },
    });
    const pick = (company: string, field: string, line?: string) =>
      sales.records.lookup(as(company), {
        field,
        q: tag,
        values: { partner_id: customer.id },
        ...(line ? { line: { field: line, values: {} } } : {}),
      }) as Promise<Ref[]>;
    const found = await pick(a, "partner_id");
    assert.deepEqual(
      found.map((c) => c.id),
      [customer.id],
    );
    const [variant] = await pick(a, "order_line", "product_id");
    assert.ok(variant);
    assert.equal((await pick(b, "order_line", "product_id")).length, 0);
    // Ao escolher o produto, o Odoo preenche descrição, quantidade e preço.
    const blank = await sales.form(as(a));
    const { line } = (await sales.records.onchange(as(a), {
      values: { ...blank.values, partner_id: customer.id },
      field: "order_line",
      line: { values: { product_id: variant.id }, field: "product_id" },
    })) as { line: Record<string, unknown> };
    assert.equal(line.price_unit, 40);
    const created = await sales.records.create(as(a), {
      values: {
        partner_id: customer.id,
        order_line: [{ product_id: variant.id, product_uom_qty: 2 }],
      },
    });
    const id = created.id as number;
    const rows = created.order_line as Array<Record<string, unknown>>;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].price_unit, 40);
    assert.equal(rows[0].price_subtotal, 80);
    await assert.rejects(() => sales.form(as(b), id), NotFoundException);
    await assert.rejects(
      () =>
        sales.records.create(as(b), {
          values: {
            partner_id: customer.id,
            order_line: [{ product_id: variant.id, product_uom_qty: 1 }],
          },
        }),
      NotFoundException,
    );
    await sales.records.update(as(a), id, {
      values: {
        order_line: [{ id: rows[0].id, product_uom_qty: 3, price_unit: 30 }],
      },
    });
    const summary = (await sales.form(as(a), id)).summary!;
    assert.equal(summary.untaxed, "90.00");
    const listed = await sales.list(as(a), { q: summary.number });
    assert.equal(listed.total, 1);
    assert.equal((await sales.list(as(b), { q: summary.number })).total, 0);
    const confirmed = await sales.confirm(as(a), id);
    assert.equal(confirmed.stage, "order");
    await assert.rejects(
      () => sales.reopen(as(a), id),
      UnprocessableEntityException,
    );
    const cancelled = await sales.cancel(as(a), id);
    assert.equal(cancelled.stage, "cancelled");
    const reopened = await sales.reopen(as(a), id);
    assert.equal(reopened.stage, "quotation");
    assert.deepEqual(
      audits
        .filter((e) => e.recordId.startsWith("sale.order:"))
        .map((e) => e.action),
      ["create", "update", "confirm", "cancel", "reopen"],
    );
  },
);

test(
  "compras: cotação é criada com preço de custo, confirmada e cancelada no Odoo",
  { skip: !ready },
  async () => {
    const companies = parseCompanies(env.TEST_ODOO_COMPANIES!);
    const [a, b] = Object.keys(companies);
    const audits: Array<{ action: string; recordId: string }> = [];
    const { contacts, products, purchases } = services(
      scopeFor(fakeDb(audits), companies),
    );
    const tag = randomUUID().slice(0, 8);
    const vendor = await contacts.records.create(as(a), {
      values: { name: "Fornecedor " + tag },
      extra: { customer: false, supplier: true },
    });
    await products.records.create(as(a), {
      values: {
        name: "Insumo " + tag,
        default_code: "CMP-" + tag,
        standard_price: 15,
      },
    });
    const blank = await purchases.form(as(a));
    for (const name of [
      "partner_id",
      "partner_ref",
      "order_line",
      "date_planned",
    ])
      assert.ok(blank.schema.fields[name], name);
    assert.ok(
      blank.schema.fields.order_line.sub!.columns.includes("product_qty"),
    );
    const [variant] = (await purchases.records.lookup(as(a), {
      field: "order_line",
      q: tag,
      values: { ...blank.values, partner_id: vendor.id },
      line: { field: "product_id", values: {} },
    })) as Ref[];
    assert.ok(variant);
    const { line } = (await purchases.records.onchange(as(a), {
      values: { ...blank.values, partner_id: vendor.id },
      field: "order_line",
      line: { values: { product_id: variant.id }, field: "product_id" },
    })) as { line: Record<string, unknown> };
    assert.equal(line.price_unit, 15);
    const created = await purchases.records.create(as(a), {
      values: {
        partner_id: vendor.id,
        partner_ref: "COT-" + tag,
        order_line: [{ product_id: variant.id, product_qty: 4 }],
      },
    });
    const id = created.id as number;
    const summary = (await purchases.form(as(a), id)).summary!;
    assert.equal(summary.stage, "quotation");
    assert.equal(summary.untaxed, "60.00");
    assert.equal(summary.reference, "COT-" + tag);
    assert.equal((await purchases.list(as(a), { q: "COT-" + tag })).total, 1);
    assert.equal((await purchases.list(as(b), { q: "COT-" + tag })).total, 0);
    await assert.rejects(() => purchases.form(as(b), id), NotFoundException);
    const confirmed = await purchases.confirm(as(a), id);
    assert.equal(confirmed.stage, "order");
    const cancelled = await purchases.cancel(as(a), id);
    assert.equal(cancelled.stage, "cancelled");
    const reopened = await purchases.reopen(as(a), id);
    assert.equal(reopened.state, "draft");
    assert.deepEqual(
      audits
        .filter((e) => e.recordId.startsWith("purchase.order:"))
        .map((e) => e.action),
      ["create", "confirm", "cancel", "reopen"],
    );
  },
);

test(
  "estoque: recebimento e entrega movem o saldo no Odoo",
  { skip: !ready },
  async () => {
    const companies = parseCompanies(env.TEST_ODOO_COMPANIES!);
    const [a, b] = Object.keys(companies);
    const audits: Array<{ action: string; recordId: string }> = [];
    const { contacts, products, transfers } = services(
      scopeFor(fakeDb(audits), companies),
    );
    const tag = randomUUID().slice(0, 8);
    const partner = await contacts.records.create(as(a), {
      values: { name: "Parceiro " + tag },
    });
    const sku = "EST-" + tag;
    const productForm = await products.records.form(as(a));
    assert.ok(productForm.schema.fields.is_storable);
    await products.records.create(as(a), {
      values: {
        name: "Estocável " + tag,
        default_code: sku,
        is_storable: true,
      },
    });
    const move = async (kind: "incoming" | "outgoing", qty: number) => {
      const blank = await transfers.form(as(a), undefined, { kind });
      assert.ok(blank.values.picking_type_id);
      const [variant] = (await transfers.records.lookup(as(a), {
        field: "move_ids_without_package",
        q: tag,
        values: blank.values,
        line: { field: "product_id", values: {} },
      })) as Ref[];
      assert.ok(variant);
      // Como no painel: o Odoo completa o item (descrição, unidade) ao
      // escolher o produto.
      const { line: filled } = (await transfers.records.onchange(as(a), {
        values: { ...blank.values, partner_id: partner.id },
        field: "move_ids_without_package",
        line: { values: { product_id: variant.id }, field: "product_id" },
      })) as { line: Record<string, unknown> };
      const lineFields =
        blank.schema.fields.move_ids_without_package.sub!.fields;
      assert.equal(lineFields.name?.hidden, true);
      const line = Object.fromEntries(
        Object.entries(filled)
          .filter(([k]) => k in lineFields)
          .map(([k, v]) => [
            k,
            v && typeof v === "object" && "id" in v ? (v as Ref).id : v,
          ]),
      );
      const created = await transfers.records.create(as(a), {
        values: {
          picking_type_id: (blank.values.picking_type_id as Ref).id,
          partner_id: partner.id,
          origin: "TESTE-" + tag,
          move_ids_without_package: [
            { ...line, product_id: variant.id, product_uom_qty: qty },
          ],
        },
      });
      const id = created.id as number;
      assert.equal((await transfers.summary(as(a), id)).stage, "draft");
      await transfers.run(as(a), id, "confirm");
      if (kind === "outgoing") await transfers.run(as(a), id, "assign");
      assert.equal((await transfers.summary(as(a), id)).stage, "ready");
      const done = await transfers.run(as(a), id, "validate");
      assert.equal(done.stage, "done");
      return id;
    };
    const receipt = await move("incoming", 5);
    const stock = async () =>
      (await products.list(as(a), { q: sku })).items[0].quantity;
    assert.equal(await stock(), 5);
    await assert.rejects(
      () => transfers.form(as(b), receipt),
      NotFoundException,
    );
    const listed = await transfers.list(as(a), {
      kind: "incoming",
      q: "TESTE-" + tag,
      stage: "done",
    });
    assert.equal(listed.total, 1);
    assert.equal(
      (
        await transfers.list(as(b), {
          kind: "incoming",
          q: "TESTE-" + tag,
          stage: "all",
        })
      ).total,
      0,
    );
    await move("outgoing", 2);
    assert.equal(await stock(), 3);
    await assert.rejects(
      () => transfers.run(as(a), receipt, "validate"),
      UnprocessableEntityException,
    );
    assert.deepEqual(
      audits
        .filter((e) => e.recordId.startsWith("stock.picking:"))
        .map((e) => e.action),
      [
        "create",
        "confirm",
        "validate",
        "create",
        "confirm",
        "assign",
        "validate",
      ],
    );
  },
);

test(
  "faturas: fatura de cliente é confirmada e paga; conta de fornecedor separada",
  { skip: !ready },
  async () => {
    const companies = parseCompanies(env.TEST_ODOO_COMPANIES!);
    const [a, b] = Object.keys(companies);
    const audits: Array<{ action: string; recordId: string }> = [];
    const { contacts, products, invoices } = services(
      scopeFor(fakeDb(audits), companies),
    );
    const tag = randomUUID().slice(0, 8);
    const customer = await contacts.records.create(as(a), {
      values: { name: "Cliente fatura " + tag },
    });
    await products.records.create(as(a), {
      values: {
        name: "Serviço " + tag,
        default_code: "FAT-" + tag,
        list_price: 50,
      },
    });
    const blank = await invoices.form(as(a), undefined, { side: "customer" });
    assert.equal(blank.values.move_type, "out_invoice");
    for (const name of [
      "partner_id",
      "invoice_line_ids",
      "invoice_payment_term_id",
    ])
      assert.ok(blank.schema.fields[name], name);
    const lineFields = blank.schema.fields.invoice_line_ids.sub!.fields;
    const [variant] = (await invoices.records.lookup(as(a), {
      field: "invoice_line_ids",
      q: tag,
      values: blank.values,
      line: { field: "product_id", values: {} },
    })) as Ref[];
    assert.ok(variant);
    // Como no painel: o Odoo completa o item ao escolher o produto.
    const { line: filled } = (await invoices.records.onchange(as(a), {
      values: { ...blank.values, partner_id: customer.id },
      field: "invoice_line_ids",
      line: { values: { product_id: variant.id }, field: "product_id" },
    })) as { line: Record<string, unknown> };
    assert.equal(filled.price_unit, 50);
    const line = Object.fromEntries(
      Object.entries(filled)
        .filter(([k]) => k in lineFields)
        .map(([k, v]) => [
          k,
          Array.isArray(v)
            ? v.map((x) => (x && typeof x === "object" ? (x as Ref).id : x))
            : v && typeof v === "object" && "id" in v
              ? (v as Ref).id
              : v,
        ]),
    );
    await assert.rejects(
      () =>
        invoices.records.create(as(a), {
          values: { partner_id: customer.id },
          extra: { move_type: "entry" },
        }),
      UnprocessableEntityException,
    );
    const created = await invoices.records.create(as(a), {
      values: {
        partner_id: customer.id,
        ref: "PED-" + tag,
        invoice_line_ids: [
          { ...line, product_id: variant.id, quantity: 2, tax_ids: [] },
        ],
      },
      extra: { move_type: "out_invoice" },
    });
    const id = created.id as number;
    let summary = await invoices.summary(as(a), id);
    assert.equal(summary.stage, "draft");
    assert.equal(summary.total, "100.00");
    await assert.rejects(() => invoices.form(as(b), id), NotFoundException);
    const posted = await invoices.run(as(a), id, "post");
    assert.equal(posted.stage, "open");
    assert.ok(posted.number);
    assert.equal(posted.residual, "100.00");
    assert.equal(
      (
        await invoices.list(as(a), {
          side: "customer",
          q: "PED-" + tag,
          stage: "open",
        })
      ).total,
      1,
    );
    assert.equal(
      (await invoices.list(as(a), { side: "vendor", q: "PED-" + tag })).total,
      0,
    );
    assert.equal(
      (await invoices.list(as(b), { side: "customer", q: "PED-" + tag })).total,
      0,
    );
    const paid = await invoices.run(as(a), id, "pay");
    assert.equal(paid.stage, "paid");
    assert.equal(paid.residual, "0.00");
    await assert.rejects(
      () => invoices.run(as(a), id, "pay"),
      UnprocessableEntityException,
    );
    // Conta a pagar: rascunho de fornecedor, cancelado.
    const bill = await invoices.records.create(as(a), {
      values: { partner_id: customer.id, ref: "NF-" + tag },
      extra: { move_type: "in_invoice" },
    });
    const billId = bill.id as number;
    assert.equal(
      (await invoices.list(as(a), { side: "vendor", q: "NF-" + tag })).total,
      1,
    );
    const cancelled = await invoices.run(as(a), billId, "cancel");
    assert.equal(cancelled.stage, "cancelled");
    assert.deepEqual(
      audits
        .filter((e) => e.recordId.startsWith("account.move:"))
        .map((e) => e.action),
      ["create", "post", "pay", "create", "cancel"],
    );
  },
);

test(
  "crm: oportunidade com dados brasileiros, etapa, perda e ganho",
  { skip: !ready },
  async () => {
    const companies = parseCompanies(env.TEST_ODOO_COMPANIES!);
    const [a, b] = Object.keys(companies);
    const audits: Array<{ action: string; recordId: string }> = [];
    const { crm } = services(scopeFor(fakeDb(audits), companies));
    const tag = randomUUID().slice(0, 8);
    const blank = await crm.form(as(a));
    for (const name of ["name", "partner_id", "expected_revenue", "stage_id"])
      assert.ok(blank.schema.fields[name], name);
    assert.equal(blank.schema.fields.stage_id.group, "Etapa");
    assert.equal(blank.values.type, "opportunity");
    const created = await crm.records.create(as(a), {
      values: {
        name: "Oportunidade " + tag,
        partner_name: "Cliente " + tag,
        expected_revenue: 1500,
        type: "opportunity",
      },
    });
    const id = created.id as number;
    const stages = (await crm.records.lookup(as(a), {
      field: "stage_id",
      q: "",
      values: created,
    })) as Ref[];
    assert.ok(stages.length > 1);
    await crm.records.update(as(a), id, {
      values: { stage_id: stages[1].id },
    });
    let summary = await crm.summary(as(a), id);
    assert.equal(summary.stage && (summary.stage as Ref).id, stages[1].id);
    assert.equal(summary.revenue, "1500.00");
    assert.equal(summary.outcome, "open");
    assert.equal((await crm.list(as(a), { q: tag })).total, 1);
    assert.equal((await crm.list(as(b), { q: tag, filter: "all" })).total, 0);
    await assert.rejects(() => crm.form(as(b), id), NotFoundException);
    summary = await crm.run(as(a), id, "lost", {});
    assert.equal(summary.outcome, "lost");
    assert.equal((await crm.list(as(a), { q: tag, filter: "lost" })).total, 1);
    // Perdida continua abrindo (arquivada no Odoo).
    assert.ok((await crm.form(as(a), id)).values.name);
    summary = await crm.run(as(a), id, "reopen", {});
    assert.equal(summary.outcome, "open");
    summary = await crm.run(as(a), id, "won", {});
    assert.equal(summary.outcome, "won");
    await assert.rejects(
      () => crm.run(as(a), id, "won", {}),
      UnprocessableEntityException,
    );
    assert.deepEqual(
      audits
        .filter((e) => e.recordId === "crm.lead:" + id)
        .map((e) => e.action),
      ["create", "update", "lost", "reopen", "won"],
    );
  },
);

test(
  "fabricação: ordem de produção confirmada e concluída dá entrada no estoque",
  { skip: !ready },
  async () => {
    const companies = parseCompanies(env.TEST_ODOO_COMPANIES!);
    const [a, b] = Object.keys(companies);
    const { products, manufacturing } = services(
      scopeFor(fakeDb([]), companies),
    );
    const tag = randomUUID().slice(0, 8);
    const sku = "FAB-" + tag;
    await products.records.create(as(a), {
      values: {
        name: "Fabricado " + tag,
        default_code: sku,
        is_storable: true,
      },
    });
    const blank = await manufacturing.form(as(a));
    for (const name of ["product_id", "product_qty", "bom_id", "move_raw_ids"])
      assert.ok(blank.schema.fields[name], name);
    const [variant] = (await manufacturing.records.lookup(as(a), {
      field: "product_id",
      q: tag,
      values: blank.values,
    })) as Ref[];
    assert.ok(variant);
    const { values: filled } = (await manufacturing.records.onchange(as(a), {
      values: { ...blank.values, product_id: variant.id },
      field: "product_id",
    })) as { values: Record<string, unknown> };
    const plain = (v: unknown) =>
      v && typeof v === "object" && "id" in v ? (v as Ref).id : v;
    const created = await manufacturing.records.create(as(a), {
      values: {
        product_id: variant.id,
        product_qty: 4,
        product_uom_id: plain(filled.product_uom_id),
        picking_type_id: plain(
          filled.picking_type_id ?? blank.values.picking_type_id,
        ),
      },
    });
    const id = created.id as number;
    assert.equal((await manufacturing.summary(as(a), id)).stage, "draft");
    assert.equal(
      (await manufacturing.run(as(a), id, "confirm", {})).stage,
      "confirmed",
    );
    const done = await manufacturing.run(as(a), id, "done", {});
    assert.equal(done.stage, "done");
    assert.equal(done.producing, 4);
    assert.equal((await products.list(as(a), { q: sku })).items[0].quantity, 4);
    await assert.rejects(
      () => manufacturing.form(as(b), id),
      NotFoundException,
    );
    assert.equal(
      (await manufacturing.list(as(a), { q: tag, filter: "done" })).total,
      1,
    );
  },
);

test(
  "projeto: projeto, tarefa com etapa e conclusão da tarefa",
  { skip: !ready },
  async () => {
    const companies = parseCompanies(env.TEST_ODOO_COMPANIES!);
    const [a, b] = Object.keys(companies);
    const { projects, tasks } = services(scopeFor(fakeDb([]), companies));
    const tag = randomUUID().slice(0, 8);
    const projectForm = await projects.form(as(a));
    for (const name of ["name", "partner_id", "user_id", "privacy_visibility"])
      assert.ok(projectForm.schema.fields[name], name);
    const project = await projects.records.create(as(a), {
      values: { ...pick(projectForm.values), name: "Projeto " + tag },
    });
    const projectId = project.id as number;
    const taskForm = await tasks.form(as(a), undefined, {
      project: String(projectId),
    });
    assert.equal((taskForm.values.project_id as Ref).id, projectId);
    assert.ok(taskForm.schema.fields.stage_id);
    assert.equal(taskForm.schema.fields.personal_stage_type_id, undefined);
    const task = await tasks.records.create(as(a), {
      values: { name: "Tarefa " + tag, project_id: projectId },
    });
    const taskId = task.id as number;
    assert.equal(
      (await tasks.list(as(a), { project: String(projectId) })).total,
      1,
    );
    let summary = await tasks.run(as(a), taskId, "done", {});
    assert.equal(summary.closed, true);
    assert.equal(
      (await tasks.list(as(a), { project: String(projectId) })).total,
      0,
    );
    summary = await tasks.run(as(a), taskId, "reopen", {});
    assert.equal(summary.closed, false);
    assert.equal((await projects.list(as(a), { q: tag })).items[0].tasks, 1);
    assert.equal(
      (await projects.list(as(b), { q: tag, filter: "all" })).total,
      0,
    );
    await projects.records.update(as(a), projectId, { active: false });
    assert.equal(
      (await projects.list(as(a), { q: tag, filter: "archived" })).total,
      1,
    );
  },
);

test(
  "funcionários: cadastro completo de RH, isolamento e desligamento",
  { skip: !ready },
  async () => {
    const companies = parseCompanies(env.TEST_ODOO_COMPANIES!);
    const [a, b] = Object.keys(companies);
    const { employees } = services(scopeFor(fakeDb([]), companies));
    const tag = randomUUID().slice(0, 8);
    const blank = await employees.form(as(a));
    for (const name of [
      "name",
      "job_title",
      "department_id",
      "private_street",
      "birthday",
      "resource_calendar_id",
    ])
      assert.ok(blank.schema.fields[name], name);
    assert.ok(blank.schema.sections.length >= 4);
    const created = await employees.records.create(as(a), {
      values: {
        ...pick(blank.values),
        name: "Pessoa " + tag,
        job_title: "Analista",
        birthday: "1990-05-01",
      },
    });
    const id = created.id as number;
    assert.equal(created.birthday, "1990-05-01");
    const listed = await employees.list(as(a), { q: tag });
    assert.equal(listed.items[0].jobTitle, "Analista");
    assert.equal(
      (await employees.list(as(b), { q: tag, filter: "all" })).total,
      0,
    );
    await assert.rejects(() => employees.form(as(b), id), NotFoundException);
    await employees.records.update(as(a), id, { active: false });
    assert.equal(
      (await employees.list(as(a), { q: tag, filter: "archived" })).total,
      1,
    );
  },
);

// Valores padrão do Odoo prontos para gravar (relações viram ids).
function pick(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([k, v]) => k !== "company_id" && v !== null && v !== false)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [
        k,
        v && typeof v === "object" && "id" in v ? (v as Ref).id : v,
      ]),
  );
}
