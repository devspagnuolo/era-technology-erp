import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { updateProductInput } from "../services/api/src/products";
import { updateTenantInput } from "../services/api/src/core";
import { parse } from "../services/api/src/auth";
import { rolePresets } from "../packages/shared/permissions";
test("edição de produto exige ao menos um campo e rejeita campos protegidos", () => {
  assert.equal(updateProductInput.safeParse({}).success, false);
  assert.equal(updateProductInput.safeParse({ active: false }).success, true);
  assert.equal(
    updateProductInput.safeParse({ salePrice: "12.30" }).success,
    true,
  );
  for (const body of [{ tenantId: "outra" }, { id: "x", name: "Produto" }])
    assert.equal(updateProductInput.safeParse(body).success, false);
  assert.equal(
    updateProductInput.safeParse({ salePrice: "-1" }).success,
    false,
  );
});
test("edição parcial não aplica a unidade padrão", () => {
  const parsed = updateProductInput.parse({ name: "Produto" });
  assert.equal(parsed.unit, undefined);
});
test("administrador não consegue suspender a própria empresa", () => {
  assert.equal(updateTenantInput.safeParse({ active: false }).success, false);
  assert.equal(
    updateTenantInput.safeParse({ settings: { currency: "BRL" } }).success,
    true,
  );
});
test("erro de validação traz mensagem legível para a interface", () => {
  try {
    parse(updateProductInput, { salePrice: "abc" });
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
