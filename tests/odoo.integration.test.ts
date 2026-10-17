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
