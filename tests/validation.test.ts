import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { updateTenantInput } from "../services/api/src/core";
import { parse } from "../services/api/src/auth";
import { z } from "zod";
import { rolePresets } from "../packages/shared/permissions";
test("administrador não consegue suspender a própria empresa", () => {
  assert.equal(updateTenantInput.safeParse({ active: false }).success, false);
  assert.equal(
    updateTenantInput.safeParse({ settings: { currency: "BRL" } }).success,
    true,
  );
});
test("erro de validação traz mensagem legível para a interface", () => {
  try {
    parse(z.object({ salePrice: z.coerce.number() }), { salePrice: "abc" });
    assert.fail("deveria rejeitar");
  } catch (error) {
    assert.ok(error instanceof BadRequestException);
    const body = error.getResponse() as {
      message: string;
      fieldErrors: Record<string, string[]>;
    };
    assert.match(body.message, /^Dados inválidos em salePrice: /);
    assert.ok(body.fieldErrors.salePrice);
  }
});
test("perfis que cadastram produtos também podem editá-los", () => {
  for (const preset of Object.values(rolePresets))
    if (preset.permissions.includes("products:create"))
      assert.ok(preset.permissions.includes("products:update"));
});
