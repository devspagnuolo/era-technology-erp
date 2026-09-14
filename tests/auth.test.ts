import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import {
  ForbiddenException,
  UnauthorizedException,
  ExecutionContext,
} from "@nestjs/common";
import { AccessGuard, AuthRequest } from "../services/api/src/auth";
import { Database } from "../services/api/src/database";
import { productInput } from "../services/api/src/products";
const jwt = new JwtService({
  secret: "unit-test-secret-longer-than-thirty-two-characters",
});
function fixture(permissions: string[], sessionActive = true) {
  const handler = () => {};
  Reflect.defineMetadata("permission", "products:create", handler);
  const request = {
    headers: {
      authorization:
        "Bearer " +
        jwt.sign({ sub: "user-a", tenantId: "tenant-a", sid: "session-a" }),
      "x-tenant-id": "tenant-b",
    },
    body: { tenantId: "tenant-b" },
  } as unknown as AuthRequest;
  const context = {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  let where: unknown;
  const db = {
    session: {
      findFirst: async (query: { where: unknown }) => {
        where = query.where;
        return sessionActive
          ? {
              id: "session-a",
              tenantId: "tenant-a",
              userId: "user-a",
              user: { active: true, permissions },
            }
          : null;
      },
    },
  } as unknown as Database;
  return {
    guard: new AccessGuard(new Reflector(), jwt, db),
    request,
    context,
    where: () => where,
  };
}
test("tenant autenticado prevalece sobre tenant no header e no corpo", async () => {
  const f = fixture(["products:create"]);
  assert.equal(await f.guard.canActivate(f.context), true);
  assert.equal(f.request.principal.tenantId, "tenant-a");
  assert.equal((f.where() as { tenantId: string }).tenantId, "tenant-a");
});
test("sessão revogada impede uso de JWT ainda válido", async () => {
  const f = fixture(["products:create"], false);
  await assert.rejects(
    () => f.guard.canActivate(f.context),
    UnauthorizedException,
  );
});
test("permissões atuais do banco negam ação não autorizada", async () => {
  const f = fixture(["products:read"]);
  await assert.rejects(
    () => f.guard.canActivate(f.context),
    ForbiddenException,
  );
});
test("assinatura inválida impede acesso", async () => {
  const f = fixture(["products:create"]);
  f.request.headers.authorization =
    "Bearer " +
    new JwtService({ secret: "other-secret" }).sign({
      sub: "user-a",
      tenantId: "tenant-a",
      sid: "session-a",
    });
  await assert.rejects(
    () => f.guard.canActivate(f.context),
    UnauthorizedException,
  );
});
test("produto recusa valores negativos, precisão excessiva e nome vazio", () => {
  for (const salePrice of ["-1", "10.999", "Infinity", "1e8"])
    assert.equal(
      productInput.safeParse({ sku: "A", name: "Produto", salePrice }).success,
      false,
    );
  assert.equal(
    productInput.safeParse({ sku: "A", name: " ", salePrice: "10" }).success,
    false,
  );
});
test("campos protegidos não atravessam a validação do produto", () => {
  const input = productInput.parse({
    sku: "A",
    name: "Produto",
    salePrice: "10.00",
    tenantId: "tenant-b",
    active: false,
    id: "forged",
  });
  assert.equal("tenantId" in input, false);
  assert.equal("id" in input, false);
  assert.equal("active" in input, false);
  assert.equal(input.unit, "UN");
});
