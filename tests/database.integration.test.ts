import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { ProductRepository } from "../services/api/src/products";
import { Database } from "../services/api/src/database";
const url = process.env.TEST_DATABASE_URL;
test(
  "isolamento, unicidade, rollback e outbox no PostgreSQL",
  { skip: !url },
  async () => {
    const db = new PrismaClient({ datasourceUrl: url });
    const ids = [randomUUID(), randomUUID()];
    try {
      for (const id of ids)
        await db.tenant.create({
          data: { id, slug: id, name: "Empresa de teste" },
        });
      const repository = new ProductRepository(db as Database);
      const product = {
        sku: "SKU-COMPARTILHADO",
        name: "Produto A",
        unit: "UN",
        salePrice: "10.50",
      };
      await repository.create(ids[0], "test-actor", "127.0.0.1", product);
      await repository.create(ids[1], "test-actor", "127.0.0.1", {
        ...product,
        name: "Produto B",
      });
      const list = await repository.list(ids[0], {});
      assert.equal(list.total, 1);
      assert.equal(list.items[0].name, "Produto A");
      assert.equal(list.items[0].salePrice.toString(), "10.5");
      await assert.rejects(() =>
        repository.create(ids[0], "test-actor", "127.0.0.1", product),
      );
      assert.equal(await db.auditLog.count({ where: { tenantId: ids[0] } }), 1);
      assert.equal(
        await db.outboxEvent.count({ where: { tenantId: ids[0] } }),
        1,
      );
      const created = list.items[0];
      await assert.rejects(
        () =>
          repository.update(ids[1], "test-actor", "127.0.0.1", created.id, {
            name: "Invasão",
          }),
        (error: unknown) =>
          error instanceof Error && error.name === "NotFoundException",
      );
      const updated = await repository.update(
        ids[0],
        "test-actor",
        "127.0.0.1",
        created.id,
        { salePrice: "11.00", active: false },
      );
      assert.equal(updated.salePrice.toString(), "11");
      assert.equal(updated.active, false);
      assert.equal(updated.name, "Produto A");
      const audit = await db.auditLog.findFirst({
        where: { tenantId: ids[0], recordId: created.id, action: "deactivate" },
      });
      assert.equal((audit?.before as { salePrice: string }).salePrice, "10.5");
      assert.equal(
        await db.outboxEvent.count({
          where: { tenantId: ids[0], type: "product.updated.v1" },
        }),
        1,
      );
      await repository.create(ids[0], "test-actor", "127.0.0.1", {
        ...product,
        sku: "OUTRO",
      });
      await assert.rejects(() =>
        repository.update(ids[0], "test-actor", "127.0.0.1", created.id, {
          sku: "OUTRO",
        }),
      );
      await assert.rejects(() =>
        db.$transaction(async (tx) => {
          await tx.product.create({
            data: { ...product, sku: "ROLLBACK", tenantId: ids[0] },
          });
          throw new Error("Falha simulada");
        }),
      );
      assert.equal(
        await db.product.count({
          where: { tenantId: ids[0], sku: "ROLLBACK" },
        }),
        0,
      );
    } finally {
      for (const tenantId of ids) {
        await db.outboxEvent.deleteMany({ where: { tenantId } });
        await db.auditLog.deleteMany({ where: { tenantId } });
        await db.product.deleteMany({ where: { tenantId } });
        await db.tenant.deleteMany({ where: { id: tenantId } });
      }
      await db.$disconnect();
    }
  },
);

test(
  "chaves estrangeiras impedem referências cruzadas entre empresas",
  { skip: !url },
  async () => {
    const db = new PrismaClient({ datasourceUrl: url });
    const a = randomUUID(),
      b = randomUUID();
    try {
      for (const id of [a, b])
        await db.tenant.create({ data: { id, slug: id, name: "Isolamento" } });
      const category = await db.category.create({
        data: { tenantId: b, name: "Categoria B" },
      });
      const branch = await db.branch.create({
        data: { tenantId: b, name: "Filial B", code: "B" },
      });
      const product = await db.product.create({
        data: { tenantId: b, sku: "B", name: "Produto B", salePrice: "1.00" },
      });
      const priceTable = await db.priceTable.create({
        data: { tenantId: a, name: "Tabela A" },
      });
      const foreignKeyFailure = (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2003";
      await assert.rejects(
        () =>
          db.product.create({
            data: {
              tenantId: a,
              sku: "A",
              name: "Produto A",
              salePrice: "1.00",
              categoryId: category.id,
            },
          }),
        foreignKeyFailure,
      );
      await assert.rejects(
        () =>
          db.warehouse.create({
            data: { tenantId: a, branchId: branch.id, name: "Depósito A" },
          }),
        foreignKeyFailure,
      );
      await assert.rejects(
        () =>
          db.priceTableItem.create({
            data: {
              tenantId: a,
              priceTableId: priceTable.id,
              productId: product.id,
              price: "1.00",
            },
          }),
        foreignKeyFailure,
      );
    } finally {
      const tenantId = { in: [a, b] };
      await db.priceTableItem.deleteMany({ where: { tenantId } });
      await db.warehouse.deleteMany({ where: { tenantId } });
      await db.product.deleteMany({ where: { tenantId } });
      await db.priceTable.deleteMany({ where: { tenantId } });
      await db.category.deleteMany({ where: { tenantId } });
      await db.branch.deleteMany({ where: { tenantId } });
      await db.tenant.deleteMany({ where: { id: { in: [a, b] } } });
      await db.$disconnect();
    }
  },
);
