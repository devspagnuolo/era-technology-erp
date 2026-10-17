import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NotFoundException, ConflictException } from "@nestjs/common";
import { OdooClient, parseCompanies } from "../services/api/src/odoo";
import { OdooProducts } from "../services/api/src/odoo-products";
import { OdooContacts } from "../services/api/src/odoo-contacts";
import { OdooScope } from "../services/api/src/odoo-scope";
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
test(
  "produtos são lidos e gravados no Odoo com isolamento por empresa",
  { skip: !ready },
  async () => {
    const companies = parseCompanies(env.TEST_ODOO_COMPANIES!);
    const [a, b] = Object.keys(companies);
    const audits: Array<{ action: string; recordId: string }> = [];
    const db = fakeDb(audits);
    const products = new OdooProducts(scopeFor(db, companies));
    const sku = "ERA-" + randomUUID().slice(0, 8);
    const status = await new OdooStatusController(
      scopeFor(db, companies),
    ).status(as(a));
    assert.equal(status.connected, true);
    assert.equal(status.linked, true);
    const options = await products.options(as(a));
    assert.ok(options.uoms.length > 0);
    const created = await products.create(as(a), {
      name: "Camiseta ERA",
      sku,
      salePrice: "49.90",
      cost: "20.00",
    });
    assert.equal(created.salePrice, "49.90");
    assert.equal(created.sku, sku);
    const listA = await products.list(as(a), { q: sku });
    assert.equal(listA.total, 1);
    assert.equal((await products.list(as(b), { q: sku })).total, 0);
    await assert.rejects(
      () => products.update(as(b), created.id, { name: "Invasão" }),
      NotFoundException,
    );
    await assert.rejects(
      () => products.create(as(a), { name: "Duplicado", sku, salePrice: "1" }),
      ConflictException,
    );
    const updated = await products.update(as(a), created.id, {
      salePrice: "59.90",
      uomId: options.uoms[0].id,
    });
    assert.equal(updated.salePrice, "59.90");
    assert.equal(updated.name, "Camiseta ERA");
    const archived = await products.update(as(a), created.id, {
      active: false,
    });
    assert.equal(archived.active, false);
    assert.equal((await products.list(as(a), { q: sku })).total, 0);
    assert.equal(
      (await products.list(as(a), { q: sku, status: "archived" })).total,
      1,
    );
    assert.deepEqual(
      audits.map((entry) => entry.action),
      ["create", "update", "deactivate"],
    );
    assert.equal(audits[0].recordId, "product.template:" + created.id);
  },
);

test(
  "contatos são lidos e gravados no Odoo com isolamento por empresa",
  { skip: !ready },
  async () => {
    const companies = parseCompanies(env.TEST_ODOO_COMPANIES!);
    const [a, b] = Object.keys(companies);
    const audits: Array<{ action: string; recordId: string }> = [];
    const contacts = new OdooContacts(scopeFor(fakeDb(audits), companies));
    const document = "DOC-" + randomUUID().slice(0, 8);
    const created = await contacts.create(as(a), {
      name: "Fornecedor ERA",
      document,
      email: "compras@example.com",
      customer: false,
      supplier: true,
    });
    assert.equal(created.supplier, true);
    assert.equal(created.customer, false);
    const suppliers = await contacts.list(as(a), {
      q: document,
      role: "supplier",
    });
    assert.equal(suppliers.total, 1);
    assert.equal(
      (await contacts.list(as(a), { q: document, role: "customer" })).total,
      0,
    );
    assert.equal((await contacts.list(as(b), { q: document })).total, 0);
    await assert.rejects(
      () => contacts.update(as(b), created.id, { name: "Invasão" }),
      NotFoundException,
    );
    await assert.rejects(
      () => contacts.create(as(a), { name: "Duplicado", document }),
      ConflictException,
    );
    const updated = await contacts.update(as(a), created.id, {
      customer: true,
      phone: "11 99999-0000",
    });
    assert.equal(updated.customer, true);
    assert.equal(updated.phone, "11 99999-0000");
    const archived = await contacts.update(as(a), created.id, {
      active: false,
    });
    assert.equal(archived.active, false);
    assert.deepEqual(
      audits.map((entry) => entry.action),
      ["create", "update", "deactivate"],
    );
    assert.equal(audits[0].recordId, "res.partner:" + created.id);
  },
);
