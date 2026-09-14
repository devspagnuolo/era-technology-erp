import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { ForbiddenException } from "@nestjs/common";
import {
  CoreService,
  CoreRepository,
  userInput,
} from "../services/api/src/core";
import { AuthRequest } from "../services/api/src/auth";
import { mayGrant, rolePresets } from "../packages/shared/permissions";
test("um gestor não pode criar um administrador com permissões superiores", async () => {
  const service = new CoreService({} as CoreRepository);
  const req = {
    principal: {
      tenantId: "a",
      userId: "u",
      permissions: rolePresets.MANAGER.permissions,
    },
  } as AuthRequest;
  await assert.rejects(
    () =>
      service.createUser(req, {
        name: "Pessoa",
        email: "pessoa@example.com",
        password: "senha-de-teste-123",
        role: "TENANT_ADMIN",
      }),
    ForbiddenException,
  );
});
test("usuário não pode desativar a própria conta", () => {
  const service = new CoreService({} as CoreRepository);
  const req = { principal: { userId: "u" } } as AuthRequest;
  assert.throws(
    () => service.setUserActive(req, "u", { active: false }),
    ForbiddenException,
  );
});
test("não aceita perfis herdados do prototype nem superadministrador global", () => {
  for (const role of ["toString", "__proto__", "SUPER_ADMIN"])
    assert.equal(
      userInput.safeParse({
        name: "Pessoa",
        email: "pessoa@example.com",
        password: "senha-de-teste-123",
        role,
      }).success,
      false,
    );
});
test("permissão de criar usuários não concede direito a todas as permissões", () => {
  assert.equal(mayGrant(["users:create"], ["products:create"]), false);
  assert.equal(
    mayGrant(["users:create", "products:read"], ["products:read"]),
    true,
  );
});
