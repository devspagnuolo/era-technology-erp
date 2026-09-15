import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { AppModule } from "../services/api/src/app.module";
import { Database } from "../services/api/src/database";
import { configureHttp } from "../services/api/src/http-config";
import { ExpressAdapter } from "../services/api/src/http-adapter";
test("módulos iniciam e rotas HTTP exigem sessão e permissão", async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "http-test-secret-with-at-least-32-characters";
  const whereQueries: unknown[] = [];
  const tx = {
    product: {
      findMany: async (query: { where: unknown }) => {
        whereQueries.push(query.where);
        return [{ id: "product-a", tenantId: "tenant-a", name: "Produto A" }];
      },
      count: async () => 1,
    },
  };
  const db = {
    $queryRaw: async () => [{ value: 1 }],
    $transaction: async (fn: (value: typeof tx) => unknown) => fn(tx),
    session: {
      findFirst: async () => ({
        id: "session-a",
        userId: "user-a",
        tenantId: "tenant-a",
        tenant: { active: true },
        user: { active: true, permissions: ["products:read"] },
      }),
    },
  };
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Database)
    .useValue(db)
    .compile();
  const app = module.createNestApplication(new ExpressAdapter());
  configureHttp(app, { NODE_ENV: "test" });
  try {
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    assert.equal((await fetch(base + "/v1/health")).status, 200);
    assert.equal((await fetch(base + "/v1/products")).status, 401);
    const token = module
      .get(JwtService)
      .sign({ sub: "user-a", tenantId: "tenant-a", sid: "session-a" });
    const headers = {
      Authorization: "Bearer " + token,
      "x-tenant-id": "tenant-b",
    };
    assert.equal((await fetch(base + "/v1/users", { headers })).status, 403);
    const products = await fetch(base + "/v1/products?tenantId=tenant-b", {
      headers,
    });
    assert.equal(products.status, 200);
    assert.equal((await products.json()).items[0].tenantId, "tenant-a");
    assert.equal(
      (whereQueries[0] as { tenantId: string }).tenantId,
      "tenant-a",
    );
  } finally {
    await app.close();
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
